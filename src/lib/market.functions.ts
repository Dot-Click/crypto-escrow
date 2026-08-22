import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMarketPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getMarketPrices: fetchPrices } = await import("@/lib/market-price.server");
    return fetchPrices();
  });

export const getFxRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getFxRates: fetchRates } = await import("@/lib/fx-rate.server");
    return fetchRates();
  });
