// Server-only. Live USD-based FX rates from open.er-api.com (free, no key).
// Cached for 5 minutes — exchange rates move far slower than crypto prices,
// so there's no need to hit the upstream API on every request.
const CACHE_TTL_MS = 5 * 60_000;
let cache: { rates: Record<string, number>; fetchedAt: number } | null = null;

async function fetchRates(): Promise<Record<string, number>> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`FX rate feed returned ${res.status}`);
  const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (data.result !== "success" || !data.rates) throw new Error("FX rate feed returned no rates");
  return data.rates;
}

export async function getFxRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.rates;
  try {
    const rates = await fetchRates();
    cache = { rates, fetchedAt: Date.now() };
    return rates;
  } catch (err) {
    if (cache) return cache.rates;
    throw err;
  }
}

/** USD -> `code` multiplier. 1 for USD itself. */
export async function getFxRate(code: string): Promise<number> {
  if (code === "USD") return 1;
  const rates = await getFxRates();
  const rate = rates[code];
  if (!rate) throw new Error(`No FX rate available for ${code}`);
  return rate;
}
