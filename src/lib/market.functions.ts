import { createServerFn } from "@tanstack/react-start";

// Public — these proxy an external market-data feed with no per-user state,
// so there's nothing here that needs an account (the public marketplace
// needs live prices too, matching SafeTheTrade/BitValve).
export const getMarketPrices = createServerFn({ method: "GET" }).handler(async () => {
  const { getMarketPrices: fetchPrices } = await import("@/lib/market-price.server");
  return fetchPrices();
});

export const getFxRates = createServerFn({ method: "GET" }).handler(async () => {
  const { getFxRates: fetchRates } = await import("@/lib/fx-rate.server");
  return fetchRates();
});
