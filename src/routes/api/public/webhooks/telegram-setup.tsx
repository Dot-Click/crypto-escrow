import { createFileRoute } from "@tanstack/react-router";

// One-time (and re-runnable) setup endpoint: registers this deployment's
// webhook URL with Telegram, called FROM the server (Vercel) rather than a
// developer's own machine. Some networks reset TLS connections to
// api.telegram.org specifically — running the same setWebhook call from
// Vercel sidesteps that entirely, since it's a different network with no
// such interference.
//
// Visit this URL once in a browser after deploying with TELEGRAM_BOT_TOKEN,
// TELEGRAM_WEBHOOK_SECRET and SITE_URL (or VERCEL_URL) set:
//   https://<your-domain>/api/public/webhooks/telegram-setup?secret=<TELEGRAM_WEBHOOK_SECRET>
//
// Reuses TELEGRAM_WEBHOOK_SECRET as the query-param gate too, rather than a
// second secret — it's already the one value that must stay private, and
// Telegram itself never sees this URL (only the /webhooks/telegram one).
// Safe to leave in place; re-visiting it just re-registers the same
// webhook, which is what you'd want after rotating the bot token anyway.
export const Route = createFileRoute("/api/public/webhooks/telegram-setup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { verifyTelegramWebhookSecret, registerTelegramWebhook } = await import(
          "@/lib/telegram.server"
        );

        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        if (!verifyTelegramWebhookSecret(secret)) {
          return new Response("forbidden", { status: 403 });
        }

        try {
          const { ok, body } = await registerTelegramWebhook();
          return new Response(JSON.stringify(body, null, 2), {
            status: ok ? 200 : 502,
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: String(err) }, null, 2), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
