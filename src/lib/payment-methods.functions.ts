import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Reveals the seller's saved payment details for a trade, if one was
 * attached to the listing for that trade's payment method. Routed through a
 * server function (service role + explicit party check) rather than RLS,
 * since "is this caller a party to a trade on this listing" isn't something
 * RLS on payment_methods can express without risking overexposure.
 */
export const getTradePaymentDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string }) => {
    if (!UUID.test(input.tradeId)) throw new Error("Invalid trade id");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: trade, error } = await supabaseAdmin
      .from("trades")
      .select("listing_id, payment_method, buyer_id, seller_id")
      .eq("id", data.tradeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!trade) throw new Error("Trade not found");
    if (trade.buyer_id !== context.userId && trade.seller_id !== context.userId) {
      throw new Error("You are not a party to this trade");
    }
    if (!trade.listing_id || !trade.payment_method) return null;

    const { data: link } = await supabaseAdmin
      .from("listing_payment_methods")
      .select("payment_method_id")
      .eq("listing_id", trade.listing_id)
      .eq("method", trade.payment_method)
      .maybeSingle();
    if (!link) return null;

    const { data: saved } = await supabaseAdmin
      .from("payment_methods")
      .select("method, label, details")
      .eq("id", link.payment_method_id)
      .maybeSingle();
    return saved ?? null;
  });
