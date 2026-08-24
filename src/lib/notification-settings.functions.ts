import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("email_notifications")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { count } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);

    return {
      emailNotifications: profile?.email_notifications ?? true,
      pushSubscribed: (count ?? 0) > 0,
      // Only true when the server actually has VAPID keys configured — the
      // client uses this to explain why the push toggle is unavailable
      // rather than letting the user hit a confusing failure.
      pushConfigured: !!process.env["VAPID_PUBLIC_KEY"],
    };
  });

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env["VAPID_PUBLIC_KEY"] || null };
});

export const setEmailNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ email_notifications: data.enabled })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { enabled: data.enabled };
  });

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpoint: string; p256dh: string; auth: string }) => {
    if (!input.endpoint || !input.p256dh || !input.auth) {
      throw new Error("Invalid push subscription");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpoint: string }) => {
    if (!input.endpoint) throw new Error("Missing endpoint");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
