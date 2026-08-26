import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CRYPTO_TYPES } from "@/lib/constants";

const CODES = CRYPTO_TYPES.map((c) => c.code) as readonly string[];

const NETWORK_TX_HASH_PATTERN = /^[a-zA-Z0-9]{10,120}$/;

/** Active master wallets grouped by coin, for the deposit dialog's network picker. */
export const getDepositNetworks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("master_wallets")
      .select("id, crypto_type, network, label, address, warning_message, min_confirmations")
      .eq("active", true)
      .order("crypto_type")
      .order("network");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const submitDepositClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cryptoType: string; network: string; amount: number; txHash: string }) => {
    if (!CODES.includes(input.cryptoType)) throw new Error("Unsupported coin");
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
    const txHash = String(input.txHash ?? "").trim();
    if (!NETWORK_TX_HASH_PATTERN.test(txHash)) throw new Error("Enter a valid transaction hash (TxID)");
    const network = String(input.network ?? "").trim();
    if (!network) throw new Error("Choose a network");
    return { cryptoType: input.cryptoType, network, amount, txHash };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    const { runVerificationAndMaybeCredit } = await import("@/lib/deposit-verification.server");

    await enforceRateLimit({
      userId: context.userId,
      action: "deposit_claim",
      limit: 8,
      windowSeconds: 3600,
    });

    const { data: masterWallet, error: mwErr } = await supabaseAdmin
      .from("master_wallets")
      .select("id")
      .eq("crypto_type", data.cryptoType)
      .eq("network", data.network)
      .eq("active", true)
      .maybeSingle();
    if (mwErr) throw new Error(mwErr.message);
    if (!masterWallet) throw new Error("This coin/network is not available for deposits right now");

    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from("wallets")
      .select("id")
      .eq("user_id", context.userId)
      .eq("crypto_type", data.cryptoType)
      .maybeSingle();
    if (walletErr) throw new Error(walletErr.message);
    if (!wallet) throw new Error("Wallet not found");

    const { data: claim, error: insertErr } = await supabaseAdmin
      .from("deposit_claims")
      .insert({
        user_id: context.userId,
        wallet_id: wallet.id,
        master_wallet_id: masterWallet.id,
        crypto_type: data.cryptoType,
        network: data.network,
        claimed_amount: data.amount,
        tx_hash: data.txHash,
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    return runVerificationAndMaybeCredit(claim.id);
  });

export const recheckDepositClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { claimId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.claimId)) throw new Error("Invalid claim id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    const { runVerificationAndMaybeCredit } = await import("@/lib/deposit-verification.server");

    await enforceRateLimit({
      userId: context.userId,
      action: "deposit_claim_recheck",
      limit: 20,
      windowSeconds: 3600,
    });

    const { data: claim, error } = await supabaseAdmin
      .from("deposit_claims")
      .select("*")
      .eq("id", data.claimId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!claim || claim.user_id !== context.userId) throw new Error("Claim not found");
    if (claim.status !== "pending") return claim;

    return runVerificationAndMaybeCredit(claim.id);
  });

export const listMyDepositClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("deposit_claims")
      .select(
        "id, crypto_type, network, claimed_amount, verified_amount, tx_hash, status, rejection_reason, confirmations, attempt_count, created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
