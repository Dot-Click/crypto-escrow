// Client-facing entry points for BTCPay Lightning Network BTC deposits.
// Separate system from the HD wallet's on-chain deposits — shares only the
// `wallets` / `transactions` tables so a Lightning deposit lands in the same
// BTC balance as an on-chain one.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MIN_SATS = 1_000; // dust floor — invoices below this aren't worth the routing fee
const MAX_SATS = 5_000_000; // ~0.05 BTC, a sane upper bound for a single LN payment
const INVOICE_EXPIRY_SECONDS = 900; // 15 minutes

async function getOrCreateBtcWallet(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("wallets")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("crypto_type", "BTC")
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabaseAdmin
    .from("wallets")
    .insert({ user_id: userId, crypto_type: "BTC", balance: 0, held_balance: 0 })
    .select("id, balance")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

export const createLightningDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amountSats: number }) => {
    const amountSats = Math.round(Number(input.amountSats));
    if (!Number.isFinite(amountSats) || amountSats < MIN_SATS) {
      throw new Error(`Enter at least ${MIN_SATS.toLocaleString()} sats`);
    }
    if (amountSats > MAX_SATS) {
      throw new Error(`Enter at most ${MAX_SATS.toLocaleString()} sats`);
    }
    return { amountSats };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    const { createLightningInvoice } = await import("@/lib/btcpay.server");

    await enforceRateLimit({
      userId: context.userId,
      action: "lightning_deposit",
      limit: 20,
      windowSeconds: 3600,
    });

    const wallet = await getOrCreateBtcWallet(context.userId);

    const invoice = await createLightningInvoice({
      amountSats: data.amountSats,
      description: `FOMN wallet deposit — user ${context.userId}`,
      expirySeconds: INVOICE_EXPIRY_SECONDS,
    });
    if (!invoice.bolt11) throw new Error("BTCPay did not return a Lightning invoice");

    const amountBtc = data.amountSats / 1e8;

    const { data: row, error } = await supabaseAdmin
      .from("lightning_deposit_invoices")
      .insert({
        user_id: context.userId,
        wallet_id: wallet.id,
        btcpay_invoice_id: invoice.id,
        payment_hash: invoice.paymentHash,
        bolt11: invoice.bolt11,
        amount_btc: amountBtc,
        status: "pending",
        expires_at: invoice.expiresAt,
      })
      .select("id, bolt11, amount_btc, expires_at, status")
      .single();
    if (error) throw new Error(error.message);

    return row;
  });

/**
 * Manual "check now" — same guarded pending->settled transition the
 * watch-lightning-deposits Edge Function uses, so a user isn't stuck
 * waiting up to a full poll cycle after paying. Safe to call repeatedly;
 * the WHERE status='pending' clause means only one caller ever wins the
 * credit, whichever (this or the poller) gets there first.
 */
export const recheckLightningDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.id)) throw new Error("Invalid id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getLightningInvoice } = await import("@/lib/btcpay.server");

    const { data: row, error } = await supabaseAdmin
      .from("lightning_deposit_invoices")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    if (row.status !== "pending") return row;

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from("lightning_deposit_invoices")
        .update({ status: "expired", last_checked_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");
      return { ...row, status: "expired" as const };
    }

    const invoice = await getLightningInvoice(row.btcpay_invoice_id);
    await supabaseAdmin
      .from("lightning_deposit_invoices")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", row.id);

    if (invoice.status !== "Settled") return row;

    // Atomic guard: only the caller that flips pending -> settled credits
    // the wallet. Either this request or the poller wins; never both.
    const { count } = await supabaseAdmin
      .from("lightning_deposit_invoices")
      .update({ status: "settled" }, { count: "exact" })
      .eq("id", row.id)
      .eq("status", "pending");
    if (!count) {
      const { data: fresh } = await supabaseAdmin
        .from("lightning_deposit_invoices")
        .select("*")
        .eq("id", row.id)
        .single();
      return fresh ?? row;
    }

    const { data: wallet, error: wErr } = await supabaseAdmin
      .from("wallets")
      .select("id, balance")
      .eq("id", row.wallet_id)
      .single();
    if (wErr) throw new Error(wErr.message);

    const { data: tx, error: txErr } = await supabaseAdmin
      .from("transactions")
      .insert({
        wallet_id: row.wallet_id,
        user_id: context.userId,
        type: "deposit",
        amount: row.amount_btc,
        crypto_type: "BTC",
        external_tx_hash: invoice.paymentHash,
        external_address: `lightning:${row.btcpay_invoice_id}`,
        status: "completed",
      })
      .select("id")
      .single();
    if (txErr) throw new Error(txErr.message);

    await supabaseAdmin
      .from("wallets")
      .update({ balance: Number(wallet.balance) + Number(row.amount_btc) })
      .eq("id", wallet.id);

    const { data: settled } = await supabaseAdmin
      .from("lightning_deposit_invoices")
      .update({ transaction_id: tx.id })
      .eq("id", row.id)
      .select("*")
      .single();

    return settled ?? { ...row, status: "settled" as const, transaction_id: tx.id };
  });

export const listMyLightningDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("lightning_deposit_invoices")
      .select("id, bolt11, amount_btc, status, expires_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
