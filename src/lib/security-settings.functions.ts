import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StepUpMethod, StepUpPurpose } from "@/lib/security-types";

const METHODS: readonly StepUpMethod[] = ["none", "email", "totp"];

export const getSecuritySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("withdrawal_verification, release_verification, login_email_verification")
      .eq("id", context.userId)
      .single();
    if (error) throw new Error(error.message);

    const { data: factorsData } = await context.supabase.auth.mfa.listFactors();
    const hasTotp = !!factorsData?.totp.some((f) => f.status === "verified");

    return {
      withdrawalVerification: profile.withdrawal_verification as StepUpMethod,
      releaseVerification: profile.release_verification as StepUpMethod,
      loginEmailVerification: profile.login_email_verification,
      hasTotp,
    };
  });

async function setActionVerification(
  userId: string,
  column: "withdrawal_verification" | "release_verification",
  method: StepUpMethod,
  hasTotp: boolean,
) {
  if (!METHODS.includes(method)) throw new Error("Invalid verification method");
  if (method === "totp" && !hasTotp) {
    throw new Error("Enable two-factor authentication on your Profile page first");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const update = column === "withdrawal_verification" ? { withdrawal_verification: method } : { release_verification: method };
  const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
  if (error) throw new Error(error.message);
}

export const setWithdrawalVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { method: string }) => {
    if (!METHODS.includes(input.method as StepUpMethod)) throw new Error("Invalid verification method");
    return { method: input.method as StepUpMethod };
  })
  .handler(async ({ data, context }) => {
    const { data: factorsData } = await context.supabase.auth.mfa.listFactors();
    const hasTotp = !!factorsData?.totp.some((f) => f.status === "verified");
    await setActionVerification(context.userId, "withdrawal_verification", data.method, hasTotp);
    return { method: data.method };
  });

export const setReleaseVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { method: string }) => {
    if (!METHODS.includes(input.method as StepUpMethod)) throw new Error("Invalid verification method");
    return { method: input.method as StepUpMethod };
  })
  .handler(async ({ data, context }) => {
    const { data: factorsData } = await context.supabase.auth.mfa.listFactors();
    const hasTotp = !!factorsData?.totp.some((f) => f.status === "verified");
    await setActionVerification(context.userId, "release_verification", data.method, hasTotp);
    return { method: data.method };
  });

/**
 * Email-code login step-up can only be the account's second factor when no
 * TOTP factor is enrolled — otherwise the account would have two competing
 * "what proves this is you" mechanisms, which is confusing and doesn't add
 * real protection over TOTP alone. Enabling this while TOTP is on is
 * refused; disabling TOTP does NOT auto-enable this (opt-in only).
 */
export const setLoginEmailVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    if (data.enabled) {
      const { data: factorsData } = await context.supabase.auth.mfa.listFactors();
      const hasTotp = !!factorsData?.totp.some((f) => f.status === "verified");
      if (hasTotp) {
        throw new Error("Two-factor authentication is already protecting sign-in on this account");
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ login_email_verification: data.enabled })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { enabled: data.enabled };
  });

/** Requests a fresh emailed code for one of the three step-up purposes. */
export const requestStepUpEmailCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { purpose: string }) => {
    const purposes: readonly StepUpPurpose[] = ["withdrawal", "release"];
    if (!purposes.includes(input.purpose as StepUpPurpose)) throw new Error("Invalid purpose");
    return { purpose: input.purpose as StepUpPurpose };
  })
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    await enforceRateLimit({
      userId: context.userId,
      action: `stepup_email_${data.purpose}`,
      limit: 10,
      windowSeconds: 3600,
    });
    const { sendStepUpEmailCode } = await import("@/lib/step-up.server");
    await sendStepUpEmailCode(context.userId, data.purpose);
    return { sent: true as const };
  });
