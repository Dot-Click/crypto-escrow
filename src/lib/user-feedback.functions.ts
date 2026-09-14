import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAGE_SIZE = 20;

/** Public — feeds the Feedbacks tab on a trader's profile. */
export const getUserFeedback = createServerFn({ method: "GET" })
  .inputValidator((input: { userId: string; cursor?: number }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = data.cursor ?? 0;
    const { data: rows, error } = await supabaseAdmin
      .from("user_feedback")
      .select("id, is_positive, comment, created_at, rater_id, trade_id, trades(payment_method), profiles!user_feedback_rater_id_fkey(display_name)")
      .eq("rated_user_id", data.userId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const items = (rows ?? []).map((r) => ({
      id: r.id,
      isPositive: r.is_positive,
      comment: r.comment,
      createdAt: r.created_at,
      raterId: r.rater_id,
      raterDisplayName: (r.profiles as unknown as { display_name: string } | null)?.display_name ?? "Trader",
      paymentMethod: (r.trades as unknown as { payment_method: string | null } | null)?.payment_method ?? null,
    }));

    return {
      items,
      nextCursor: items.length === PAGE_SIZE ? from + PAGE_SIZE : null,
    };
  });

export const submitTradeFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string; isPositive: boolean; comment?: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.tradeId)) throw new Error("Invalid trade id");
    const comment = input.comment?.trim() || null;
    if (comment && comment.length > 500) throw new Error("Comment is too long");
    return { tradeId: input.tradeId, isPositive: !!input.isPositive, comment };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: trade, error: tradeErr } = await supabaseAdmin
      .from("trades")
      .select("buyer_id, seller_id, status")
      .eq("id", data.tradeId)
      .maybeSingle();
    if (tradeErr) throw new Error(tradeErr.message);
    if (!trade) throw new Error("Trade not found");
    if (trade.status !== "released") throw new Error("You can only leave feedback on a released trade");
    if (trade.buyer_id !== context.userId && trade.seller_id !== context.userId) {
      throw new Error("You weren't a party to this trade");
    }
    const ratedUserId = trade.buyer_id === context.userId ? trade.seller_id : trade.buyer_id;

    const { error } = await supabaseAdmin.from("user_feedback").insert({
      trade_id: data.tradeId,
      rater_id: context.userId,
      rated_user_id: ratedUserId,
      is_positive: data.isPositive,
      comment: data.comment,
    });
    if (error) {
      if (error.code === "23505") throw new Error("You already left feedback on this trade");
      throw new Error(error.message);
    }
    return { ok: true as const };
  });
