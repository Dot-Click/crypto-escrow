import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/nowpayments/deposit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        // TEMP DEBUG LOGGING — remove once webhook delivery is confirmed working end-to-end.
        console.log("[nowpayments deposit] webhook received", {
          at: new Date().toISOString(),
          headers: {
            "x-nowpayments-sig": request.headers.get("x-nowpayments-sig"),
            "content-type": request.headers.get("content-type"),
          },
          body: raw,
        });

        const { verifyIpnSignature } = await import("@/lib/nowpayments.server");
        if (!verifyIpnSignature(raw, request.headers.get("x-nowpayments-sig"))) {
          console.log("[nowpayments deposit] REJECTED — invalid or missing signature");
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
        if (!finished) {
          console.log("[nowpayments deposit] IGNORED — status not finished/confirmed", {
            payment_id: payload.payment_id,
            payment_status: payload.payment_status,
          });
          return new Response("ignored");
        }

        const walletId = payload.order_id;
        const amount = Number(payload.actually_paid ?? payload.pay_amount ?? 0);
        if (!walletId || !Number.isFinite(amount) || amount <= 0) {
          console.log("[nowpayments deposit] REJECTED — invalid payload", { walletId, amount });
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const providerPaymentId = payload.payment_id ? `dep_${payload.payment_id}` : null;

        const { data: wallet } = await supabaseAdmin
          .from("wallets")
          .select("id, user_id, crypto_type, balance")
          .eq("id", walletId)
          .maybeSingle();
        if (!wallet) {
          console.log("[nowpayments deposit] REJECTED — unknown wallet", { walletId });
          return new Response("Unknown wallet", { status: 404 });
        }

        // Idempotency: transactions_provider_payment_id_key (unique partial index) rejects replays.
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
          if (ledgerError.code === "23505") {
            console.log("[nowpayments deposit] DUPLICATE — payment already credited, skipping", {
              providerPaymentId,
            });
            return new Response("duplicate");
          }
          console.error("[nowpayments deposit] ledger error", ledgerError);
          return new Response("Ledger error", { status: 500 });
        }

        await supabaseAdmin
          .from("wallets")
          .update({ balance: Number(wallet.balance) + amount })
          .eq("id", wallet.id);

        console.log("[nowpayments deposit] ACCEPTED — wallet credited", {
          walletId: wallet.id,
          cryptoType: wallet.crypto_type,
          amount,
          providerPaymentId,
        });

        return new Response("ok");
      },
    },
  },
});
