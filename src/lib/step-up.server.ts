// Server-only. Shared step-up verification for sensitive actions
// (withdrawal, escrow release, login). Three methods:
//   'none'  — nothing to check, caller proceeds immediately.
//   'email' — a 6-digit code was emailed earlier via sendStepUpEmailCode;
//             verifyStepUpEmailCode checks it against verification_codes.
//   'totp'  — the user's already-enrolled authenticator app; verified with
//             a FRESH challenge+verify done server-side in the same
//             request, using their own session (context.supabase) — not by
//             trusting a client-side "already verified" flag, and not by
//             reusing the session's existing AAL (which could be stale
//             from login and never re-prompt for a specific action).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "node:crypto";
import type { StepUpMethod, StepUpPurpose } from "@/lib/security-types";

export type { StepUpMethod, StepUpPurpose };

const CODE_TTL_MINUTES = 10;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  // 6 digits, zero-padded — randomInt is cryptographically secure (unlike Math.random).
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const PURPOSE_LABEL: Record<StepUpPurpose, string> = {
  login: "sign in",
  withdrawal: "withdrawal",
  release: "escrow release",
};

export async function sendStepUpEmailCode(userId: string, purpose: StepUpPurpose): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmail } = await import("@/lib/email.server");

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("email, display_name")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  if (!profile.email) throw new Error("No email on file for this account");

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

  const { error: insertErr } = await supabaseAdmin.from("verification_codes").insert({
    user_id: userId,
    purpose,
    code_hash: hashCode(code),
    expires_at: expiresAt,
  });
  if (insertErr) throw new Error(insertErr.message);

  await sendEmail({
    to: profile.email,
    subject: `Your ${PURPOSE_LABEL[purpose]} code`,
    html: `
      <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <p style="font-size: 15px; color: #111;">Your code to confirm this ${PURPOSE_LABEL[purpose]}:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #111; margin: 16px 0;">${code}</p>
        <p style="font-size: 13px; color: #666;">Expires in ${CODE_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email — nothing happens without the code.</p>
      </div>
    `,
  });
}

async function verifyStepUpEmailCode(userId: string, purpose: StepUpPurpose, code: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error } = await supabaseAdmin
    .from("verification_codes")
    .select("id, code_hash, expires_at, consumed_at")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Request a new code — none is pending");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("This code has expired — request a new one");
  if (row.code_hash !== hashCode(String(code).trim())) throw new Error("Incorrect code");

  // Consume immediately so the same code can never be replayed, whether
  // this request succeeds or a concurrent one raced it.
  const { error: consumeErr, count } = await supabaseAdmin
    .from("verification_codes")
    .update({ consumed_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", row.id)
    .is("consumed_at", null);
  if (consumeErr) throw new Error(consumeErr.message);
  if (count === 0) throw new Error("This code was already used");
}

async function verifyStepUpTotp(supabase: SupabaseClient, code: string): Promise<void> {
  const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
  if (factorsErr) throw new Error(factorsErr.message);
  const factor = factorsData?.totp.find((f) => f.status === "verified");
  if (!factor) throw new Error("Two-factor authentication isn't enabled on this account");

  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeErr) throw new Error(challengeErr.message);

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: String(code).trim(),
  });
  if (verifyErr) throw new Error("Incorrect authenticator code");
}

/**
 * Enforce a step-up for one sensitive action. Call this BEFORE the action's
 * side effects (debiting a balance, releasing escrow) — it throws on any
 * failure, and throwing here must abort the caller's handler entirely.
 */
export async function requireStepUp(params: {
  supabase: SupabaseClient;
  userId: string;
  purpose: StepUpPurpose;
  method: StepUpMethod;
  code?: string | null;
}): Promise<void> {
  if (params.method === "none") return;
  const code = (params.code ?? "").trim();
  if (!code) throw new Error("Enter your verification code to continue");

  if (params.method === "email") {
    await verifyStepUpEmailCode(params.userId, params.purpose, code);
    return;
  }
  await verifyStepUpTotp(params.supabase, code);
}
