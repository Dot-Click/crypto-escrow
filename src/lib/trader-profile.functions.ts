import { createServerFn } from "@tanstack/react-start";
import { getTraderReputationStats } from "@/lib/trader-reputation.server";

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

    const stats = await getTraderReputationStats(supabaseAdmin, data.userId);

    const since30d = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    const [{ data: bioRow }, { data: allTrades }, { data: recentTrades }, { data: feedbackRows }, { data: listings }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("bio").eq("id", data.userId).maybeSingle(),
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

    let paymentMinutesSum = 0;
    let paymentSamples = 0;
    let releaseMinutesSum = 0;
    let releaseSamples = 0;
    for (const t of recentTrades ?? []) {
      if (t.status === "released" && t.payment_claimed_at) {
        paymentMinutesSum += (new Date(t.payment_claimed_at).getTime() - new Date(t.created_at).getTime()) / 60_000;
        paymentSamples += 1;
        releaseMinutesSum += (new Date(t.updated_at).getTime() - new Date(t.payment_claimed_at).getTime()) / 60_000;
        releaseSamples += 1;
      }
    }

    const methodPositive = new Map<string, number>();
    const methodNegative = new Map<string, number>();
    for (const f of feedbackRows ?? []) {
      const method = (f.trades as unknown as { payment_method: string | null } | null)?.payment_method;
      if (!method) continue;
      if (f.is_positive) methodPositive.set(method, (methodPositive.get(method) ?? 0) + 1);
      else methodNegative.set(method, (methodNegative.get(method) ?? 0) + 1);
    }

    return {
      ...stats,
      bio: bioRow?.bio ?? null,
      avgPaymentMinutes30d: paymentSamples > 0 ? Math.round(paymentMinutesSum / paymentSamples) : null,
      avgReleaseMinutes30d: releaseSamples > 0 ? Math.round(releaseMinutesSum / releaseSamples) : null,
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
