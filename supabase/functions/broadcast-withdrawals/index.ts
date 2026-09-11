// Withdrawal broadcaster — takes pending `withdrawals` rows and moves the
// money from the collector wallet to the user's destination address. Runs
// from pg_cron every 5 minutes.
//
// Flow per row:
//   pending  -> broadcast  (tx submitted; tx_hash recorded)
//   broadcast -> confirmed (once tx has N confirmations)
//   pending  -> failed     (broadcast rejected; user balance refunded)
//
// Safety belts on top of the sweeper's:
//   - MAX_WITHDRAWAL_PER_TICK bounds blast radius from a single bad tick.
//   - EVM gas price is capped at MAX_EVM_GWEI to refuse mempool spikes.
//   - UTXO fee-vs-amount ratio capped at MAX_FEE_RATIO to refuse dust withdrawals.
//   - attempt_count > 3 hard-fails the row and refunds.

import { Buffer } from "node:buffer";
import { getAdminDb, requireCronSecret } from "../_shared/db.ts";
import {
  NETWORK_META,
  _internal_deriveEvmSigner,
  _internal_deriveTronSigner,
  _internal_deriveUtxoChild,
  bitcoin,
  ethers,
  type SupportedNetwork,
} from "../_shared/hd-wallet.ts";
import {
  utxoGetUtxos,
  utxoBroadcast,
  utxoGetTipHeight,
  evmProvider,
  evmGetNativeBalance,
  erc20Contract,
} from "../_shared/rpc.ts";
import {
  tronGetTrc20Balance,
  tronGetTrxBalance,
  tronGetTransactionInfo,
  tronGetTipHeight,
  tronTransferTrc20,
  TRON_USDT_DECIMALS,
  type TronNetwork,
} from "../_shared/tron.ts";

const MAX_WITHDRAWAL_PER_TICK = 10;
const MAX_EVM_GWEI = BigInt(Deno.env.get("MAX_EVM_GWEI") ?? "150");
const MAX_FEE_RATIO = Number(Deno.env.get("MAX_FEE_RATIO") ?? "0.05"); // 5%
const MAX_ATTEMPTS = 3;
// Cap on TRX a single TRC20 transfer may burn for energy — the collector's
// own staked bandwidth/energy covers it in the common case; this is a worst
// -case ceiling, not the expected cost. 50 TRX is generously above typical
// USDT-transfer energy cost even with zero staked energy.
const TRON_FEE_LIMIT_SUN = Number(Deno.env.get("TRON_FEE_LIMIT_SUN") ?? "50000000");

const COLLECTOR_INDEX = 0;

const BTC_SAT_PER_VB = Number(Deno.env.get("BTC_SAT_PER_VB") ?? "10");
const LTC_SAT_PER_VB = Number(Deno.env.get("LTC_SAT_PER_VB") ?? "2");

type WithdrawalRow = {
  id: string;
  user_id: string;
  wallet_id: string;
  crypto_type: string;
  network: string;
  destination_address: string;
  amount: string; // numeric arrives as string
  status: string;
  attempt_count: number;
};

Deno.serve(async (req) => {
  try {
    requireCronSecret(req);
  } catch (r) {
    if (r instanceof Response) return r;
    throw r;
  }

  const db = getAdminDb();

  const { data: pending, error } = await db
    .from("withdrawals")
    .select("id, user_id, wallet_id, crypto_type, network, destination_address, amount, status, attempt_count")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_WITHDRAWAL_PER_TICK);
  if (error) return json({ ok: false, error: error.message }, 500);

  const results: Array<{ id: string; status: string; note?: string }> = [];
  for (const row of (pending ?? []) as WithdrawalRow[]) {
    try {
      const outcome = await processOne(db, row);
      results.push({ id: row.id, status: outcome.status, note: outcome.note });
    } catch (e) {
      console.error(`[broadcast-withdrawals] ${row.id} threw`, e);
      await bumpAttempt(db, row, String(e));
      results.push({ id: row.id, status: "error", note: String(e) });
    }
  }

  // Confirmation sweep for already-broadcast rows.
  await confirmBroadcast(db);

  return json({ ok: true, processed: results.length, results });
});

