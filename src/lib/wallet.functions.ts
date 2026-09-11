import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CRYPTO_TYPES, WITHDRAWAL_FIXED_FEE } from "@/lib/constants";
import {
  cryptoToNetwork,
  currentNetworkEnv,
  resolveUsdtNetwork,
  withdrawalError,
  withdrawalNetworkLabel,
  type UsdtNetworkChoice,
} from "@/lib/withdrawal-validation";

const CODES = CRYPTO_TYPES.map((c) => c.code) as readonly string[];

/** Ensures a wallet row exists per supported coin, then returns balances + ledger. */
export const getWalletOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    await supabaseAdmin
      .from("wallets")
      .upsert(
        CODES.map((crypto_type) => ({ user_id: userId, crypto_type })),
        { onConflict: "user_id,crypto_type", ignoreDuplicates: true },
      );

    const [{ data: wallets }, { data: txs }] = await Promise.all([
      supabaseAdmin
        .from("wallets")
        .select("id, crypto_type, balance, held_balance")
        .eq("user_id", userId)
        .order("crypto_type"),
      supabaseAdmin
        .from("transactions")
        .select("id, type, amount, crypto_type, status, external_address, external_tx_hash, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      wallets: (wallets ?? []).map((w) => ({
        ...w,
        balance: Number(w.balance),
        held_balance: Number(w.held_balance),
      })),
      transactions: (txs ?? []).map((t) => ({ ...t, amount: Number(t.amount) })),
    };
  });

/**
 * Queue an outbound withdrawal. Debits the user's wallet immediately and
 * inserts a pending `withdrawals` row for the broadcast-withdrawals Edge
 * Function to pick up. On broadcast failure the balance is refunded by
 * the broadcaster.
 */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    cryptoType: string;
    amount: number;
    address: string;
    network?: UsdtNetworkChoice;
    stepUpCode?: string;
  }) => {
    if (!CODES.includes(input.cryptoType)) throw new Error("Unsupported coin");
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
    const address = String(input.address ?? "").trim();
    const network = input.cryptoType === "USDT" ? input.network : undefined;
    const env = currentNetworkEnv();
    const resolvedNetwork = input.cryptoType === "USDT" ? resolveUsdtNetwork(network, env) : cryptoToNetwork(input.cryptoType, env);
    const err = withdrawalError(input.cryptoType, amount, address, env, resolvedNetwork);
    if (err) throw new Error(err);
    return { cryptoType: input.cryptoType, amount, address, network, stepUpCode: input.stepUpCode };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");

    await enforceRateLimit({
      userId: context.userId,
      action: "withdrawal",
      limit: 5,
      windowSeconds: 3600,
    });

    const { data: securityProfile, error: secErr } = await supabaseAdmin
      .from("profiles")
      .select("withdrawal_verification")
      .eq("id", context.userId)
      .single();
    if (secErr) throw new Error(secErr.message);

    const { requireStepUp } = await import("@/lib/step-up.server");
    await requireStepUp({
      supabase: context.supabase,
      userId: context.userId,
      purpose: "withdrawal",
      method: securityProfile.withdrawal_verification as "none" | "email" | "totp",
      code: data.stepUpCode ?? null,
    });

    const { data: wallet, error } = await supabaseAdmin
      .from("wallets")
      .select("id, balance, held_balance")
      .eq("user_id", context.userId)
      .eq("crypto_type", data.cryptoType)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wallet) throw new Error("Wallet not found");

    const available = Number(wallet.balance) - Number(wallet.held_balance);
    if (data.amount > available) {
      throw new Error(`Available balance is ${available} ${data.cryptoType}`);
    }

    // Fixed platform fee, in the coin's own unit — deducted from the amount
    // actually broadcast, not charged on top of what the user requested.
    const networkLabel = withdrawalNetworkLabel(data.cryptoType, data.network);
    const fee = (networkLabel && WITHDRAWAL_FIXED_FEE[`${data.cryptoType}:${networkLabel}`]) || 0;
    if (data.amount <= fee) {
      throw new Error(`Amount must exceed the ${fee} ${data.cryptoType} network fee`);
    }
    const netAmount = data.amount - fee;

    // Optimistic debit — a concurrent request will fail the CAS on `balance`
    // and never both drain the same balance.
    const { error: debitError, count } = await supabaseAdmin
      .from("wallets")
      .update({ balance: Number(wallet.balance) - data.amount }, { count: "exact" })
      .eq("id", wallet.id)
      .eq("balance", wallet.balance);
    if (debitError) throw new Error(debitError.message);
    if (count === 0) throw new Error("Balance changed while submitting — try again.");

    const network =
      data.cryptoType === "USDT" ? resolveUsdtNetwork(data.network) : cryptoToNetwork(data.cryptoType);

    const { data: tx, error: txErr } = await supabaseAdmin
      .from("transactions")
      .insert({
        wallet_id: wallet.id,
        user_id: context.userId,
        type: "withdrawal",
        amount: data.amount,
        crypto_type: data.cryptoType,
        external_address: data.address,
        status: "pending",
      })
      .select("id")
      .single();
    if (txErr) {
      await supabaseAdmin.from("wallets").update({ balance: Number(wallet.balance) }).eq("id", wallet.id);
      throw new Error(txErr.message);
    }

    const { error: wErr } = await supabaseAdmin.from("withdrawals").insert({
      user_id: context.userId,
      wallet_id: wallet.id,
      transaction_id: tx.id,
      crypto_type: data.cryptoType,
      network,
      destination_address: data.address,
      amount: netAmount,
      status: "pending",
    });
    if (wErr) {
      await supabaseAdmin.from("wallets").update({ balance: Number(wallet.balance) }).eq("id", wallet.id);
      await supabaseAdmin.from("transactions").update({ status: "failed" }).eq("id", tx.id);
      throw new Error(wErr.message);
    }

    return { ok: true as const, queued: true };
  });
