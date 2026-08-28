// Deposit watcher — polls every mainnet network for new incoming
// transactions to any address in user_deposit_addresses, records them as
// pending deposit_claims, and credits the user's wallet once the tx has
// N confirmations for its network. Invoked from pg_cron every minute.
//
// Idempotency: the (network, tx_hash) unique index on used_tx_hashes is
// the only credit guard. Everything else is safe to run twice per tx.
//
// Timeout: Edge Functions on the free tier get 400s wall / 25s CPU. Each
// network is capped at a max block range to stay well inside that.

import { getAdminDb, requireCronSecret } from "../_shared/db.ts";
import { ALL_NETWORKS, NETWORK_META, type SupportedNetwork } from "../_shared/hd-wallet.ts";
import {
  utxoGetTipHeight,
  utxoListIncoming,
  evmGetTipHeight,
  evmListIncoming,
} from "../_shared/rpc.ts";

const MAX_EVM_BLOCKS_PER_TICK = 20;   // native scan is per-block; keep small
const MAX_EVM_LOG_RANGE = 500;         // token log scan is cheap; can be larger
// Every supported network — mainnet and testnet. Inactive rows in
// master_wallets short-circuit tickNetwork() so unused networks cost
// one DB read per tick, no RPC calls.
const NETWORKS: SupportedNetwork[] = ALL_NETWORKS;

type MasterWallet = {
  crypto_type: string;
  network: string;
  token_contract_address: string | null;
  min_confirmations: number;
  active: boolean;
};

type UserAddress = {
  id: string;
  user_id: string;
  crypto_type: string;
  network: string;
  address: string;
};

Deno.serve(async (req) => {
  try {
    requireCronSecret(req);
  } catch (r) {
    if (r instanceof Response) return r;
    throw r;
  }

  const db = getAdminDb();
  const summary: Record<string, unknown> = {};

  for (const network of NETWORKS) {
    try {
      summary[network] = await tickNetwork(db, network);
    } catch (err) {
      console.error(`[watch-deposits] ${network} failed:`, err);
      summary[network] = { error: String(err) };
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { "content-type": "application/json" },
  });
});

async function tickNetwork(db: ReturnType<typeof getAdminDb>, network: SupportedNetwork) {
  const { data: master, error: mwErr } = await db
    .from("master_wallets")
    .select("crypto_type, network, token_contract_address, min_confirmations, active")
    .eq("network", network)
    .eq("purpose", "collector")
    .maybeSingle<MasterWallet>();
  if (mwErr) throw new Error(mwErr.message);
  if (!master || !master.active) return { skipped: "not active" };
  if (master.address && master.address.startsWith("PLACEHOLDER_")) {
    return { skipped: "collector address not configured" };
  }

  const { data: addrs, error: addrErr } = await db
    .from("user_deposit_addresses")
    .select("id, user_id, crypto_type, network, address")
    .eq("network", network);
  if (addrErr) throw new Error(addrErr.message);
  const rows: UserAddress[] = addrs ?? [];
  if (rows.length === 0) return { addresses: 0 };

  if (NETWORK_META[network].chainKind === "utxo") {
    return tickUtxo(db, network as "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET", rows, master);
  }
  return tickEvm(db, network as "ETH_MAINNET" | "BSC_MAINNET" | "ETH_SEPOLIA" | "BSC_TESTNET", rows, master);
}

// ---------- UTXO ----------

async function tickUtxo(
  db: ReturnType<typeof getAdminDb>,
  network: "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET",
  addrs: UserAddress[],
  master: MasterWallet,
) {
  const tip = await utxoGetTipHeight(network);
  let inserted = 0;
  let credited = 0;

  for (const row of addrs) {
    const incoming = await utxoListIncoming(network, row.address, tip);
    for (const tx of incoming) {
      const alreadySeen = await hasSeen(db, network, tx.txid);
      if (!alreadySeen) {
        // Sats -> whole coin (8 decimals) as string, insert as numeric.
        const amountCoin = (Number(tx.amountSats) / 1e8).toFixed(8);
        const ok = await recordSeenClaim(db, {
          network,
          txHash: tx.txid,
          userAddress: row,
          amount: amountCoin,
          confirmations: tx.confirmations,
        });
        if (ok) inserted++;
      }
      if (tx.confirmations >= master.min_confirmations) {
        const wasCredited = await creditIfPending(db, {
          network,
          txHash: tx.txid,
          userAddress: row,
          amountCoin: (Number(tx.amountSats) / 1e8).toFixed(8),
          confirmations: tx.confirmations,
          collectorAddress: master.address,
        });
        if (wasCredited) credited++;
      }
    }
  }

  await db.from("hd_wallet_state").update({ last_scanned_block: tip, updated_at: new Date().toISOString() }).eq("network", network);
  return { addresses: addrs.length, tip, inserted, credited };
}

// ---------- EVM ----------

