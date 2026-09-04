// Server-only. Sends Web Push notifications via VAPID. Best-effort — a
// missing key or a dead subscription must never block the caller (chat send,
// trade status change, etc.).
type WebPushModule = typeof import("web-push");

async function loadWebPush(): Promise<WebPushModule> {
  const mod = await import("web-push");
  // web-push is CJS; depending on the bundler's interop it can land on
  // `.default` or on the module namespace itself.
  return ((mod as { default?: WebPushModule }).default ?? mod) as WebPushModule;
}

let configured = false;

async function ensureConfigured(): Promise<WebPushModule | null> {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  if (!publicKey || !privateKey) return null;

  const webpush = await loadWebPush();
  if (!configured) {
    webpush.setVapidDetails(
      process.env["VAPID_CONTACT_EMAIL"] || "mailto:support@cemp.test",
      publicKey,
      privateKey,
    );
    configured = true;
  }
  return webpush;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string },
) {
  const webpush = await ensureConfigured();
  if (!webpush) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone (user revoked permission, browser data cleared, etc.) — clean it up.
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("[push] send failed", err);
        }
      }
    }),
  );
}
