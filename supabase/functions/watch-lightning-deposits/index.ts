// BTCPay Lightning deposit watcher — polls pending invoices and credits on
// settlement. Runs from pg_cron every minute, same cadence as the HD
// wallet's watch-deposits, but this is a fully separate system: it never
// touches user_deposit_addresses, master_wallets, or any HD-wallet secret.
// It only reads/writes lightning_deposit_invoices + wallets + transactions.
//
// Why a poller and not a webhook: BTCPay's Store Webhooks only fire for its
// own "Invoice" object (InvoiceSettled etc.). A standalone Lightning-node
// invoice, created via POST /lightning/BTC/invoices (what this deposit flow
// uses), is not a BTCPay Invoice and never triggers a webhook event. Polling
// GET /lightning/BTC/invoices/{id} is the only way to observe settlement for
// this kind of invoice. See src/lib/btcpay.server.ts and
// src/routes/api/public/webhooks/btcpay.tsx for the full explanation.

import { getAdminDb, requireCronSecret } from "../_shared/db.ts";

type LightningInvoice = {
  id: string;
  status: string;
  paymentHash: string | null;
};

function btcpayEnv() {
  const host = Deno.env.get("BTCPAY_HOST");
  const storeId = Deno.env.get("BTCPAY_STORE_ID");
  const apiKey = Deno.env.get("BTCPAY_API_KEY");
  if (!host || !storeId || !apiKey) {
    throw new Error("BTCPay secrets not configured: set BTCPAY_HOST, BTCPAY_STORE_ID, BTCPAY_API_KEY.");
  }
  return { host: host.replace(/\/$/, ""), storeId, apiKey };
}

async function getInvoiceStatus(invoiceId: string): Promise<LightningInvoice> {
  const { host, storeId, apiKey } = btcpayEnv();
  const res = await fetch(`${host}/api/v1/stores/${storeId}/lightning/BTC/invoices/${encodeURIComponent(invoiceId)}`, {
    headers: { Authorization: `token ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`BTCPay lookup failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const d = (await res.json()) as Record<string, unknown>;
  return {
    id: String(d["id"] ?? invoiceId),
    status: String(d["status"] ?? "Unpaid"),
    paymentHash: d["paymentHash"] ? String(d["paymentHash"]) : null,
  };
}

Deno.serve(async (req) => {
  try {
    requireCronSecret(req);
  } catch (r) {
    if (r instanceof Response) return r;
    throw r;
  }

  const db = getAdminDb();
  const now = new Date().toISOString();

  const { data: pending, error } = await db
    .from("lightning_deposit_invoices")
    .select("id, wallet_id, user_id, btcpay_invoice_id, amount_btc, expires_at, status")
    .eq("status", "pending")
    .limit(200);
  if (error) return json({ ok: false, error: error.message }, 500);

  let checked = 0;
  let credited = 0;
  let expired = 0;

  for (const row of pending ?? []) {
    checked++;
    try {
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await db
          .from("lightning_deposit_invoices")
          .update({ status: "expired", last_checked_at: now })
          .eq("id", row.id)
          .eq("status", "pending");
        expired++;
        continue;
      }

      const invoice = await getInvoiceStatus(row.btcpay_invoice_id);
      await db.from("lightning_deposit_invoices").update({ last_checked_at: now }).eq("id", row.id);

      if (invoice.status !== "Settled") continue;

      // Atomic guard, same as the manual recheck server function: whichever
      // caller flips pending -> settled first is the one that credits.
      const { count } = await db
        .from("lightning_deposit_invoices")
        .update({ status: "settled" }, { count: "exact" })
        .eq("id", row.id)
        .eq("status", "pending");
      if (!count) continue; // recheckLightningDeposit beat us to it

      const { data: wallet, error: wErr } = await db
        .from("wallets")
        .select("id, balance")
        .eq("id", row.wallet_id)
        .single();
      if (wErr) throw new Error(wErr.message);

      const { data: tx, error: txErr } = await db
        .from("transactions")
        .insert({
          wallet_id: row.wallet_id,
          user_id: row.user_id,
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

      await db
        .from("wallets")
        .update({ balance: Number(wallet.balance) + Number(row.amount_btc) })
        .eq("id", wallet.id);

      await db.from("lightning_deposit_invoices").update({ transaction_id: tx.id }).eq("id", row.id);

      credited++;
    } catch (err) {
      console.error(`[watch-lightning-deposits] row ${row.id} failed`, err);
    }
  }

  return json({ ok: true, checked, credited, expired });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
