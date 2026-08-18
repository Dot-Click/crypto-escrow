import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/nowpayments/deposit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyIpnSignature } = await import("@/lib/nowpayments.server");
        if (!verifyIpnSignature(raw, request.headers.get("x-nowpayments-sig"))) {
          return new Response("Invalid signature", { status: 401 });
        }

        const payload = JSON.parse(raw) as {
          payment_id?: string | number;
          payment_status?: string;
          order_id?: string;
          pay_currency?: string;
          actually_paid?: number | string;
          pay_amount?: number | string;
          payin_hash?: string;
        };

        const finished = payload.payment_status === "finished" || payload.payment_status === "confirmed";
        if (!finished) return new Response("ignored");

        const walletId = payload.order_id;
        const amount = Number(payload.actually_paid ?? payload.pay_amount ?? 0);
        if (!walletId || !Number.isFinite(amount) || amount <= 0) {
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const providerPaymentId = payload.payment_id ? `dep_${payload.payment_id}` : null;

        const { data: wallet } = await supabaseAdmin
          .from("wallets")
          .select("id, user_id, crypto_type, balance")
          .eq("id", walletId)
          .maybeSingle();
        if (!wallet) return new Response("Unknown wallet", { status: 404 });

        // Idempotency: the unique provider_payment_id index rejects replays.
        const { error: ledgerError } = await supabaseAdmin.from("transactions").insert({
          wallet_id: wallet.id,
          user_id: wallet.user_id,
          type: "deposit",
          amount,
          crypto_type: wallet.crypto_type,
          status: "completed",
          external_tx_hash: payload.payin_hash ?? null,
          provider_payment_id: providerPaymentId,
          provider_payload: payload,
        });
        if (ledgerError) {
          if (ledgerError.code === "23505") return new Response("duplicate");
          console.error("[nowpayments deposit] ledger error", ledgerError);
          return new Response("Ledger error", { status: 500 });
        }

        await supabaseAdmin
          .from("wallets")
          .update({ balance: Number(wallet.balance) + amount })
          .eq("id", wallet.id);

        return new Response("ok");
      },
    },
  },
});
