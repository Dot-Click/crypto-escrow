# Telegram notifications — setup

Users can connect a Telegram account in Settings to get trade and chat
notifications there, in addition to email and web push. This requires a
Telegram bot the client owns — I can't create it for you (Telegram ties
bot ownership to a personal Telegram account), but it's a five-minute,
free, one-time setup.

## 1. Create the bot

1. Open Telegram, search for **@BotFather**, start a chat.
2. Send `/newbot`.
3. Give it a display name (shown to users), e.g. "CEMP Notifications".
4. Give it a username ending in `bot`, e.g. `cemp_notify_bot` — this is
   what users will search for / the deep link uses.
5. BotFather replies with a token that looks like
   `123456789:AAFakeExampleTokenNotReal_abcXYZ`. **Keep this secret** —
   anyone with it can send messages as your bot.

## 2. Set the three environment variables

| Variable | Value | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | The token from BotFather | Secret — never commit it, never share it in chat. |
| `TELEGRAM_BOT_USERNAME` | The bot's username, without `@` | e.g. `cemp_notify_bot`. Public — used to build the "connect" deep link shown in Settings. |
| `TELEGRAM_WEBHOOK_SECRET` | A random string you generate | Secret — Telegram echoes it back on every webhook call as a header; it's how the webhook route tells a real Telegram request apart from anyone who finds its URL. Generate one with `openssl rand -hex 32`. |

Set all three in your hosting provider's environment variables (Vercel
Project Settings → Environment Variables → Production), then redeploy.

## 3. Register the webhook with Telegram

Once the app is deployed and the env vars above are set, tell Telegram
where to send updates — run this once (replace the placeholders):

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-domain>/api/public/webhooks/telegram",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

A successful response looks like:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

To check it's registered correctly at any time:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## 4. Try it

1. Go to Settings on the app, find "Telegram notifications", click
   **Connect Telegram**.
2. Click the generated link (or manually open the bot and send
   `/start <CODE>` shown on screen).
3. The bot should reply "✅ Telegram connected".
4. Send yourself a trade chat message from another account — you should
   get a Telegram message alongside the email/push notification.

## What triggers a Telegram message

Same events as email, reusing the same on/off toggle logic per channel:
- A new chat message from a trade counterparty ([message-notify.server.ts](../src/lib/message-notify.server.ts))
- A trade completing (released) or being cancelled ([trade-notify.server.ts](../src/lib/trade-notify.server.ts))

Users can turn Telegram notifications off independently of email/push —
each channel has its own switch.

## If you ever need to rotate the bot token

1. Message @BotFather → `/revoke` (or `/token` to get a fresh one).
2. Update `TELEGRAM_BOT_TOKEN` in your hosting provider, redeploy.
3. Re-run step 3 above (`setWebhook`) — the webhook URL and secret don't
   need to change, only the token used in the URL path.

## What's NOT built

- No per-notification-type Telegram toggle (e.g. "chat messages yes,
  trade completion no") — it's one on/off switch for all Telegram
  notifications, same granularity as the existing email toggle.
- No rich formatting beyond bold text and links — Telegram's `HTML`
  parse mode supports more (italics, code blocks, etc.) if you want
  fancier messages later; see `sendTelegramMessage` in
  [telegram.server.ts](../src/lib/telegram.server.ts).
