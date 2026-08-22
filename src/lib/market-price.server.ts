// Server-only. Live spot prices, cached briefly so concurrent requests share
// one upstream call. Binance's public ticker API is the primary source — it
// has generous rate limits and, unlike CoinGecko's free tier, doesn't block
// requests from cloud/serverless IP ranges (Vercel, AWS, etc). CoinGecko is
// kept as a fallback in case Binance itself is ever unreachable.
const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  LTC: "LTCUSDT",
};

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  LTC: "litecoin",
};

const CACHE_TTL_MS = 30_000;
let cache: { prices: Record<string, number>; fetchedAt: number } | null = null;

async function fetchFromBinance(): Promise<Record<string, number>> {
  const symbols = Object.values(BINANCE_SYMBOLS)
    .map((s) => `%22${s}%22`)
    .join(",");
  const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=%5B${symbols}%5D`);
  if (!res.ok) throw new Error(`Binance price feed returned ${res.status}`);

  const data = (await res.json()) as Array<{ symbol: string; price: string }>;
  const bySymbol = new Map(data.map((d) => [d.symbol, Number(d.price)]));

  const prices: Record<string, number> = {};
  for (const [code, symbol] of Object.entries(BINANCE_SYMBOLS)) {
    const price = bySymbol.get(symbol);
    if (price) prices[code] = price;
  }
  return prices;
}

async function fetchFromCoinGecko(): Promise<Record<string, number>> {
  const ids = Object.values(COINGECKO_IDS).join(",");
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
  if (!res.ok) throw new Error(`CoinGecko price feed returned ${res.status}`);

  const data = (await res.json()) as Record<string, { usd?: number }>;
  const prices: Record<string, number> = {};
  for (const [code, id] of Object.entries(COINGECKO_IDS)) {
    const value = data[id]?.usd;
    if (value) prices[code] = value;
  }
  return prices;
}

export async function getMarketPrices(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.prices;
  }

  let prices: Record<string, number>;
  try {
    prices = await fetchFromBinance();
  } catch (err) {
    console.warn("[market-price] Binance feed failed, falling back to CoinGecko", err);
    try {
      prices = await fetchFromCoinGecko();
    } catch (fallbackErr) {
      console.error("[market-price] CoinGecko fallback also failed", fallbackErr);
      if (cache) return cache.prices; // serve the last known prices rather than block trading
      throw new Error("Could not reach a live market price feed");
    }
  }

  // USDT is a USD-pegged stablecoin — no upstream lookup needed.
  prices["USDT"] = 1;

  cache = { prices, fetchedAt: Date.now() };
  return prices;
}

export async function getMarketPrice(cryptoType: string): Promise<number> {
  const prices = await getMarketPrices();
  const price = prices[cryptoType];
  if (!price) throw new Error(`No live market price available for ${cryptoType}`);
  return price;
}