async function tickEvm(
  db: ReturnType<typeof getAdminDb>,
  network: "ETH_MAINNET" | "BSC_MAINNET" | "ETH_SEPOLIA" | "BSC_TESTNET",
  addrs: UserAddress[],
  master: MasterWallet,
) {
  const tip = await evmGetTipHeight(network);
  const { data: state } = await db
    .from("hd_wallet_state")
    .select("last_scanned_block")
    .eq("network", network)
    .maybeSingle();

  // First run defaults to (tip - 5) so we don't dry-run the whole chain.
  const isTokenNetwork = !!master.token_contract_address;
  const maxRange = isTokenNetwork ? MAX_EVM_LOG_RANGE : MAX_EVM_BLOCKS_PER_TICK;
  const startFrom = state?.last_scanned_block ? Number(state.last_scanned_block) + 1 : tip - 5;
  const fromBlock = Math.max(0, startFrom);
  const toBlock = Math.min(tip, fromBlock + maxRange - 1);
  if (fromBlock > tip) {
    return { addresses: addrs.length, tip, skipped: "up to date" };
  }

  const watched = addrs.map((r) => r.address.toLowerCase());
  const found = await evmListIncoming({
    network,
    fromBlock,
    toBlock,
    addresses: watched,
    tokenContract: master.token_contract_address ?? undefined,
  });

  const byAddr = new Map(addrs.map((r) => [r.address.toLowerCase(), r] as const));
  let inserted = 0;
  let credited = 0;

  for (const tx of found) {
    const row = byAddr.get(tx.address);
    if (!row) continue;
    const amount = master.token_contract_address
      ? formatUsdt(tx.amountTokenBase ?? 0n)
      : formatEth(tx.amountWei);

    const alreadySeen = await hasSeen(db, network, tx.txHash);
    if (!alreadySeen) {
      const ok = await recordSeenClaim(db, {
        network,
        txHash: tx.txHash,
        userAddress: row,
        amount,
        confirmations: tx.confirmations,
      });
      if (ok) inserted++;
    }
    if (tx.confirmations >= master.min_confirmations) {
      const wasCredited = await creditIfPending(db, {
        network,
        txHash: tx.txHash,
        userAddress: row,
        amountCoin: amount,
        confirmations: tx.confirmations,
        collectorAddress: master.address,
      });
      if (wasCredited) credited++;
    }
  }

  await db
    .from("hd_wallet_state")
    .update({ last_scanned_block: toBlock, updated_at: new Date().toISOString() })
    .eq("network", network);

  return { addresses: addrs.length, tip, fromBlock, toBlock, inserted, credited };
}

function formatEth(wei: bigint): string {
  // Format as fixed-precision decimal string with 18 decimals.
  const s = wei.toString().padStart(19, "0");
  const int = s.slice(0, -18);
  const frac = s.slice(-18).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

function formatUsdt(base: bigint): string {
  // BSC USDT (Tether on BEP-20) uses 18 decimals. Ethereum-mainnet USDT
  // uses 6 decimals — if you enable ETH-mainnet USDT later, override per
  // token in the token contract lookup.
  return formatEth(base);
}

// ---------- Shared DB ops ----------

async function hasSeen(db: ReturnType<typeof getAdminDb>, network: string, txHash: string): Promise<boolean> {
  const { data } = await db
    .from("used_tx_hashes")
    .select("id")
    .eq("network", network)
    .eq("tx_hash", txHash)
    .maybeSingle();
  return !!data;
}

async function recordSeenClaim(db: ReturnType<typeof getAdminDb>, args: {
  network: string;
  txHash: string;
  userAddress: UserAddress;
  amount: string;
  confirmations: number;
}): Promise<boolean> {
  // Get or create wallet row for this user + crypto.
  const wallet = await getOrCreateWallet(db, args.userAddress.user_id, args.userAddress.crypto_type);

  const { data: claim, error } = await db
    .from("deposit_claims")
    .insert({
      user_id: args.userAddress.user_id,
      wallet_id: wallet.id,
      crypto_type: args.userAddress.crypto_type,
      network: args.network,
      claimed_amount: args.amount,
      tx_hash: args.txHash,
      status: "pending",
      confirmations: args.confirmations,
      user_deposit_address_id: args.userAddress.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[watcher] insert claim failed", error);
    return false;
  }

  // Mark this txid as seen so we never re-insert the same claim.
  const { error: uErr } = await db
    .from("used_tx_hashes")
    .insert({ network: args.network, tx_hash: args.txHash, deposit_claim_id: claim.id });
  if (uErr && uErr.code !== "23505") {
    console.error("[watcher] used_tx_hashes insert failed", uErr);
  }
  return true;
}

async function creditIfPending(db: ReturnType<typeof getAdminDb>, args: {
  network: string;
  txHash: string;
  userAddress: UserAddress;
  amountCoin: string;
  confirmations: number;
  collectorAddress: string;
}): Promise<boolean> {
  const { data: claim } = await db
    .from("deposit_claims")
    .select("id, wallet_id, user_id, status, crypto_type")
    .eq("network", args.network)
    .eq("tx_hash", args.txHash)
    .maybeSingle();
  if (!claim || claim.status !== "pending") return false;

  const { data: wallet, error: wErr } = await db
    .from("wallets")
    .select("id, balance")
    .eq("id", claim.wallet_id)
    .single();
  if (wErr) throw new Error(wErr.message);

  const { data: tx, error: txErr } = await db
    .from("transactions")
    .insert({
      wallet_id: claim.wallet_id,
      user_id: claim.user_id,
      type: "deposit",
      amount: args.amountCoin,
      crypto_type: claim.crypto_type,
      external_tx_hash: args.txHash,
      external_address: args.userAddress.address,
      status: "completed",
    })
    .select("id")
    .single();
  if (txErr) {
    console.error("[watcher] transactions insert failed", txErr);
    return false;
  }

  const newBalance = Number(wallet.balance) + Number(args.amountCoin);
  await db.from("wallets").update({ balance: newBalance }).eq("id", wallet.id);

  await db
    .from("deposit_claims")
    .update({
      status: "verified",
      verified_amount: args.amountCoin,
      confirmations: args.confirmations,
      transaction_id: tx.id,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", claim.id);

  return true;
}

async function getOrCreateWallet(db: ReturnType<typeof getAdminDb>, userId: string, cryptoType: string) {
  const { data: existing } = await db
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("crypto_type", cryptoType)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await db
    .from("wallets")
    .insert({ user_id: userId, crypto_type: cryptoType, balance: 0, held_balance: 0 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created;
}
