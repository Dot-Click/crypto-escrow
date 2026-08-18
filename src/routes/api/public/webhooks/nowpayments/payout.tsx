import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/nowpayments/payout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyIpnSignature } = await import("@/lib/nowpayments.server");
        if (!verifyIpnSignature(raw, request.headers.get("x-nowpayments-sig"))) {
          return new Response("Invalid signature", { status: 401 });
        }

        const payload = JSON.parse(raw) as {
          id?: string | number;
          batch_withdrawal_id?: string | number;
          status?: string;
          hash?: string;
        };

        const providerId = payload.id ?? payload.batch_withdrawal_id;
        if (!providerId) return new Response("Invalid payload", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tx } = await supabaseAdmin
          .from("transactions")
          .select("id, wallet_id, user_id, amount, status, type")
          .eq("provider_payment_id", String(providerId))
          .eq("type", "withdrawal")
          .maybeSingle();
        if (!tx) return new Response("Unknown withdrawal", { status: 404 });
        if (tx.status !== "pending") return new Response("already settled");

        const status = payload.status;
        if (status === "FINISHED" || status === "finished") {
          await supabaseAdmin
            .from("transactions")
            .update({ status: "completed", external_tx_hash: payload.hash ?? null })
            .eq("id", tx.id);
          return new Response("ok");
        }

        if (status === "FAILED" || status === "REJECTED" || status === "failed") {
          const { data: wallet } = await supabaseAdmin
            .from("wallets")
            .select("id, balance")
            .eq("id", tx.wallet_id)
            .maybeSingle();
          if (wallet) {
            await supabaseAdmin
              .from("wallets")
              .update({ balance: Number(wallet.balance) + Number(tx.amount) })
              .eq("id", wallet.id);
          }
          await supabaseAdmin.from("transactions").update({ status: "failed" }).eq("id", tx.id);
          return new Response("refunded");
        }

        return new Response("ignored");
      },
    },
  },
});
