// Login email-step-up: request/verify. These two MUST use
// requireSupabaseAuthBasic (not requireSupabaseAuth) — at the point they're
// called, the session hasn't cleared step-up yet, so the strict middleware
// would refuse them and lock the account out of ever completing it.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuthBasic } from "@/integrations/supabase/auth-middleware";

// How long a completed login step-up covers a session before it would be
// asked for again — long enough not to nag on every page load, short
// enough that a stolen long-lived token doesn't skip the check forever.
const STEP_UP_VALID_HOURS = 12;

export const requestLoginStepUpCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthBasic])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("login_email_verification")
      .eq("id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    if (!profile.login_email_verification) {
      // Nothing to do — this account didn't opt into the email step-up.
      return { sent: false as const };
    }

    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    await enforceRateLimit({
      userId: context.userId,
      action: "stepup_email_login",
      limit: 10,
      windowSeconds: 3600,
    });

    const { sendStepUpEmailCode } = await import("@/lib/step-up.server");
    await sendStepUpEmailCode(context.userId, "login");
    return { sent: true as const };
  });

export const verifyLoginStepUpCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthBasic])
  .inputValidator((input: { code: string }) => {
    const code = String(input.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code");
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { requireStepUp } = await import("@/lib/step-up.server");
    await requireStepUp({
      supabase: context.supabase,
      userId: context.userId,
      purpose: "login",
      method: "email",
      code: data.code,
    });

    const sessionId = (context.claims as { session_id?: string } | undefined)?.session_id;
    if (!sessionId) throw new Error("Session could not be verified — try signing in again");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const expiresAt = new Date(Date.now() + STEP_UP_VALID_HOURS * 3600_000).toISOString();
    const { error } = await supabaseAdmin
      .from("login_step_ups")
      .upsert({ session_id: sessionId, user_id: context.userId, verified_at: new Date().toISOString(), expires_at: expiresAt });
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });
