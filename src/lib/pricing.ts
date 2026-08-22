// Shared trade math — used by both the client-side calculators (listing form,
// start-trade dialog) and the server-side escrow engine, so they never drift.

/**
 * A seller's listing price = live USD market price, converted into the
 * listing's fiat currency, adjusted by their margin (e.g. -10 = 10% below
 * market). `fxRate` is the USD -> listing-currency multiplier (1 for USD).
 */
export function computeEffectivePrice(marketPriceUsd: number, marginPercent: number, fxRate = 1): number {
  return marketPriceUsd * fxRate * (1 + marginPercent / 100);
}

/**
 * A listing prices itself either as a margin over the live market rate, or as
 * a seller-chosen fixed price (already denominated in the listing's own
 * currency, so no FX conversion applies) that ignores the market feed
 * entirely. Returns null only when margin-priced and the market price isn't
 * available yet.
 */
export function resolveListingPrice(
  listing: {
    fixed_price: number | string | null;
    margin_percent: number | string;
    crypto_type: string;
    fiat_currency: string;
  },
  marketPrices: Record<string, number> | undefined,
  fxRates: Record<string, number> | undefined,
): number | null {
  if (listing.fixed_price != null) return Number(listing.fixed_price);
  const marketPrice = marketPrices?.[listing.crypto_type];
  if (!marketPrice) return null;
  const fxRate = listing.fiat_currency === "USD" ? 1 : fxRates?.[listing.fiat_currency];
  if (!fxRate) return null;
  return computeEffectivePrice(marketPrice, Number(listing.margin_percent), fxRate);
}

/**
 * Same as resolveListingPrice, but always expressed in USD — for comparing
 * or sorting listings that are denominated in different currencies.
 */
export function resolveListingPriceUsd(
  listing: {
    fixed_price: number | string | null;
    margin_percent: number | string;
    crypto_type: string;
    fiat_currency: string;
  },
  marketPrices: Record<string, number> | undefined,
  fxRates: Record<string, number> | undefined,
): number | null {
  const marketPrice = marketPrices?.[listing.crypto_type];
  if (listing.fixed_price != null) {
    if (listing.fiat_currency === "USD") return Number(listing.fixed_price);
    const fx = fxRates?.[listing.fiat_currency];
    return fx ? Number(listing.fixed_price) / fx : null;
  }
  return marketPrice ? computeEffectivePrice(marketPrice, Number(listing.margin_percent)) : null;
}

/** How much crypto a fiat amount buys at a given price, net of the platform fee. */
export function computeReceiveAmount(
  fiatAmount: number,
  effectivePrice: number,
  feePercent: number,
): { grossCrypto: number; feeCrypto: number; netCrypto: number } {
  const grossCrypto = fiatAmount / effectivePrice;
  const feeCrypto = grossCrypto * (feePercent / 100);
  return { grossCrypto, feeCrypto, netCrypto: grossCrypto - feeCrypto };
}
