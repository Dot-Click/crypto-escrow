// Server-only IP intelligence, backing the "No VPN" offer tag and the
// declared-country cross-check on account setup. Uses IPQualityScore's IP
// reputation API (free tier: 5,000 lookups/month) — one endpoint gives both
// VPN/proxy/Tor flags and a resolved country per IP, so both features share
// a single fetch instead of each hitting the API separately.
// Fails open — a misconfigured key or a down provider should never block a
// real trade or a profile save, only a confirmed signal does anything.
type IpIntel = { flagged: boolean; countryCode: string | null };

async function fetchIpIntel(ip: string): Promise<IpIntel> {
  const apiKey = process.env['IPQUALITYSCORE_API_KEY'];
  if (!apiKey || !ip) return { flagged: false, countryCode: null };

  try {
    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1`,
    );
    if (!res.ok) return { flagged: false, countryCode: null };
    const data = await res.json();
    if (data?.success === false) return { flagged: false, countryCode: null };
    return {
      flagged: Boolean(data.vpn || data.proxy || data.tor || data.active_vpn || data.active_tor),
      countryCode: typeof data.country_code === "string" && data.country_code ? data.country_code.toUpperCase() : null,
    };
  } catch {
    return { flagged: false, countryCode: null };
  }
}

export async function checkVpnOrProxy(ip: string): Promise<{ flagged: boolean }> {
  const { flagged } = await fetchIpIntel(ip);
  return { flagged };
}

/** Resolved country for an IP, or null if it can't be determined (no API key, lookup failure, etc). */
export async function lookupIpCountry(ip: string): Promise<string | null> {
  const { countryCode } = await fetchIpIntel(ip);
  return countryCode;
}
