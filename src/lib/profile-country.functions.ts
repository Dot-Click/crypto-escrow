import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { COUNTRIES } from "@/lib/countries";

/**
 * Sets a trader's country the one time it's allowed to be set (the DB
 * trigger `profiles_lock_country` blocks any further self-service change).
 * Cross-checks the declared country against the requester's IP as a soft
 * secondary signal — VPNs and legitimate travelers both produce false
 * positives, so a mismatch is recorded for admin review, never blocking.
 */
export const setProfileCountry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { country: string }) => {
    const country = input.country.trim().toUpperCase();
    if (!COUNTRIES.some((c) => c.code === country)) throw new Error("Select a valid country");
    return { country };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRequestIP } = await import("@tanstack/react-start/server");
    const { lookupIpCountry } = await import("@/lib/vpn-check.server");

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("profiles")
      .select("country")
      .eq("id", context.userId)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (existing?.country) {
      throw new Error("Country is already set and can't be changed here — contact support.");
    }

    const ip = getRequestIP({ xForwardedFor: true });
    const ipCountry = ip ? await lookupIpCountry(ip) : null;
    const mismatch = ipCountry != null && ipCountry !== data.country;

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ country: data.country, ip_country: ipCountry, country_ip_mismatch: mismatch })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    return { mismatch };
  });
