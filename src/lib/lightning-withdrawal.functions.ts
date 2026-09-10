// Client-facing entry point for BTCPay Lightning Network BTC withdrawals —
// the outbound counterpart to lightning-deposit.functions.ts. Fully separate
// from the on-chain HD-wallet withdrawal pipeline (wallet.functions.ts /
// broadcast-withdrawals): a Lightning payment settles synchronously within
// this request via BTCPay, there's no `withdrawals` row, no broadcaster, no
// confirmation polling.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WITHDRAWAL_FIXED_FEE } from "@/lib/constants";
import { parseLightningDestination } from "@/lib/withdrawal-validation";

const MIN_SATS = 1_000; // dust floor — same as the deposit side
const MAX_SATS = 5_000_000; // ~0.05 BTC, a sane upper bound for a single LN payment
const FIXED_FEE_BTC = WITHDRAWAL_FIXED_FEE["BTC:LIGHTNING"] ?? 0;

/**
 * Resolves a Lightning Address (user@domain) to a one-off BOLT11 invoice via
 * LNURL-pay (LUD-06/16) — BTCPay's pay endpoint only accepts a bolt11, not an
 * address, so this always runs before payLightningInvoice for that input shape.
 */
async function resolveLightningAddressToInvoice(address: string, amountSats: number): Promise<string> {
  const [name, domain] = address.split("@");
  if (!name || !domain) throw new Error("Invalid Lightning Address");

  const metaRes = await fetch(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!metaRes.ok) throw new Error("Could not reach that Lightning Address");
  const meta = (await metaRes.json()) as {
    tag?: string;
    callback?: string;
    minSendable?: number;
    maxSendable?: number;
  };
  if (meta.tag !== "payRequest" || !meta.callback) throw new Error("That address doesn't support LNURL-pay");

  const amountMsat = amountSats * 1000;
  if (meta.minSendable != null && amountMsat < meta.minSendable) {
    throw new Error(`Minimum for this address is ${Math.ceil(meta.minSendable / 1000)} sats`);
  }
  if (meta.maxSendable != null && amountMsat > meta.maxSendable) {
    throw new Error(`Maximum for this address is ${Math.floor(meta.maxSendable / 1000)} sats`);
  }

  const sep = meta.callback.includes("?") ? "&" : "?";
  const cbRes = await fetch(`${meta.callback}${sep}amount=${amountMsat}`, { signal: AbortSignal.timeout(10_000) });
  if (!cbRes.ok) throw new Error("That Lightning Address did not return an invoice");
  const cb = (await cbRes.json()) as { pr?: string };
  if (!cb.pr) throw new Error("That Lightning Address did not return an invoice");
  return cb.pr;
}

export const requestLightningWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amountSats: number; destination: string; stepUpCode?: string }) => {
    const amountSats = Math.round(Number(input.amountSats));
    if (!Number.isFinite(amountSats) || amountSats < MIN_SATS) {
      throw new Error(`Enter at least ${MIN_SATS.toLocaleString()} sats`);
    }
    if (amountSats > MAX_SATS) throw new Error(`Enter at most ${MAX_SATS.toLocaleString()} sats`);
    const destination = parseLightningDestination(String(input.destination ?? ""));
    if (!destination) throw new Error("Enter a valid Lightning invoice or Lightning Address");
    return { amountSats, destination, stepUpCode: input.stepUpCode };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    const { requireStepUp } = await import("@/lib/step-up.server");
    const { payLightningInvoice } = await import("@/lib/btcpay.server");

    await enforceRateLimit({
      userId: context.userId,
      action: "lightning_withdrawal",
      limit: 5,
      windowSeconds: 3600,
    });

    const { data: securityProfile, error: secErr } = await supabaseAdmin
      .from("profiles")
      .select("withdrawal_verification")
      .eq("id", context.userId)
      .single();
    if (secErr) throw new Error(secErr.message);

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
      .eq("crypto_type", "BTC")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wallet) throw new Error("Wallet not found");

    const amountBtc = data.amountSats / 1e8;
    const available = Number(wallet.balance) - Number(wallet.held_balance);
    if (amountBtc > available) throw new Error(`Available balance is ${available} BTC`);
    if (amountBtc <= FIXED_FEE_BTC) {
      throw new Error(`Amount must exceed the ${FIXED_FEE_BTC} BTC network fee`);
    }

    // Optimistic debit — a concurrent request will fail the CAS on `balance`
    // and never both drain the same balance. Refunded below if the payment
    // doesn't go through.
    const { error: debitError, count } = await supabaseAdmin
      .from("wallets")
      .update({ balance: Number(wallet.balance) - amountBtc }, { count: "exact" })
      .eq("id", wallet.id)
      .eq("balance", wallet.balance);
    if (debitError) throw new Error(debitError.message);
    if (count === 0) throw new Error("Balance changed while submitting — try again.");

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("lightning_withdrawals")
      .insert({
        user_id: context.userId,
        wallet_id: wallet.id,
        bolt11: data.destination.kind === "bolt11" ? data.destination.value : "",
        amount_btc: amountBtc,
        fee_btc: FIXED_FEE_BTC,
        status: "pending",
      })
      .select("id")
      .single();
    if (rowErr) {
      await supabaseAdmin.from("wallets").update({ balance: Number(wallet.balance) }).eq("id", wallet.id);
      throw new Error(rowErr.message);
    }

    try {
      const bolt11 =
        data.destination.kind === "address"
          ? await resolveLightningAddressToInvoice(data.destination.value, data.amountSats)
          : data.destination.value;
      if (data.destination.kind === "address") {
        await supabaseAdmin.from("lightning_withdrawals").update({ bolt11 }).eq("id", row.id);
      }

      await payLightningInvoice({ bolt11 });

      await supabaseAdmin.from("lightning_withdrawals").update({ status: "paid" }).eq("id", row.id);
      await supabaseAdmin.from("transactions").insert({
        wallet_id: wallet.id,
        user_id: context.userId,
        type: "withdrawal",
        amount: amountBtc,
        crypto_type: "BTC",
        external_address: `lightning:${row.id}`,
        status: "completed",
      });

      return { ok: true as const, id: row.id };
    } catch (e) {
      // The debit already happened but the payment never went out — refund it.
      await supabaseAdmin.from("wallets").update({ balance: Number(wallet.balance) }).eq("id", wallet.id);
      await supabaseAdmin
        .from("lightning_withdrawals")
        .update({ status: "failed", error_message: e instanceof Error ? e.message : String(e) })
        .eq("id", row.id);
      throw e instanceof Error ? e : new Error("Lightning payment failed");
    }
  });

export const listMyLightningWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("lightning_withdrawals")
      .select("id, amount_btc, fee_btc, status, error_message, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
