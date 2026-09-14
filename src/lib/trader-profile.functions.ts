import { createServerFn } from "@tanstack/react-start";

const ONLINE_WINDOW_MS = 5 * 60_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

/**
 * Public, unauthenticated trader profile — the same spirit as SafeTheTrade's
 * public profile page: aggregate stats only, nothing that could identify a
 * counterparty in a specific trade, and no email. Uses supabaseAdmin because
 * `profiles` is RLS-locked to authenticated users, but a trader's public
 * reputation shouldn't require a viewer to have an account.
 *
 * Deliberately doesn't show an "imported trades" sub-count the way some
 * competitor pages do — there's no legacy-import data in this schema, so
 * `tradesCompleted` is shown as one honest total instead of a fabricated split.
 */
export const getTraderProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, bio, trades_completed, created_at, is_verified, last_seen_at, country")
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Trader not found");

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);

    const since30d = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    const [{ data: allTrades }, { data: recentTrades }, { data: feedbackRows }, { data: relationshipRows }, { data: listings }] =
      await Promise.all([
        supabaseAdmin
          .from("trades")
          .select("buyer_id, seller_id, crypto_type, amount, payment_method")
          .eq("status", "released")
          .or(`buyer_id.eq.${data.userId},seller_id.eq.${data.userId}`),
        supabaseAdmin
          .from("trades")
          .select("status, created_at, payment_claimed_at, updated_at")
          .gte("created_at", since30d)
          .or(`buyer_id.eq.${data.userId},seller_id.eq.${data.userId}`),
        supabaseAdmin
          .from("user_feedback")
          .select("is_positive, trades(payment_method)")
          .eq("rated_user_id", data.userId),
        supabaseAdmin.from("user_relationships").select("kind").eq("other_user_id", data.userId),
        supabaseAdmin
          .from("listings")
          .select("id, side, crypto_type, fiat_currency, price, margin_percent, min_amount, max_amount, accepted_payment_methods")
          .eq("seller_id", data.userId)
          .eq("status", "active")
          .order("created_at", { ascending: false }),
      ]);

    const partners = new Set<string>();
    const volumeByCrypto = new Map<string, number>();
    const methodCounts = new Map<string, number>();

    for (const t of allTrades ?? []) {
      const counterpartyId = t.buyer_id === data.userId ? t.seller_id : t.buyer_id;
      partners.add(counterpartyId);
      volumeByCrypto.set(t.crypto_type, (volumeByCrypto.get(t.crypto_type) ?? 0) + Number(t.amount));
      if (t.payment_method) methodCounts.set(t.payment_method, (methodCounts.get(t.payment_method) ?? 0) + 1);
    }

    let released = 0;
    let unsuccessful = 0;
    let paymentMinutesSum = 0;
    let paymentSamples = 0;
    let releaseMinutesSum = 0;
    let releaseSamples = 0;
    for (const t of recentTrades ?? []) {
      if (t.status === "released") {
        released += 1;
        if (t.payment_claimed_at) {
          paymentMinutesSum += (new Date(t.payment_claimed_at).getTime() - new Date(t.created_at).getTime()) / 60_000;
          paymentSamples += 1;
          releaseMinutesSum += (new Date(t.updated_at).getTime() - new Date(t.payment_claimed_at).getTime()) / 60_000;
          releaseSamples += 1;
        }
      } else if (t.status === "cancelled") {
        unsuccessful += 1;
      }
    }
    const totalForRate = released + unsuccessful;

    const methodPositive = new Map<string, number>();
    const methodNegative = new Map<string, number>();
    let positiveFeedback = 0;
    let negativeFeedback = 0;
    for (const f of feedbackRows ?? []) {
      const method = (f.trades as unknown as { payment_method: string | null } | null)?.payment_method;
      if (f.is_positive) {
        positiveFeedback += 1;
        if (method) methodPositive.set(method, (methodPositive.get(method) ?? 0) + 1);
      } else {
        negativeFeedback += 1;
        if (method) methodNegative.set(method, (methodNegative.get(method) ?? 0) + 1);
      }
    }

    let trustedByCount = 0;
    let blockedByCount = 0;
    for (const r of relationshipRows ?? []) {
      if (r.kind === "trust") trustedByCount += 1;
      else if (r.kind === "block") blockedByCount += 1;
    }
    const { count: hasBlockedCount } = await supabaseAdmin
      .from("user_relationships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.userId)
      .eq("kind", "block");

    return {
      id: profile.id,
      displayName: profile.display_name,
      bio: profile.bio,
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
      avgPaymentMinutes30d: paymentSamples > 0 ? Math.round(paymentMinutesSum / paymentSamples) : null,
      avgReleaseMinutes30d: releaseSamples > 0 ? Math.round(releaseMinutesSum / releaseSamples) : null,
      trustedByCount,
      blockedByCount,
      hasBlockedCount: hasBlockedCount ?? 0,
      activeListings: (listings ?? []).map((l) => ({
        id: l.id,
        side: l.side,
        cryptoType: l.crypto_type,
        fiatCurrency: l.fiat_currency,
        price: Number(l.price),
        marginPercent: Number(l.margin_percent),
        minAmount: l.min_amount != null ? Number(l.min_amount) : null,
        maxAmount: l.max_amount != null ? Number(l.max_amount) : null,
        acceptedPaymentMethods: l.accepted_payment_methods,
      })),
      uniquePartners: partners.size,
      volumeByCrypto: [...volumeByCrypto.entries()]
        .map(([cryptoType, amount]) => ({ cryptoType, amount }))
        .sort((a, b) => b.amount - a.amount),
      methodBreakdown: [...methodCounts.entries()]
        .map(([method, trades]) => ({
          method,
          trades,
          positive: methodPositive.get(method) ?? 0,
          negative: methodNegative.get(method) ?? 0,
        }))
        .sort((a, b) => b.trades - a.trades),
    };
  });
