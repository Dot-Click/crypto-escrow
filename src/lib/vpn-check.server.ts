// Server-only IP fraud/VPN detection, backing the "No VPN" offer tag.
// Uses IPQualityScore's IP reputation API (free tier: 5,000 lookups/month).
// Fails open — a misconfigured key or a down provider should never block a
// real trade, only a confirmed VPN/proxy/Tor hit does.
export async function checkVpnOrProxy(ip: string): Promise<{ flagged: boolean }> {
  const apiKey = process.env['IPQUALITYSCORE_API_KEY'];
  if (!apiKey || !ip) return { flagged: false };

  try {
    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1`,
    );
    if (!res.ok) return { flagged: false };
    const data = await res.json();
    if (data?.success === false) return { flagged: false };
    return { flagged: Boolean(data.vpn || data.proxy || data.tor || data.active_vpn || data.active_tor) };
  } catch {
    return { flagged: false };
  }
}
