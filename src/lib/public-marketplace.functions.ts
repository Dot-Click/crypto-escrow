import { createServerFn } from "@tanstack/react-start";

/**
 * Public, unauthenticated marketplace feed — same spirit as
 * trader-profile.functions.ts: browsing offers shouldn't require an account,
 * matching SafeTheTrade/BitValve. Uses supabaseAdmin because `listings` and
 * `profiles` are RLS-locked to authenticated users, but only the same fields
 * the authenticated marketplace query already exposed (display name, trade
 * count, country) are selected here — no email, no internal listing data.
 */
export const getPublicListings = createServerFn({ method: "POST" })
  .inputValidator((input: {
    side: "sell" | "buy";
    crypto?: string;
    currency?: string;
    countryFilter?: string;
    methodFilters?: string[];
    tagFilter?: string[];
    pageParam: number;
    pageSize: number;
  }) => {
    if (input.side !== "sell" && input.side !== "buy") throw new Error("Invalid side");
    if (!Number.isInteger(input.pageParam) || input.pageParam < 0) throw new Error("Invalid page");
    if (!Number.isInteger(input.pageSize) || input.pageSize <= 0 || input.pageSize > 50) {
      throw new Error("Invalid page size");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("listings")
      .select("*, profiles!listings_seller_id_fkey(display_name, trades_completed, country)")
      .eq("status", "active")
      .eq("side", data.side);

    if (data.crypto && data.crypto !== "all") query = query.eq("crypto_type", data.crypto);
    if (data.currency && data.currency !== "all") query = query.eq("fiat_currency", data.currency);
    if (data.countryFilter && data.countryFilter !== "all") {
      query = query.not("blocked_countries", "cs", `{${data.countryFilter}}`);
    }
    if (data.methodFilters && data.methodFilters.length > 0) {
      query = query.overlaps("accepted_payment_methods", data.methodFilters);
    }
    if (data.tagFilter && data.tagFilter.length > 0) query = query.overlaps("tags", data.tagFilter);

    const { data: listings, error } = await query
      .order("created_at", { ascending: false })
      .range(data.pageParam, data.pageParam + data.pageSize - 1);
    if (error) throw new Error(error.message);
    return listings;
  });

/**
 * Single-listing lookup for the shareable /listings/$id page — same
 * unauthenticated access as getPublicListings above, so a link to an offer
 * works for someone who hasn't signed in yet.
 */
export const getPublicListing = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.id)) throw new Error("Invalid listing id");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: listing, error } = await supabaseAdmin
      .from("listings")
      .select("*, profiles!listings_seller_id_fkey(display_name, trades_completed, country, is_verified)")
      .eq("id", data.id)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!listing) throw new Error("This offer is no longer available");
    return listing;
  });
