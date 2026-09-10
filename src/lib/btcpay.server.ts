// Server-only thin client for BTCPay Server's Greenfield Lightning Network
// API, scoped to this store's node. Verified directly against BTCPay's
// source (GreenfieldLightningNodeApiController.Store.cs,
// CreateLightningInvoiceRequest.cs, LightningInvoiceData.cs) rather than
// docs prose, since the Greenfield API has drifted across versions before.
//
// Endpoint:   POST /api/v1/stores/{storeId}/lightning/BTC/invoices
// Auth:       Authorization: token <BTCPAY_API_KEY>
// Amount:     sent as a STRING of millisatoshis (not BTC, not sats) — this
//             is a real BTCPay quirk (LightMoneyJsonConverter.WriteJson).
// Response:   BOLT11 field name is literally "BOLT11" (all-caps), not
//             camelCase — deliberately annotated that way server-side.
//
// This is a completely separate system from the HD wallet (on-chain
// BTC/LTC/ETH/USDT-BEP20) — no shared code, no shared tables.

function btcpayEnv() {
  const host = process.env["BTCPAY_HOST"];
  const storeId = process.env["BTCPAY_STORE_ID"];
  const apiKey = process.env["BTCPAY_API_KEY"];
  if (!host || !storeId || !apiKey) {
    throw new Error("BTCPay is not configured: set BTCPAY_HOST, BTCPAY_STORE_ID, BTCPAY_API_KEY.");
  }
  return { host: host.replace(/\/$/, ""), storeId, apiKey };
}

export type LightningInvoice = {
  id: string;
  status: "Unpaid" | "Paid" | "Settled" | "Expired" | "Processing" | string;
  bolt11: string;
  paymentHash: string | null;
  expiresAt: string;
  amountMsat: string;
  amountReceivedMsat: string | null;
};

function parseInvoice(raw: unknown): LightningInvoice {
  const d = raw as Record<string, unknown>;
  return {
    id: String(d["id"] ?? ""),
    status: String(d["status"] ?? "Unpaid"),
    bolt11: String(d["BOLT11"] ?? ""),
    paymentHash: d["paymentHash"] ? String(d["paymentHash"]) : null,
    expiresAt: new Date(Number(d["expiresAt"]) * 1000).toISOString(),
    amountMsat: String(d["amount"] ?? "0"),
    amountReceivedMsat: d["amountReceived"] != null ? String(d["amountReceived"]) : null,
  };
}

/** Creates a standalone Lightning invoice directly against the store's node. */
export async function createLightningInvoice(params: {
  amountSats: number;
  description: string;
  expirySeconds?: number;
}): Promise<LightningInvoice> {
  const { host, storeId, apiKey } = btcpayEnv();
  const amountMsat = Math.round(params.amountSats * 1000);

  const res = await fetch(`${host}/api/v1/stores/${storeId}/lightning/BTC/invoices`, {
    method: "POST",
    headers: {
      Authorization: `token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(amountMsat),
      description: params.description,
      expiry: params.expirySeconds ?? 900,
      privateRouteHints: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BTCPay invoice creation failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return parseInvoice(await res.json());
}

/**
 * Pays an arbitrary BOLT11 invoice out of the store's Lightning node — the
 * outbound counterpart to createLightningInvoice, added for wallet
 * withdrawals. Endpoint: POST /lightning/BTC/invoices/pay
 * (GreenfieldLightningNodeApiController.Store.cs's Pay action), body
 * `{ BOLT11, maxFeePercent, sendTimeout }` per PayLightningInvoiceRequest.cs.
 *
 * Requires the API key to carry the "Manage your store's Lightning node"
 * permission — a materially more sensitive grant than the "create/view
 * invoices" permission the deposit side uses, since it authorizes moving
 * funds out. Use a separate, narrowly-scoped key for this if possible.
 *
 * BTCPay settles a Lightning payment synchronously within the request (or
 * fails outright) — there is no "pending, check back later" state to poll,
 * unlike invoice creation.
 */
export async function payLightningInvoice(params: {
  bolt11: string;
  maxFeePercent?: number;
}): Promise<{ ok: true }> {
  const { host, storeId, apiKey } = btcpayEnv();

  const res = await fetch(`${host}/api/v1/stores/${storeId}/lightning/BTC/invoices/pay`, {
    method: "POST",
    headers: {
      Authorization: `token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BOLT11: params.bolt11,
      maxFeePercent: params.maxFeePercent ?? 3,
      sendTimeout: 60,
    }),
    // Real Lightning payment attempts can legitimately take longer than the
    // 15s timeout used for invoice creation/lookup above.
    signal: AbortSignal.timeout(65_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BTCPay Lightning payment failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return { ok: true };
}

/** Fetches the current status of a previously created Lightning invoice. */
export async function getLightningInvoice(invoiceId: string): Promise<LightningInvoice> {
  const { host, storeId, apiKey } = btcpayEnv();

  const res = await fetch(`${host}/api/v1/stores/${storeId}/lightning/BTC/invoices/${encodeURIComponent(invoiceId)}`, {
    headers: { Authorization: `token ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`BTCPay invoice lookup failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return parseInvoice(await res.json());
}

/**
 * Verifies a BTCPay Store Webhook's `BTCPay-Sig` header: `sha256=<hex hmac>`
 * of the raw request body, keyed with the webhook secret. Confirmed against
 * BTCPay's own WebhookSender.cs. NOTE: this only applies to BTCPay's
 * standard "Invoice" object events — a raw Lightning-node invoice (as
 * created above) never triggers a webhook call at all. See
 * src/routes/api/public/webhooks/btcpay.tsx for the full explanation.
 */
export async function verifyBtcPaySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const secret = process.env["BTCPAY_WEBHOOK_SECRET"];
  if (!secret || !signatureHeader) return false;

  const match = /^sha256=([0-9a-f]+)$/i.exec(signatureHeader.trim());
  if (!match || !match[1]) return false;
  const expectedHex = match[1].toLowerCase();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actualHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}
