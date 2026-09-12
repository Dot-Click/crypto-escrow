// Server-only. Instant crypto-to-crypto conversion — an internal ledger
// move between two of a user's own wallets, priced off the same live
// market feed listings use. No counterparty, no escrow: the platform is
// the other side of the trade, same as how a centralized exchange's
// "convert" feature works.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getMarketPrice } from "@/lib/market-price.server";
import { computeReceiveAmount } from "@/lib/pricing";
import { CRYPTO_TYPES, SWAP_FEE_PERCENT } from "@/lib/constants";

const SUPPORTED = new Set<string>(CRYPTO_TYPES.map((c) => c.code));

// Deliberately not imported from escrow.server.ts — see the matching note in
// limit-orders.server.ts. Sharing that module triggered a production-only
// Rolldown circular-chunk bug.
async function ensureWallet(userId: string, cryptoType: string) {
  const { data } = await supabaseAdmin
    .from("wallets")
    .select("id, balance, held_balance, swap_locked_balance")
    .eq("user_id", userId)
    .eq("crypto_type", cryptoType)
    .maybeSingle();
  if (data) {
    return {
      ...data,
      balance: Number(data.balance),
      held_balance: Number(data.held_balance),
      swap_locked_balance: Number(data.swap_locked_balance),
    };
  }

  const { data: created, error } = await supabaseAdmin
    .from("wallets")
    .insert({ user_id: userId, crypto_type: cryptoType })
    .select("id, balance, held_balance, swap_locked_balance")
    .single();
  if (error) throw new Error(error.message);
  return {
    ...created,
    balance: Number(created.balance),
    held_balance: Number(created.held_balance),
    swap_locked_balance: Number(created.swap_locked_balance),
  };
}

export async function getSwapQuote(fromCrypto: string, toCrypto: string, fromAmount: number) {
  if (!SUPPORTED.has(fromCrypto) || !SUPPORTED.has(toCrypto)) throw new Error("Unsupported coin");
  if (fromCrypto === toCrypto) throw new Error("Choose two different coins");
  if (!Number.isFinite(fromAmount) || fromAmount <= 0) throw new Error("Enter a valid amount");

  const [fromPriceUsd, toPriceUsd] = await Promise.all([
    getMarketPrice(fromCrypto),
    getMarketPrice(toCrypto),
  ]);
  const rate = fromPriceUsd / toPriceUsd; // how much toCrypto 1 fromCrypto buys, before fee
  const usdValue = fromAmount * fromPriceUsd;
  const { netCrypto } = computeReceiveAmount(usdValue, toPriceUsd, SWAP_FEE_PERCENT);
  return { rate, toAmount: netCrypto, feePercent: SWAP_FEE_PERCENT };
}

export async function executeSwap(params: {
  userId: string;
  fromCrypto: string;
  toCrypto: string;
  fromAmount: number;
}) {
  const quote = await getSwapQuote(params.fromCrypto, params.toCrypto, params.fromAmount);

  const fromWallet = await ensureWallet(params.userId, params.fromCrypto);
  if (fromWallet.balance < params.fromAmount) {
    throw new Error(`Not enough ${params.fromCrypto} available in your wallet.`);
  }

  // Conditional debit — only succeeds while the free balance still covers
  // it, same guard openTrade uses for escrow holds. Spending draws down any
  // swap-restricted portion of this wallet first (floored at 0) — trading
  // is exactly what that restriction permits.
  const { data: debited, error: debitErr } = await supabaseAdmin
    .from("wallets")
    .update({
      balance: fromWallet.balance - params.fromAmount,
      swap_locked_balance: Math.max(0, fromWallet.swap_locked_balance - params.fromAmount),
    })
    .eq("id", fromWallet.id)
    .gte("balance", params.fromAmount)
    .select("id")
    .maybeSingle();
  if (debitErr) throw new Error(debitErr.message);
  if (!debited) throw new Error("Your balance changed — try again.");

  // The received side is entirely swap-derived, so fully restricted from
  // withdrawal — see requestWithdrawal in wallet.functions.ts.
  const toWallet = await ensureWallet(params.userId, params.toCrypto);
  const { error: creditErr } = await supabaseAdmin
    .from("wallets")
    .update({
      balance: toWallet.balance + quote.toAmount,
      swap_locked_balance: toWallet.swap_locked_balance + quote.toAmount,
    })
    .eq("id", toWallet.id);
  if (creditErr) throw new Error(creditErr.message);

  await supabaseAdmin.from("transactions").insert([
    {
      wallet_id: fromWallet.id,
      user_id: params.userId,
      type: "swap_out",
      amount: params.fromAmount,
      crypto_type: params.fromCrypto,
      status: "completed",
    },
    {
      wallet_id: toWallet.id,
      user_id: params.userId,
      type: "swap_in",
      amount: quote.toAmount,
      crypto_type: params.toCrypto,
      status: "completed",
    },
  ]);

  return { toAmount: quote.toAmount, rate: quote.rate };
}
