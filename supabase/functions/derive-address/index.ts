// Derive-address — called by the Vercel server-fn layer to allocate a
// per-user deposit address on demand. Never called directly from a
// browser: the Vercel side gates it behind requireSupabaseAuth and adds
// the CRON_SECRET header.
//
// Contract:
//   POST { userId: uuid, network: SupportedNetwork }
//         where SupportedNetwork is any mainnet or testnet code listed in
//         supabase/functions/_shared/hd-wallet.ts.
//   ->   { address: string, crypto_type: string, network: string }
//
// Behaviour:
//   1. If a row already exists for (userId, network), return its address.
//   2. Otherwise, call allocate_deposit_index() to get a fresh index
//      (Postgres row-level lock — safe under concurrent callers).
//   3. Derive the address from the encrypted seed.
//   4. Insert user_deposit_addresses. On unique-violation (rare race:
//      the caller retried and got a different index), fall back to the
//      existing row.

import { getAdminDb, requireCronSecret } from "../_shared/db.ts";
import { deriveAddress, NETWORK_META, type SupportedNetwork } from "../_shared/hd-wallet.ts";

const ALLOWED: readonly SupportedNetwork[] = [
  "BTC_MAINNET", "LTC_MAINNET", "ETH_MAINNET", "BSC_MAINNET",
  "BTC_TESTNET", "LTC_TESTNET", "ETH_SEPOLIA", "BSC_TESTNET",
];

Deno.serve(async (req) => {
  try {
    requireCronSecret(req);
  } catch (r) {
    if (r instanceof Response) return r;
    throw r;
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let body: { userId?: string; network?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const userId = body.userId?.trim();
  const network = body.network?.trim() as SupportedNetwork | undefined;
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "invalid userId" }, 400);
  if (!network || !ALLOWED.includes(network)) return json({ error: "invalid network" }, 400);

  const db = getAdminDb();
  const meta = NETWORK_META[network];

  const { data: existing } = await db
    .from("user_deposit_addresses")
    .select("address, crypto_type, network")
    .eq("user_id", userId)
    .eq("network", network)
    .maybeSingle();
  if (existing) return json(existing);

  const { data: idxResult, error: idxErr } = await db.rpc("allocate_deposit_index", { _network: network });
  if (idxErr) return json({ error: idxErr.message }, 500);
  const index = Number(idxResult);
  if (!Number.isInteger(index) || index < 1) {
    // index 0 is reserved for the collector — allocator returns >= 1 for users.
    // If it comes back 0, allocate one more.
    return json({ error: "index allocator returned invalid value" }, 500);
  }

  const derived = await deriveAddress(network, index);

  const { data: inserted, error: insErr } = await db
    .from("user_deposit_addresses")
    .insert({
      user_id: userId,
      crypto_type: meta.cryptoType,
      network,
      address: derived.address,
      derivation_index: index,
    })
    .select("address, crypto_type, network")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      // Concurrent request already inserted; return the winner.
      const { data: winner } = await db
        .from("user_deposit_addresses")
        .select("address, crypto_type, network")
        .eq("user_id", userId)
        .eq("network", network)
        .single();
      return json(winner);
    }
    return json({ error: insErr.message }, 500);
  }
  return json(inserted);
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