async function processOne(
  db: ReturnType<typeof getAdminDb>,
  row: WithdrawalRow,
): Promise<{ status: string; note?: string }> {
  if (row.attempt_count >= MAX_ATTEMPTS) {
    await refund(db, row, `Exceeded ${MAX_ATTEMPTS} broadcast attempts`);
    return { status: "refunded", note: "attempts exceeded" };
  }
  const network = row.network as SupportedNetwork;
  const meta = NETWORK_META[network];
  if (!meta) {
    await refund(db, row, `Unsupported network: ${row.network}`);
    return { status: "refunded", note: "bad network" };
  }

  const { data: master } = await db
    .from("master_wallets")
    .select("address, token_contract_address, active")
    .eq("network", network)
    .eq("purpose", "collector")
    .maybeSingle();
  if (!master || !master.active) {
    await bumpAttempt(db, row, "collector not active");
    return { status: "deferred", note: "collector inactive" };
  }
  if (master.address.startsWith("PLACEHOLDER_")) {
    await refund(db, row, "Collector address not configured");
    return { status: "refunded", note: "collector placeholder" };
  }

  if (meta.chainKind === "utxo") {
    return broadcastUtxo(db, row, network as "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET", master.address);
  }
  if (meta.chainKind === "tron") {
    return broadcastTron(db, row, network as TronNetwork, master.address, master.token_contract_address ?? "");
  }
  if (network === "ETH_MAINNET" || network === "ETH_SEPOLIA") {
    return broadcastEth(db, row, network, master.address);
  }
  return broadcastBscUsdt(db, row, network as "BSC_MAINNET" | "BSC_TESTNET", master.address, master.token_contract_address ?? "");
}

async function bumpAttempt(db: ReturnType<typeof getAdminDb>, row: WithdrawalRow, err: string) {
  await db
    .from("withdrawals")
    .update({
      attempt_count: row.attempt_count + 1,
      last_attempt_at: new Date().toISOString(),
      error_message: err.slice(0, 500),
    })
    .eq("id", row.id);
}

async function refund(db: ReturnType<typeof getAdminDb>, row: WithdrawalRow, reason: string) {
  const { data: w } = await db.from("wallets").select("balance").eq("id", row.wallet_id).single();
  if (w) {
    await db
      .from("wallets")
      .update({ balance: Number(w.balance) + Number(row.amount) })
      .eq("id", row.wallet_id);
  }
  await db
    .from("withdrawals")
    .update({ status: "refunded", error_message: reason.slice(0, 500), last_attempt_at: new Date().toISOString() })
    .eq("id", row.id);
  await db
    .from("transactions")
    .update({ status: "failed" })
    .eq("user_id", row.user_id)
    .eq("type", "withdrawal")
    .eq("external_address", row.destination_address)
    .is("external_tx_hash", null);
}

// ---------- UTXO ----------

