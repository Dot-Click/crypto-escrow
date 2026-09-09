// Server-only. A limit order commits from_amount of from_crypto (held,
// same escrow-hold mechanism trades use) and fills automatically — via the
// cron sweep in fillEligibleLimitOrders — once the live rate reaches
// target_rate (to_crypto received per 1 from_crypto). No counterparty: like
// Swap, the platform is the other side, priced off the same market feed.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getMarketPrice } from "@/lib/market-price.server";
import { computeReceiveAmount } from "@/lib/pricing";
import { CRYPTO_TYPES, SWAP_FEE_PERCENT } from "@/lib/constants";

const SUPPORTED = new Set<string>(CRYPTO_TYPES.map((c) => c.code));

// Deliberately not imported from escrow.server.ts — sharing that module
// between this file and the cron route pulled in escrow.server.ts's own
// wide dependency tree, which triggered a production-only Rolldown
// circular-chunk bug ("__exportAll is not a function") the same way a
// shared Link between two route modules did earlier in this codebase. A
// duplicated 15-line helper is a small price for not fighting the bundler.
async function ensureWallet(userId: string, cryptoType: string) {
  const { data } = await supabaseAdmin
    .from("wallets")
    .select("id, balance, held_balance")
    .eq("user_id", userId)
    .eq("crypto_type", cryptoType)
    .maybeSingle();
  if (data) return { ...data, balance: Number(data.balance), held_balance: Number(data.held_balance) };

  const { data: created, error } = await supabaseAdmin
    .from("wallets")
    .insert({ user_id: userId, crypto_type: cryptoType })
    .select("id, balance, held_balance")
    .single();
  if (error) throw new Error(error.message);
  return { ...created, balance: Number(created.balance), held_balance: Number(created.held_balance) };
}

export async function createLimitOrder(params: {
  userId: string;
  fromCrypto: string;
  toCrypto: string;
  fromAmount: number;
  targetRate: number;
}) {
  if (!SUPPORTED.has(params.fromCrypto) || !SUPPORTED.has(params.toCrypto)) {
    throw new Error("Unsupported coin");
  }
  if (params.fromCrypto === params.toCrypto) throw new Error("Choose two different coins");
  if (!Number.isFinite(params.fromAmount) || params.fromAmount <= 0) throw new Error("Enter a valid amount");
  if (!Number.isFinite(params.targetRate) || params.targetRate <= 0) throw new Error("Enter a valid target rate");

  const wallet = await ensureWallet(params.userId, params.fromCrypto);
  if (wallet.balance < params.fromAmount) {
    throw new Error(`Not enough ${params.fromCrypto} available in your wallet.`);
  }

  const { data: held, error: holdErr } = await supabaseAdmin
    .from("wallets")
    .update({
      balance: wallet.balance - params.fromAmount,
      held_balance: wallet.held_balance + params.fromAmount,
    })
    .eq("id", wallet.id)
    .gte("balance", params.fromAmount)
    .select("id")
    .maybeSingle();
  if (holdErr) throw new Error(holdErr.message);
  if (!held) throw new Error("Your balance changed — try again.");

  const { data: order, error } = await supabaseAdmin
    .from("limit_orders")
    .insert({
      user_id: params.userId,
      from_crypto: params.fromCrypto,
      to_crypto: params.toCrypto,
      from_amount: params.fromAmount,
      target_rate: params.targetRate,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { orderId: order.id as string };
}

export async function cancelLimitOrder(params: { userId: string; orderId: string }) {
  const { data: order, error } = await supabaseAdmin
    .from("limit_orders")
    .select("id, user_id, from_crypto, from_amount, status")
    .eq("id", params.orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order || order.user_id !== params.userId) throw new Error("Order not found");
  if (order.status !== "open") throw new Error("Only open orders can be cancelled");

  const wallet = await ensureWallet(params.userId, order.from_crypto);
  await supabaseAdmin
    .from("wallets")
    .update({
      balance: wallet.balance + Number(order.from_amount),
      held_balance: Math.max(0, wallet.held_balance - Number(order.from_amount)),
    })
    .eq("id", wallet.id);

  await supabaseAdmin
    .from("limit_orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "open");

  return { cancelled: true };
}

export async function listMyLimitOrders(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("limit_orders")
    .select("id, from_crypto, to_crypto, from_amount, target_rate, status, filled_amount, created_at, filled_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data.map((o) => ({
    ...o,
    from_amount: Number(o.from_amount),
    target_rate: Number(o.target_rate),
    filled_amount: o.filled_amount != null ? Number(o.filled_amount) : null,
  }));
}

/** Called by the cron sweep — checks every open order against live prices
 * and fills whichever have crossed their target rate. One order's failure
 * (e.g. a balance-consistency race) is logged and skipped, not fatal to the
 * rest of the sweep. */
export async function fillEligibleLimitOrders() {
  const { data: orders, error } = await supabaseAdmin
    .from("limit_orders")
    .select("id, user_id, from_crypto, to_crypto, from_amount, target_rate")
    .eq("status", "open");
  if (error) throw new Error(error.message);

  let filled = 0;
  const priceCache = new Map<string, number>();
  const priceOf = async (code: string) => {
    if (!priceCache.has(code)) priceCache.set(code, await getMarketPrice(code));
    return priceCache.get(code)!;
  };

  for (const order of orders ?? []) {
    try {
      const fromAmount = Number(order.from_amount);
      const targetRate = Number(order.target_rate);
      const [fromPriceUsd, toPriceUsd] = await Promise.all([
        priceOf(order.from_crypto),
        priceOf(order.to_crypto),
      ]);
      const currentRate = fromPriceUsd / toPriceUsd;
      if (currentRate < targetRate) continue;

      const { netCrypto } = computeReceiveAmount(fromAmount * fromPriceUsd, toPriceUsd, SWAP_FEE_PERCENT);

      const fromWallet = await ensureWallet(order.user_id, order.from_crypto);
      const { data: debited } = await supabaseAdmin
        .from("wallets")
        .update({ held_balance: fromWallet.held_balance - fromAmount })
        .eq("id", fromWallet.id)
        .gte("held_balance", fromAmount)
        .select("id")
        .maybeSingle();
      if (!debited) continue; // held balance inconsistent — skip, don't fill

      const toWallet = await ensureWallet(order.user_id, order.to_crypto);
      await supabaseAdmin
        .from("wallets")
        .update({ balance: toWallet.balance + netCrypto })
        .eq("id", toWallet.id);

      await supabaseAdmin.from("transactions").insert([
        {
          wallet_id: fromWallet.id,
          user_id: order.user_id,
          type: "swap_out",
          amount: fromAmount,
          crypto_type: order.from_crypto,
          status: "completed",
        },
        {
          wallet_id: toWallet.id,
          user_id: order.user_id,
          type: "swap_in",
          amount: netCrypto,
          crypto_type: order.to_crypto,
          status: "completed",
        },
      ]);

      await supabaseAdmin
        .from("limit_orders")
        .update({ status: "filled", filled_amount: netCrypto, filled_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("status", "open");

      filled++;
    } catch (err) {
      console.error(`[limit-orders] failed to fill order ${order.id}`, err);
    }
  }

  return { checked: orders?.length ?? 0, filled };
}
