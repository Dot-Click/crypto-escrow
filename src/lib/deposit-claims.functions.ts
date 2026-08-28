// Per-user HD deposit-address flow. Users see their own address for each
// coin (allocated on first request), send funds directly to it, and the
// watch-deposits Edge Function auto-credits them once the tx confirms.
// There is no manual TxID form and no signature-challenge flow anymore.
//
// The environment (testnet vs mainnet) is picked from NETWORK_ENV. Users
// only ever see addresses matching the current env — mainnet users don't
// see testnet addresses, and vice versa. Both sets of collector rows live
// in master_wallets so a project can flip envs by rotating the env var
// and the active flags, without any code change.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type SupportedNetwork } from "@/lib/withdrawal-validation";

const MAINNET_NETWORKS: SupportedNetwork[] = ["BTC_MAINNET", "LTC_MAINNET", "ETH_MAINNET", "BSC_MAINNET"];
const TESTNET_NETWORKS: SupportedNetwork[] = ["BTC_TESTNET", "LTC_TESTNET", "ETH_SEPOLIA", "BSC_TESTNET"];

function activeNetworkAllowlist(): Set<string> {
  const env = process.env.NETWORK_ENV === "testnet" ? "testnet" : "mainnet";
  return new Set(env === "testnet" ? TESTNET_NETWORKS : MAINNET_NETWORKS);
}

/**
 * Return the list of active networks + this user's deposit address on
 * each. Missing addresses are lazily allocated via the derive-address
 * Edge Function.
 */
export const getMyDepositAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: masters, error: mErr } = await supabaseAdmin
      .from("master_wallets")
      .select("crypto_type, network, label, warning_message, min_confirmations, active")
      .eq("active", true)
      .eq("purpose", "collector")
      .order("crypto_type");
    if (mErr) throw new Error(mErr.message);

    const allow = activeNetworkAllowlist();
    const activeNetworks = (masters ?? []).filter((m) => allow.has(m.network));

    const results = await Promise.all(
      activeNetworks.map(async (m) => {
        const address = await ensureAddress(context.userId, m.network as SupportedNetwork);
        return {
          crypto_type: m.crypto_type,
          network: m.network,
          label: m.label,
          warning_message: m.warning_message ?? "",
          min_confirmations: m.min_confirmations,
          address,
        };
      }),
    );

    return results;
  });

async function ensureAddress(userId: string, network: SupportedNetwork): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("user_deposit_addresses")
    .select("address")
    .eq("user_id", userId)
    .eq("network", network)
    .maybeSingle();
  if (existing) return existing.address;

  const baseUrl = process.env.SUPABASE_FUNCTIONS_URL;
  const cronSecret = process.env.CRON_SECRET;
  if (!baseUrl || !cronSecret) {
    throw new Error("Server misconfigured: SUPABASE_FUNCTIONS_URL / CRON_SECRET not set");
  }

  const res = await fetch(`${baseUrl}/derive-address`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": cronSecret },
    body: JSON.stringify({ userId, network }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`derive-address failed: ${res.status} ${text}`);
  }
  const payload = (await res.json()) as { address?: string; error?: string };
  if (!payload.address) throw new Error(payload.error ?? "derive-address returned no address");
  return payload.address;
}

/**
 * History feed for the wallet page. The watcher owns write access; users
 * can only read their own rows.
 */
export const listMyDepositClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("deposit_claims")
      .select(
        "id, crypto_type, network, claimed_amount, verified_amount, tx_hash, status, rejection_reason, confirmations, created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
