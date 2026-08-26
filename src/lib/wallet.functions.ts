import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CRYPTO_TYPES } from "@/lib/constants";

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
      providerConfigured: !!process.env["NOWPAYMENTS_API_KEY"],
    };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cryptoType: string; amount: number; address: string }) => {
    if (!CODES.includes(input.cryptoType)) throw new Error("Unsupported coin");
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
    const address = String(input.address ?? "").trim();
    if (address.length < 12 || address.length > 120) throw new Error("Enter a valid wallet address");
    return { cryptoType: input.cryptoType, amount, address };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    const { createPayout } = await import("@/lib/nowpayments.server");

    await enforceRateLimit({
      userId: context.userId,
      action: "withdrawal",
      limit: 5,
      windowSeconds: 3600,
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

    // Debit first so a concurrent request cannot double-spend the same balance.
    const { error: debitError } = await supabaseAdmin
      .from("wallets")
      .update({ balance: Number(wallet.balance) - data.amount })
      .eq("id", wallet.id)
      .eq("balance", wallet.balance);
    if (debitError) throw new Error(debitError.message);

    let providerPayoutId: string | null = null;
    let simulated = false;
    try {
      const payout = await createPayout({
        cryptoType: data.cryptoType,
        amount: data.amount,
        address: data.address,
      });
      providerPayoutId = payout.providerPayoutId;
      simulated = payout.simulated;
    } catch (e) {
      // Refund on provider failure, then surface a clean message.
      await supabaseAdmin
        .from("wallets")
        .update({ balance: Number(wallet.balance) })
        .eq("id", wallet.id);
      console.error("[withdrawal] provider error", e);
      throw new Error("Withdrawal could not be submitted right now. Your balance was not changed.");
    }

    await supabaseAdmin.from("transactions").insert({
      wallet_id: wallet.id,
      user_id: context.userId,
      type: "withdrawal",
      amount: data.amount,
      crypto_type: data.cryptoType,
      external_address: data.address,
      status: "pending",
      provider_payment_id: providerPayoutId,
    });

    return { ok: true as const, pendingManualReview: simulated };
  });
