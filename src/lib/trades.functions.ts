import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { expireStaleTrades } = await import("@/lib/escrow.server");
    await expireStaleTrades({ userId: context.userId });

    const { data, error } = await supabaseAdmin
      .from("trades")
      .select(
        "id, crypto_type, amount, price, expires_at, fiat_currency, payment_method, status, created_at, buyer_id, seller_id, buyer:profiles!trades_buyer_id_fkey(display_name), seller:profiles!trades_seller_id_fkey(display_name)",
      )
      .or(`buyer_id.eq.${context.userId},seller_id.eq.${context.userId}`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((t) => ({
      ...t,
      amount: Number(t.amount),
      price: Number(t.price),
      role: t.buyer_id === context.userId ? ("buyer" as const) : ("seller" as const),
    }));
  });

export const getTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.tradeId)) throw new Error("Invalid trade id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { expireStaleTrades } = await import("@/lib/escrow.server");
    await expireStaleTrades({ tradeId: data.tradeId });

    const { data: trade, error } = await supabaseAdmin
      .from("trades")
      .select(
        "id, listing_id, crypto_type, amount, price, fee_amount, payout_amount, expires_at, fiat_currency, payment_method, status, created_at, updated_at, buyer_id, seller_id, buyer:profiles!trades_buyer_id_fkey(display_name, trades_completed), seller:profiles!trades_seller_id_fkey(display_name, trades_completed)",
      )
      .eq("id", data.tradeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!trade) throw new Error("Trade not found");
    if (trade.buyer_id !== context.userId && trade.seller_id !== context.userId) {
      throw new Error("You are not a party to this trade");
    }

    const { data: dispute } = await supabaseAdmin
      .from("disputes")
      .select("id, reason, status, created_at, raised_by")
      .eq("trade_id", trade.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let terms: string | null = null;
    let tags: string[] = [];
    if (trade.listing_id) {
      const { data: listing } = await supabaseAdmin
        .from("listings")
        .select("terms, tags")
        .eq("id", trade.listing_id)
        .maybeSingle();
      terms = listing?.terms ?? null;
      tags = listing?.tags ?? [];
    }

    return {
      trade: {
        ...trade,
        amount: Number(trade.amount),
        price: Number(trade.price),
        fee_amount: Number(trade.fee_amount),
        payout_amount: Number(trade.payout_amount),
      },
      terms,
      tags,
      dispute,
      role: trade.buyer_id === context.userId ? ("buyer" as const) : ("seller" as const),
    };
  });

/** Opens a trade room and immediately places the internal escrow hold on the seller's wallet. */
export const createTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { listingId: string; fiatAmount: number; paymentMethod: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.listingId)) throw new Error("Invalid listing id");
    if (!Number.isFinite(input.fiatAmount) || input.fiatAmount <= 0) {
      throw new Error("Enter a valid amount");
    }
    if (!input.paymentMethod) throw new Error("Choose a payment method");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { openTrade } = await import("@/lib/escrow.server");
    const { getRequestIP } = await import("@tanstack/react-start/server");
    const buyerIp = getRequestIP({ xForwardedFor: true });
    return openTrade({ ...data, userId: context.userId, ...(buyerIp ? { buyerIp } : {}) });
  });

export const markPaymentSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string }) => input)
  .handler(async ({ data, context }) => {
    const { claimPayment } = await import("@/lib/escrow.server");
    return claimPayment({ tradeId: data.tradeId, userId: context.userId });
  });

export const releaseEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string }) => input)
  .handler(async ({ data, context }) => {
    const { releaseHold } = await import("@/lib/escrow.server");
    return releaseHold({ tradeId: data.tradeId, userId: context.userId });
  });

export const cancelTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string }) => input)
  .handler(async ({ data, context }) => {
    const { cancelAndRefund } = await import("@/lib/escrow.server");
    return cancelAndRefund({ tradeId: data.tradeId, userId: context.userId });
  });

export const openDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string; reason: string }) => {
    if (!input.reason || input.reason.trim().length < 10) {
      throw new Error("Describe the problem in at least 10 characters");
    }
    if (input.reason.length > 2000) throw new Error("Reason is too long");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { raiseDispute } = await import("@/lib/escrow.server");
    return raiseDispute({ tradeId: data.tradeId, reason: data.reason.trim(), userId: context.userId });
  });