async function broadcastUtxo(
  db: ReturnType<typeof getAdminDb>,
  row: WithdrawalRow,
  network: "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET",
  collectorAddress: string,
): Promise<{ status: string; note?: string }> {
  const isBtc = network === "BTC_MAINNET" || network === "BTC_TESTNET";
  const satPerVb = isBtc ? BTC_SAT_PER_VB : LTC_SAT_PER_VB;
  const utxos = await utxoGetUtxos(network, collectorAddress);
  const confirmed = utxos.filter((u) => u.status.confirmed);
  const amountSats = BigInt(Math.round(Number(row.amount) * 1e8));

  // Simple greedy coin selection: take confirmed UTXOs oldest-first until
  // we cover amount + estimated fee. Not optimal for coin management but
  // adequate for a low-volume MVP.
  const sorted = [...confirmed].sort((a, b) => (a.status.block_height ?? 0) - (b.status.block_height ?? 0));
  const picked: typeof sorted = [];
  let total = 0n;
  for (const u of sorted) {
    picked.push(u);
    total += BigInt(u.value);
    const estVBytes = 10 + picked.length * 68 + 2 * 31;
    const estFee = BigInt(Math.ceil(estVBytes * satPerVb));
    if (total >= amountSats + estFee) break;
  }
  const estVBytes = 10 + picked.length * 68 + 2 * 31;
  const fee = BigInt(Math.ceil(estVBytes * satPerVb));
  if (total < amountSats + fee) {
    await bumpAttempt(db, row, "collector has insufficient confirmed balance");
    return { status: "deferred", note: "collector short" };
  }
  const feeRatio = Number(fee) / Number(amountSats);
  if (feeRatio > MAX_FEE_RATIO) {
    await bumpAttempt(db, row, `fee ratio ${feeRatio.toFixed(3)} exceeds cap ${MAX_FEE_RATIO}`);
    return { status: "deferred", note: "fee too high" };
  }

  const { child, btcNetwork } = await _internal_deriveUtxoChild(network, COLLECTOR_INDEX);
  const psbt = new bitcoin.Psbt({ network: btcNetwork });
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(child.publicKey), network: btcNetwork });
  for (const u of picked) {
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: { script: p2wpkh.output!, value: Number(u.value) },
    });
  }
  psbt.addOutput({ address: row.destination_address, value: Number(amountSats) });
  const change = total - amountSats - fee;
  if (change > 546n) {
    psbt.addOutput({ address: collectorAddress, value: Number(change) });
  }

  psbt.signAllInputs({
    publicKey: Buffer.from(child.publicKey),
    sign: (hash) => Buffer.from(child.sign(hash)),
  });
  psbt.finalizeAllInputs();
  const rawHex = psbt.extractTransaction().toHex();

  try {
    const txid = await utxoBroadcast(network, rawHex);
    await db
      .from("withdrawals")
      .update({
        tx_hash: txid,
        fee: (Number(fee) / 1e8).toFixed(8),
        status: "broadcast",
        last_attempt_at: new Date().toISOString(),
        attempt_count: row.attempt_count + 1,
      })
      .eq("id", row.id);
    await db
      .from("transactions")
      .update({ external_tx_hash: txid })
      .eq("user_id", row.user_id)
      .eq("type", "withdrawal")
      .eq("external_address", row.destination_address)
      .is("external_tx_hash", null);
    return { status: "broadcast", note: txid };
  } catch (e) {
    await bumpAttempt(db, row, String(e));
    return { status: "deferred", note: "broadcast failed" };
  }
}

// ---------- ETH ----------

async function broadcastEth(
  db: ReturnType<typeof getAdminDb>,
  row: WithdrawalRow,
  network: "ETH_MAINNET" | "ETH_SEPOLIA",
  collectorAddress: string,
): Promise<{ status: string; note?: string }> {
  const provider = evmProvider(network);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 30_000_000_000n;
  if (gasPrice > MAX_EVM_GWEI * 1_000_000_000n) {
    await bumpAttempt(db, row, `gas price ${gasPrice} exceeds cap`);
    return { status: "deferred", note: "gas cap" };
  }
  const gasLimit = 21_000n;
  const gasCost = gasPrice * gasLimit;
  const value = ethers.parseEther(row.amount);
  const feeRatio = Number(gasCost) / Number(value);
  if (feeRatio > MAX_FEE_RATIO) {
    await bumpAttempt(db, row, `fee ratio ${feeRatio.toFixed(3)} exceeds cap`);
    return { status: "deferred", note: "fee too high" };
  }

  const collectorBalance = await evmGetNativeBalance(network, collectorAddress);
  if (collectorBalance < value + gasCost) {
    await bumpAttempt(db, row, "collector short of ETH");
    return { status: "deferred", note: "collector short" };
  }

  const signer = (await _internal_deriveEvmSigner(network, COLLECTOR_INDEX)).connect(provider);
  try {
    const tx = await signer.sendTransaction({ to: row.destination_address, value, gasLimit });
    await db
      .from("withdrawals")
      .update({
        tx_hash: tx.hash,
        fee: ethers.formatEther(gasCost),
        status: "broadcast",
        last_attempt_at: new Date().toISOString(),
        attempt_count: row.attempt_count + 1,
      })
      .eq("id", row.id);
    await db
      .from("transactions")
      .update({ external_tx_hash: tx.hash })
      .eq("user_id", row.user_id)
      .eq("type", "withdrawal")
      .eq("external_address", row.destination_address)
      .is("external_tx_hash", null);
    return { status: "broadcast", note: tx.hash };
  } catch (e) {
    await bumpAttempt(db, row, String(e));
    return { status: "deferred", note: "eth broadcast failed" };
  }
}

