import { createServerFn } from "@tanstack/react-start";

/**
 * Public, unauthenticated trader profile — the same spirit as SafeTheTrade's
 * public profile page: aggregate stats only, nothing that could identify a
 * counterparty in a specific trade, and no email. Uses supabaseAdmin because
 * `profiles` is RLS-locked to authenticated users, but a trader's public
 * reputation shouldn't require a viewer to have an account.
 *
 * Deliberately omits avg payment/release time and star ratings: this schema
 * doesn't track per-trade payment/release timestamps or a ratings table yet,
 * so those numbers can't be computed honestly. Add them here once those
 * tables exist rather than estimating.
 */
export const getTraderProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, trades_completed, created_at, is_verified")
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Trader not found");

    const { data: trades } = await supabaseAdmin
      .from("trades")
      .select("buyer_id, seller_id, crypto_type, amount, payment_method")
      .eq("status", "released")
      .or(`buyer_id.eq.${data.userId},seller_id.eq.${data.userId}`);

    const { data: listings } = await supabaseAdmin
      .from("listings")
      .select("id, side, crypto_type, fiat_currency, price, min_amount, max_amount, accepted_payment_methods")
      .eq("seller_id", data.userId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    const partners = new Set<string>();
    const volumeByCrypto = new Map<string, number>();
    const methodCounts = new Map<string, number>();

    for (const t of trades ?? []) {
      const counterpartyId = t.buyer_id === data.userId ? t.seller_id : t.buyer_id;
      partners.add(counterpartyId);
      volumeByCrypto.set(t.crypto_type, (volumeByCrypto.get(t.crypto_type) ?? 0) + Number(t.amount));
      if (t.payment_method) methodCounts.set(t.payment_method, (methodCounts.get(t.payment_method) ?? 0) + 1);
    }

    return {
      id: profile.id,
      displayName: profile.display_name,
      tradesCompleted: profile.trades_completed,
      memberSince: profile.created_at,
      isVerified: profile.is_verified,
      activeListings: (listings ?? []).map((l) => ({
        id: l.id,
        side: l.side,
        cryptoType: l.crypto_type,
        fiatCurrency: l.fiat_currency,
        price: Number(l.price),
        minAmount: l.min_amount != null ? Number(l.min_amount) : null,
        maxAmount: l.max_amount != null ? Number(l.max_amount) : null,
        acceptedPaymentMethods: l.accepted_payment_methods,
      })),
      uniquePartners: partners.size,
      volumeByCrypto: [...volumeByCrypto.entries()]
        .map(([cryptoType, amount]) => ({ cryptoType, amount }))
        .sort((a, b) => b.amount - a.amount),
      methodBreakdown: [...methodCounts.entries()]
        .map(([method, trades]) => ({ method, trades }))
        .sort((a, b) => b.trades - a.trades),
    };
  });
