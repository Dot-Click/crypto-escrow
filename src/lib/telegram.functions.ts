import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { randomBytes } from "node:crypto";

const LINK_CODE_TTL_MINUTES = 15;

export const getTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isTelegramConfigured, telegramBotUsername } = await import("@/lib/telegram.server");

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("telegram_notifications")
      .eq("id", context.userId)
      .single();
    if (error) throw new Error(error.message);

    const { data: link } = await supabaseAdmin
      .from("telegram_links")
      .select("linked_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      configured: isTelegramConfigured(),
      botUsername: telegramBotUsername(),
      linked: !!link,
      linkedAt: link?.linked_at ?? null,
      notificationsEnabled: profile.telegram_notifications,
    };
  });

/** Issues a fresh linking code; the user messages it to the bot as /start <code>. */
export const generateTelegramLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");

    await enforceRateLimit({
      userId: context.userId,
      action: "telegram_link_code",
      limit: 10,
      windowSeconds: 3600,
    });

    // One code per account at a time — replace any still-pending one so an
    // old code shown in a stale tab can't quietly link after a new one was
    // requested.
    await supabaseAdmin.from("telegram_link_codes").delete().eq("user_id", context.userId);

    const code = randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000).toISOString();
    const { error } = await supabaseAdmin
      .from("telegram_link_codes")
      .insert({ code, user_id: context.userId, expires_at: expiresAt });
    if (error) throw new Error(error.message);

    return { code };
  });

export const disconnectTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("telegram_links").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setTelegramNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ telegram_notifications: data.enabled })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { enabled: data.enabled };
  });