// ---------- BSC USDT ----------

async function broadcastBscUsdt(
  db: ReturnType<typeof getAdminDb>,
  row: WithdrawalRow,
  network: "BSC_MAINNET" | "BSC_TESTNET",
  collectorAddress: string,
  tokenContract: string,
): Promise<{ status: string; note?: string }> {
  if (!tokenContract) {
    await refund(db, row, "USDT contract not configured");
    return { status: "refunded", note: "missing contract" };
  }
  const provider = evmProvider(network);
  const signer = (await _internal_deriveEvmSigner(network, COLLECTOR_INDEX)).connect(provider);
  const usdt = erc20Contract(network, tokenContract, signer);

  const amount = ethers.parseUnits(row.amount, 18);
  const balance = await (usdt.balanceOf as any)(collectorAddress) as bigint;
  if (balance < amount) {
    await bumpAttempt(db, row, "collector short of USDT");
    return { status: "deferred", note: "collector short" };
  }

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 3_000_000_000n;
  const gasEstimate = await (usdt.transfer as any).estimateGas(row.destination_address, amount).catch(() => 65_000n);
  const gasLimit = (gasEstimate * 12n) / 10n;
  const gasCost = gasPrice * gasLimit;

  const bnbBal = await evmGetNativeBalance(network, collectorAddress);
  if (bnbBal < gasCost) {
    await bumpAttempt(db, row, "collector short of BNB for gas");
    return { status: "deferred", note: "gas short" };
  }

  try {
    const tx = await (usdt.transfer as any)(row.destination_address, amount, { gasLimit });
    await db
      .from("withdrawals")
      .update({
        tx_hash: tx.hash,
        fee: ethers.formatEther(gasCost),
        status: "broadcast",
        last_attempt_at: new Date().toISOString(),
        attempt_count: row.attempt_count + 1,
      })
      .eq("id", row.id);
    await db
      .from("transactions")
      .update({ external_tx_hash: tx.hash })
      .eq("user_id", row.user_id)
      .eq("type", "withdrawal")
      .eq("external_address", row.destination_address)
      .is("external_tx_hash", null);
    return { status: "broadcast", note: tx.hash };
  } catch (e) {
    await bumpAttempt(db, row, String(e));
    return { status: "deferred", note: "usdt broadcast failed" };
  }
}

// ---------- Tron USDT (TRC20) ----------

async function broadcastTron(
  db: ReturnType<typeof getAdminDb>,
  row: WithdrawalRow,
  network: TronNetwork,
  collectorAddress: string,
  tokenContract: string,
): Promise<{ status: string; note?: string }> {
  if (!tokenContract) {
    await refund(db, row, "USDT (TRC20) contract not configured");
    return { status: "refunded", note: "missing contract" };
  }

  const amount = ethers.parseUnits(row.amount, TRON_USDT_DECIMALS);
  const balance = await tronGetTrc20Balance(network, collectorAddress, tokenContract);
  if (balance < amount) {
    await bumpAttempt(db, row, "collector short of USDT (TRC20)");
    return { status: "deferred", note: "collector short" };
  }

  // Worst-case fee (if the collector has no staked energy) is TRON_FEE_LIMIT_SUN.
  const trxBalance = await tronGetTrxBalance(network, collectorAddress);
  if (trxBalance < BigInt(TRON_FEE_LIMIT_SUN)) {
    await bumpAttempt(db, row, "collector short of TRX for energy/bandwidth");
    return { status: "deferred", note: "trx short" };
  }

  const signer = await _internal_deriveTronSigner(network, COLLECTOR_INDEX);

  try {
    const txId = await tronTransferTrc20({
      network,
      ownerAddress: collectorAddress,
      contractAddress: tokenContract,
      toAddress: row.destination_address,
      amountRaw: amount,
      feeLimitSun: TRON_FEE_LIMIT_SUN,
      signer,
    });
    await db
      .from("withdrawals")
      .update({
        tx_hash: txId,
        status: "broadcast",
        last_attempt_at: new Date().toISOString(),
        attempt_count: row.attempt_count + 1,
      })
      .eq("id", row.id);
    await db
      .from("transactions")
      .update({ external_tx_hash: txId })
      .eq("user_id", row.user_id)
      .eq("type", "withdrawal")
      .eq("external_address", row.destination_address)
      .is("external_tx_hash", null);
    return { status: "broadcast", note: txId };
  } catch (e) {
    await bumpAttempt(db, row, String(e));
    return { status: "deferred", note: "tron broadcast failed" };
  }
}

