import { createFileRoute } from "@tanstack/react-router";

// BTCPay Store Webhook receiver. Signature-verified per BTCPay's own
// WebhookSender.cs (`BTCPay-Sig: sha256=<hex hmac>` of the raw body, keyed
// with the webhook secret) — see verifyBtcPaySignature in btcpay.server.ts.
//
// IMPORTANT — read before wiring this up in BTCPay's dashboard: BTCPay only
// fires webhook events for its own "Invoice" object (InvoiceSettled,
// InvoiceReceivedPayment, etc. — see WebhookEventType.cs in the BTCPay
// source). A raw Lightning-node invoice created via
// POST /lightning/BTC/invoices (what lightning-deposit.functions.ts
// actually uses, per this integration's spec) is NOT a BTCPay Invoice and
// never triggers any of these events. So with the current deposit flow,
// nothing will ever call this endpoint — crediting instead happens via the
// watch-lightning-deposits Edge Function (polling) and the manual
// recheckLightningDeposit server function, both of which check invoice
// status directly against the Lightning Node API.
//
// This route is still fully implemented and signature-verified in case you
// later add standard BTCPay Invoices (POST /stores/{storeId}/invoices) to
// this integration, or a plugin that re-emits Lightning events as
// InvoiceSettled — at that point, configure the webhook URL in BTCPay's
// Store Settings -> Webhooks, generate a secret there, and set it as
// BTCPAY_WEBHOOK_SECRET.
export const Route = createFileRoute("/api/public/webhooks/btcpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyBtcPaySignature } = await import("@/lib/btcpay.server");
        const valid = await verifyBtcPaySignature(raw, request.headers.get("BTCPay-Sig"));
        if (!valid) return new Response("Invalid signature", { status: 401 });

        let payload: { type?: string; invoiceId?: string; storeId?: string };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        // Nothing in the current Lightning deposit flow produces a
        // BTCPay Invoice, so there's no InvoiceSettled row to match against
        // yet. Logged for visibility if BTCPay ever does call this.
        console.log("[btcpay-webhook] received event (no-op — see route comment)", {
          type: payload.type,
          invoiceId: payload.invoiceId,
        });

        return new Response("ok");
      },
    },
  },
});
