import { createFileRoute } from "@tanstack/react-router";

// Telegram calls this on every message sent to our bot. Registered via
// setWebhook with a secret_token (see docs/TELEGRAM_SETUP.md) — Telegram
// echoes that same value back on every request as the
// X-Telegram-Bot-Api-Secret-Token header, which is the only thing that
// tells a request here apart from anyone who finds this URL, since
// Telegram itself doesn't sign webhook payloads.
//
// The only message we handle is "/start <CODE>" — the linking handshake
// started from Settings (generateTelegramLinkCode). Everything else is
// acknowledged with 200 and ignored, since Telegram retries on non-2xx.
export const Route = createFileRoute("/api/public/webhooks/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyTelegramWebhookSecret, sendTelegramMessage } = await import("@/lib/telegram.server");

        const secret = request.headers.get("x-telegram-bot-api-secret-token");
        if (!verifyTelegramWebhookSecret(secret)) {
          return new Response("forbidden", { status: 403 });
        }

        let update: unknown;
        try {
          update = await request.json();
        } catch {
          return new Response("ok", { status: 200 });
        }

        const message = (update as { message?: { chat?: { id?: number }; text?: string } } | null)?.message;
        const chatId = message?.chat?.id;
        const text = (message?.text ?? "").trim();
        if (!chatId || !text.startsWith("/start")) {
          return new Response("ok", { status: 200 });
        }

        const code = text.replace("/start", "").trim().toUpperCase();
        if (!code) {
          await sendTelegramMessage(chatId, "Open Settings on the app and tap Connect Telegram to get a code.");
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: linkCode } = await supabaseAdmin
          .from("telegram_link_codes")
          .select("user_id, expires_at")
          .eq("code", code)
          .maybeSingle();

        if (!linkCode || new Date(linkCode.expires_at).getTime() < Date.now()) {
          await sendTelegramMessage(chatId, "That code is invalid or expired — request a new one from Settings.");
          return new Response("ok", { status: 200 });
        }

        const { error: linkErr } = await supabaseAdmin
          .from("telegram_links")
          .upsert({ user_id: linkCode.user_id, chat_id: chatId });
        if (linkErr) {
          console.error("[telegram] failed to save link", linkErr);
          await sendTelegramMessage(chatId, "Something went wrong linking your account — try again in a moment.");
          return new Response("ok", { status: 200 });
        }

        await supabaseAdmin.from("telegram_link_codes").delete().eq("code", code);
        await sendTelegramMessage(chatId, "✅ Telegram connected — you'll get trade and deposit notifications here.");
        return new Response("ok", { status: 200 });
      },
    },
  },
});