// ---------- Confirmation ----------

async function confirmBroadcast(db: ReturnType<typeof getAdminDb>) {
  const { data: broadcast } = await db
    .from("withdrawals")
    .select("id, network, tx_hash")
    .eq("status", "broadcast")
    .not("tx_hash", "is", null)
    .limit(50);
  if (!broadcast) return;

  for (const w of broadcast) {
    try {
      const confirmed = await isConfirmed(w.network, w.tx_hash!);
      if (confirmed) {
        await db
          .from("withdrawals")
          .update({ status: "confirmed" })
          .eq("id", w.id);
        await db
          .from("transactions")
          .update({ status: "completed" })
          .eq("external_tx_hash", w.tx_hash!);
      }
    } catch (e) {
      console.error(`[broadcast-withdrawals] confirm ${w.id} failed`, e);
    }
  }
}

async function isConfirmed(network: string, txHash: string): Promise<boolean> {
  if (network === "TRON_MAINNET" || network === "TRON_TESTNET") {
    const info = await tronGetTransactionInfo(network, txHash);
    if (info.blockNumber == null || !info.success) return false;
    const tip = await tronGetTipHeight(network);
    // ~19 blocks is Tron's common "solidified" threshold (~57s at 3s/block).
    return tip - info.blockNumber + 1 >= 19;
  }
  const utxo = network === "BTC_MAINNET" || network === "LTC_MAINNET" || network === "BTC_TESTNET" || network === "LTC_TESTNET";
  if (utxo) {
    const tip = await utxoGetTipHeight(network as "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET");
    const esploraUrls: Record<string, string> = {
      BTC_MAINNET: Deno.env.get("BTC_ESPLORA_URL") ?? "https://blockstream.info/api",
      LTC_MAINNET: Deno.env.get("LTC_ESPLORA_URL") ?? "https://litecoinspace.org/api",
      BTC_TESTNET: Deno.env.get("BTC_TESTNET_ESPLORA_URL") ?? "https://blockstream.info/testnet/api",
      LTC_TESTNET: Deno.env.get("LTC_TESTNET_ESPLORA_URL") ?? "https://litecoinspace.org/testnet/api",
    };
    const res = await fetch(`${esploraUrls[network]}/tx/${txHash}/status`);
    if (!res.ok) return false;
    const status = await res.json() as { confirmed?: boolean; block_height?: number };
    if (!status.confirmed || !status.block_height) return false;
    const confNeeds: Record<string, number> = {
      BTC_MAINNET: 3, LTC_MAINNET: 6, BTC_TESTNET: 1, LTC_TESTNET: 1,
    };
    return (tip - status.block_height + 1) >= confNeeds[network];
  }
  const provider = evmProvider(network as "ETH_MAINNET" | "BSC_MAINNET" | "ETH_SEPOLIA" | "BSC_TESTNET");
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return false;
  const tip = await provider.getBlockNumber();
  const evmConfNeeds: Record<string, number> = {
    ETH_MAINNET: 12, BSC_MAINNET: 15, ETH_SEPOLIA: 3, BSC_TESTNET: 3,
  };
  return (tip - receipt.blockNumber + 1) >= evmConfNeeds[network];
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
