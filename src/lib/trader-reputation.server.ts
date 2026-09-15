// Server-only. Shared seller/trader reputation lookup — used by both the
// full public profile (trader-profile.functions.ts) and the single-listing
// detail page (public-marketplace.functions.ts), so the two pages never
// disagree on what "verified", "trusted", or a feedback count mean.
import type { SupabaseClient } from "@supabase/supabase-js";

const ONLINE_WINDOW_MS = 5 * 60_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

export async function getTraderReputationStats(supabaseAdmin: SupabaseClient, userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, trades_completed, created_at, is_verified, last_seen_at, country")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error("Trader not found");

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);

  const since30d = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const [{ data: recentTrades }, { data: feedbackRows }, { data: relationshipRows }, { count: hasBlockedCount }] =
    await Promise.all([
      supabaseAdmin
        .from("trades")
        .select("status, created_at, payment_claimed_at, updated_at")
        .gte("created_at", since30d)
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`),
      supabaseAdmin.from("user_feedback").select("is_positive").eq("rated_user_id", userId),
      supabaseAdmin.from("user_relationships").select("kind").eq("other_user_id", userId),
      supabaseAdmin
        .from("user_relationships")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "block"),
    ]);

  let released = 0;
  let unsuccessful = 0;
  for (const t of recentTrades ?? []) {
    if (t.status === "released") released += 1;
    else if (t.status === "cancelled") unsuccessful += 1;
  }
  const totalForRate = released + unsuccessful;

  let positiveFeedback = 0;
  let negativeFeedback = 0;
  for (const f of feedbackRows ?? []) {
    if (f.is_positive) positiveFeedback += 1;
    else negativeFeedback += 1;
  }

  let trustedByCount = 0;
  let blockedByCount = 0;
  for (const r of relationshipRows ?? []) {
    if (r.kind === "trust") trustedByCount += 1;
    else if (r.kind === "block") blockedByCount += 1;
  }

  return {
    id: profile.id,
    displayName: profile.display_name,
    country: profile.country,
    tradesCompleted: profile.trades_completed,
    memberSince: profile.created_at,
    isVerified: profile.is_verified,
    isEmailVerified: !!authUser?.user?.email_confirmed_at,
    isOnline: Date.now() - new Date(profile.last_seen_at).getTime() < ONLINE_WINDOW_MS,
    lastSeenAt: profile.last_seen_at,
    positiveFeedback,
    negativeFeedback,
    tradeSuccessRate30d: totalForRate > 0 ? Math.round((released / totalForRate) * 1000) / 10 : null,
    trustedByCount,
    blockedByCount,
    hasBlockedCount: hasBlockedCount ?? 0,
  };
}
