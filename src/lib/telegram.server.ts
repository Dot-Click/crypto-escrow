// Server-only Telegram bot helper. Best-effort — every call is wrapped by
// its own try/catch at the point of use (same convention as
// message-notify.server.ts / trade-notify.server.ts) so a missing bot
// token or a Telegram outage never blocks the underlying app action.

function apiBase(): string | null {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  if (!token) return null;
  return `https://api.telegram.org/bot${token}`;
}

export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const base = apiBase();
  if (!base) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN is not set — skipping message send');
    return;
  }
  const res = await fetch(`${base}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[telegram] sendMessage failed (${res.status}): ${body}`);
  }
}

/**
 * Verifies the webhook secret Telegram echoes back on every update, set via
 * setWebhook's secret_token param at registration time (see
 * docs/TELEGRAM_SETUP.md) — Telegram does not sign requests, so this
 * shared-secret header is the only thing standing between the public
 * webhook route and anyone who finds its URL.
 */
export function verifyTelegramWebhookSecret(receivedSecret: string | null): boolean {
  const expected = process.env['TELEGRAM_WEBHOOK_SECRET'];
  return !!expected && !!receivedSecret && receivedSecret === expected;
}

export function isTelegramConfigured(): boolean {
  return !!process.env['TELEGRAM_BOT_TOKEN'];
}

export function telegramBotUsername(): string | null {
  return process.env['TELEGRAM_BOT_USERNAME'] || null;
}
