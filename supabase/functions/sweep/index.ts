// Sweeper — consolidates funds from per-user deposit addresses into the
// per-network collector address. Runs from pg_cron every 15 minutes.
//
// Per-network rules:
//   BTC/LTC:  UTXO sweep — spend all confirmed UTXOs on the user address
//             to the collector, minus estimated fee. Idempotent via txid
//             recording in deposit_sweeps.
//   ETH:      Send (balance - gas cost) to collector. Requires the user
//             address to have any balance at all — sweep is entirely
//             self-funded from the deposit.
//   BSC/USDT: Two-step: (1) if user address has no BNB, gas-top-up from
//             collector; (2) once BNB is present, transfer full USDT
//             balance to collector.
//
// Every action is recorded in deposit_sweeps. Broadcast failure leaves
// the row in 'pending' with error_message set; the next tick retries.
//
// **Untested against mainnet.** UTXO fee estimation uses a flat sat/vB
// value from env; EVM gas uses the RPC estimate. Validate on small
// amounts before turning on for real user traffic.

import { Buffer } from "node:buffer";
import { getAdminDb, requireCronSecret } from "../_shared/db.ts";
import {
  NETWORK_META,
  _internal_deriveEvmSigner,
  _internal_deriveUtxoChild,
  bitcoin,
  ethers,
  type SupportedNetwork,
} from "../_shared/hd-wallet.ts";
import {
  utxoGetUtxos,
  utxoBroadcast,
  evmProvider,
  evmGetNativeBalance,
  erc20Contract,
} from "../_shared/rpc.ts";

// Minimum values (in the coin's native unit) below which a sweep is
// skipped — sweeping dust costs more than it recovers. Testnet minimums
// are tiny so faucet drips are enough to exercise the whole loop.
const SWEEP_MIN: Record<SupportedNetwork, bigint> = {
  BTC_MAINNET: 20_000n,             // 20k sats ~ $10 @ $50k/BTC
  LTC_MAINNET: 200_000n,            // ~0.002 LTC
  ETH_MAINNET: 5_000_000_000_000_000n, // 0.005 ETH — leaves headroom for gas
  BSC_MAINNET: 5_000_000_000_000_000_000n, // 5 USDT (BSC-USDT has 18 decimals)
  BTC_TESTNET: 1_000n,              // 1k sats
  LTC_TESTNET: 10_000n,
  ETH_SEPOLIA: 1_000_000_000_000_000n, // 0.001 SepETH
  BSC_TESTNET: 1_000_000_000_000_000_000n, // 1 tUSDT
};

function isUtxo(n: SupportedNetwork) { return NETWORK_META[n].chainKind === "utxo"; }
function isEvm(n: SupportedNetwork) { return NETWORK_META[n].chainKind === "evm"; }
function isBscLike(n: SupportedNetwork) { return n === "BSC_MAINNET" || n === "BSC_TESTNET"; }
function isEthLike(n: SupportedNetwork) { return n === "ETH_MAINNET" || n === "ETH_SEPOLIA"; }

// Gas top-up amount for BSC USDT sweeps (BNB, wei). ~$0.10 at typical BNB.
const BSC_TOPUP_WEI = 200_000_000_000_000n; // 0.0002 BNB

// UTXO fee rate: sat/vB. Env-overridable so the client can adapt.
const BTC_SAT_PER_VB = Number(Deno.env.get("BTC_SAT_PER_VB") ?? "10");
const LTC_SAT_PER_VB = Number(Deno.env.get("LTC_SAT_PER_VB") ?? "2");

// Safety belts. Every one of these bounds the amount of damage a single
// misconfiguration or mempool spike can do.
//   MAX_SWEEPS_PER_TICK      — hard cap on sweeps per network per tick.
//                              If the queue is bigger, later addresses
//                              wait for the next tick. Prevents a
//                              runaway loop draining an env var typo.
//   MAX_FEE_RATIO            — refuse a sweep if the estimated fee is
//                              more than this fraction of the amount.
//   MAX_EVM_GWEI             — refuse an EVM sweep if gas price exceeds
//                              this. Guards against mempool spikes.
//   MIN_CONFIRMATIONS_BEFORE_SWEEP — extra safety on top of Esplora's
//                              `confirmed` bit; we wait for this many
//                              confirmations before spending a UTXO to
//                              avoid reorg-driven double-spend attempts.
const MAX_SWEEPS_PER_TICK = Number(Deno.env.get("MAX_SWEEPS_PER_TICK") ?? "10");
const MAX_FEE_RATIO = Number(Deno.env.get("MAX_FEE_RATIO") ?? "0.05");
const MAX_EVM_GWEI = BigInt(Deno.env.get("MAX_EVM_GWEI") ?? "150");
const MIN_CONFIRMATIONS_BEFORE_SWEEP = Number(Deno.env.get("MIN_CONFIRMATIONS_BEFORE_SWEEP") ?? "6");

Deno.serve(async (req) => {
  try {
    requireCronSecret(req);
  } catch (r) {
    if (r instanceof Response) return r;
    throw r;
  }

  const db = getAdminDb();
  const summary: Record<string, unknown> = {};

  const { data: masters } = await db
    .from("master_wallets")
    .select("crypto_type, network, address, token_contract_address, active, purpose")
    .eq("purpose", "collector")
    .eq("active", true);

  const byNetwork = new Map((masters ?? []).map((m: any) => [m.network, m]));

  for (const network of Object.keys(NETWORK_META) as SupportedNetwork[]) {
    const master = byNetwork.get(network);
    if (!master || master.address.startsWith("PLACEHOLDER_")) {
      summary[network] = { skipped: "collector not configured" };
      continue;
    }
    try {
      summary[network] = await sweepNetwork(db, network, master);
    } catch (err) {
      console.error(`[sweep] ${network} failed`, err);
      summary[network] = { error: String(err) };
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { "content-type": "application/json" },
  });
});

async function sweepNetwork(
  db: ReturnType<typeof getAdminDb>,
  network: SupportedNetwork,
  master: { address: string; token_contract_address: string | null; crypto_type: string },
) {
  const { data: addrs } = await db
    .from("user_deposit_addresses")
    .select("id, address, derivation_index, crypto_type")
    .eq("network", network);
  if (!addrs || addrs.length === 0) return { swept: 0 };

  let swept = 0;
  let checked = 0;
  for (const a of addrs) {
    checked++;
    if (swept >= MAX_SWEEPS_PER_TICK) break;
    try {
      const did = await sweepAddress(db, network, master, a);
      if (did) swept++;
    } catch (err) {
      console.error(`[sweep] ${network} address ${a.address} failed`, err);
    }
  }
  return { swept, checked, tickCap: MAX_SWEEPS_PER_TICK };
}

async function sweepAddress(
  db: ReturnType<typeof getAdminDb>,
  network: SupportedNetwork,
  master: { address: string; token_contract_address: string | null; crypto_type: string },
  addr: { id: string; address: string; derivation_index: number; crypto_type: string },
): Promise<boolean> {
  // Skip if there's a still-pending sweep on this address; the previous
  // tick's broadcast might just be waiting for confirmations.
  const { data: pendingSweep } = await db
    .from("deposit_sweeps")
    .select("id")
    .eq("user_deposit_address_id", addr.id)
    .in("status", ["pending", "broadcast"])
    .maybeSingle();
  if (pendingSweep) return false;

  if (isUtxo(network)) {
    return sweepUtxo(db, network as "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET", master, addr);
  }
  if (isEthLike(network)) {
    return sweepEth(db, network as "ETH_MAINNET" | "ETH_SEPOLIA", master, addr);
  }
  return sweepBscUsdt(db, network as "BSC_MAINNET" | "BSC_TESTNET", master, addr);
}

// ---------- UTXO sweep ----------

async function sweepUtxo(
  db: ReturnType<typeof getAdminDb>,
  network: "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET",
  master: { address: string; crypto_type: string },
  addr: { id: string; address: string; derivation_index: number },
): Promise<boolean> {
  const esploraUrls: Record<string, string> = {
    BTC_MAINNET: Deno.env.get("BTC_ESPLORA_URL") ?? "https://blockstream.info/api",
    LTC_MAINNET: Deno.env.get("LTC_ESPLORA_URL") ?? "https://litecoinspace.org/api",
    BTC_TESTNET: Deno.env.get("BTC_TESTNET_ESPLORA_URL") ?? "https://blockstream.info/testnet/api",
    LTC_TESTNET: Deno.env.get("LTC_TESTNET_ESPLORA_URL") ?? "https://litecoinspace.org/testnet/api",
  };
  const tipRes = await fetch(esploraUrls[network] + "/blocks/tip/height");
  const tip = tipRes.ok ? Number(await tipRes.text()) : null;

  const utxos = await utxoGetUtxos(network, addr.address);
  // Reorg-safety: only spend UTXOs with enough confirmations. Esplora's
  // `confirmed` flag just means "in a block"; we want depth.
  const spendable = utxos.filter((u) => {
    if (!u.status.confirmed || !u.status.block_height || tip == null) return false;
    const conf = tip - u.status.block_height + 1;
    return conf >= MIN_CONFIRMATIONS_BEFORE_SWEEP;
  });
  const total = spendable.reduce((sum, u) => sum + BigInt(u.value), 0n);
  if (total < SWEEP_MIN[network]) return false;

  const { child, btcNetwork } = await _internal_deriveUtxoChild(network, addr.derivation_index);
  const isBtc = network === "BTC_MAINNET" || network === "BTC_TESTNET";
  const satPerVb = isBtc ? BTC_SAT_PER_VB : LTC_SAT_PER_VB;

  // Rough fee: 1 input ~ 68 vB (P2WPKH), 1 output ~ 31 vB, header ~ 10.5.
  const estVBytes = 10 + spendable.length * 68 + 31;
  const fee = BigInt(Math.ceil(estVBytes * satPerVb));
  if (fee >= total) return false;
  if (Number(fee) / Number(total) > MAX_FEE_RATIO) return false;
  const sendAmount = total - fee;
  const confirmed = spendable;

  const psbt = new bitcoin.Psbt({ network: btcNetwork });
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(child.publicKey), network: btcNetwork });
  for (const u of confirmed) {
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: { script: p2wpkh.output!, value: Number(u.value) },
    });
  }
  psbt.addOutput({ address: master.address, value: Number(sendAmount) });

  psbt.signAllInputs({
    publicKey: Buffer.from(child.publicKey),
    sign: (hash) => Buffer.from(child.sign(hash)),
  });
  psbt.finalizeAllInputs();
  const rawHex = psbt.extractTransaction().toHex();

  const { data: sweep } = await db
    .from("deposit_sweeps")
    .insert({
      network,
      crypto_type: master.crypto_type,
      user_deposit_address_id: addr.id,
      from_address: addr.address,
      to_address: master.address,
      amount: (Number(sendAmount) / 1e8).toFixed(8),
      fee: (Number(fee) / 1e8).toFixed(8),
      status: "pending",
    })
    .select("id")
    .single();

  try {
    const txid = await utxoBroadcast(network, rawHex);
    await db.from("deposit_sweeps").update({ tx_hash: txid, status: "broadcast" }).eq("id", sweep!.id);
    return true;
  } catch (err) {
    await db
      .from("deposit_sweeps")
      .update({ status: "failed", error_message: String(err) })
      .eq("id", sweep!.id);
    return false;
  }
}

// ---------- ETH sweep ----------

async function sweepEth(
  db: ReturnType<typeof getAdminDb>,
  network: "ETH_MAINNET" | "ETH_SEPOLIA",
  master: { address: string; crypto_type: string },
  addr: { id: string; address: string; derivation_index: number },
): Promise<boolean> {
  const provider = evmProvider(network);
  const balance = await evmGetNativeBalance(network, addr.address);
  if (balance < SWEEP_MIN[network]) return false;

  const signer = (await _internal_deriveEvmSigner(network, addr.derivation_index)).connect(provider);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 20_000_000_000n;
  if (gasPrice > MAX_EVM_GWEI * 1_000_000_000n) return false;
  const gasLimit = 21_000n;
  const gasCost = gasPrice * gasLimit;
  if (balance <= gasCost) return false;
  const value = balance - gasCost;
  if (Number(gasCost) / Number(value) > MAX_FEE_RATIO) return false;

  const { data: sweep } = await db
    .from("deposit_sweeps")
    .insert({
      network,
      crypto_type: master.crypto_type,
      user_deposit_address_id: addr.id,
      from_address: addr.address,
      to_address: master.address,
      amount: ethers.formatEther(value),
      fee: ethers.formatEther(gasCost),
      status: "pending",
    })
    .select("id")
    .single();

  try {
    const tx = await signer.sendTransaction({
      to: master.address,
      value,
      gasLimit,
    });
    await db.from("deposit_sweeps").update({ tx_hash: tx.hash, status: "broadcast" }).eq("id", sweep!.id);
    return true;
  } catch (err) {
    await db.from("deposit_sweeps").update({ status: "failed", error_message: String(err) }).eq("id", sweep!.id);
    return false;
  }
}

// ---------- BSC USDT sweep (two-step) ----------

async function sweepBscUsdt(
  db: ReturnType<typeof getAdminDb>,
  network: "BSC_MAINNET" | "BSC_TESTNET",
  master: { address: string; token_contract_address: string | null; crypto_type: string },
  addr: { id: string; address: string; derivation_index: number },
): Promise<boolean> {
  if (!master.token_contract_address) throw new Error(`${network} missing token_contract_address`);
  const provider = evmProvider(network);
  const signer = (await _internal_deriveEvmSigner(network, addr.derivation_index)).connect(provider);

  const usdt = erc20Contract(network, master.token_contract_address, signer);
  const [tokenBal, bnbBal] = await Promise.all([
    (usdt.balanceOf as any)(addr.address).then((b: bigint) => b),
    evmGetNativeBalance(network, addr.address),
  ]);

  if (tokenBal < SWEEP_MIN[network]) return false;

  // Step 1: if the user address has no BNB, top up from the collector.
  // The collector holds BNB for this purpose — keep a small operating
  // balance there. This is why the collector needs to be funded before
  // enabling BSC deposits.
  if (bnbBal < BSC_TOPUP_WEI / 2n) {
    await topUpBscGas(db, network, master, addr);
    return false; // wait for top-up to confirm; sweep next tick
  }

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 3_000_000_000n;
  if (gasPrice > MAX_EVM_GWEI * 1_000_000_000n) return false;
  const gasEstimate = await (usdt.transfer as any).estimateGas(master.address, tokenBal).catch(() => 65_000n);
  const gasLimit = (gasEstimate * 12n) / 10n;
  const gasCost = gasPrice * gasLimit;
  if (bnbBal < gasCost) {
    await topUpBscGas(db, network, master, addr);
    return false;
  }

  const { data: sweep } = await db
    .from("deposit_sweeps")
    .insert({
      network,
      crypto_type: master.crypto_type,
      user_deposit_address_id: addr.id,
      from_address: addr.address,
      to_address: master.address,
      amount: ethers.formatUnits(tokenBal, 18),
      fee: ethers.formatEther(gasCost),
      status: "pending",
    })
    .select("id")
    .single();

  try {
    const tx = await (usdt.transfer as any)(master.address, tokenBal, { gasLimit });
    await db.from("deposit_sweeps").update({ tx_hash: tx.hash, status: "broadcast" }).eq("id", sweep!.id);
    return true;
  } catch (err) {
    await db.from("deposit_sweeps").update({ status: "failed", error_message: String(err) }).eq("id", sweep!.id);
    return false;
  }
}

async function topUpBscGas(
  db: ReturnType<typeof getAdminDb>,
  network: "BSC_MAINNET" | "BSC_TESTNET",
  master: { address: string; crypto_type: string },
  addr: { id: string; address: string; derivation_index: number },
) {
  const provider = evmProvider(network);
  const collectorSigner = (await _internal_deriveEvmSigner(network, 0)).connect(provider);
  try {
    const tx = await collectorSigner.sendTransaction({
      to: addr.address,
      value: BSC_TOPUP_WEI,
    });
    await db.from("deposit_sweeps").insert({
      network,
      crypto_type: "BNB",
      user_deposit_address_id: addr.id,
      from_address: master.address,
      to_address: addr.address,
      amount: ethers.formatEther(BSC_TOPUP_WEI),
      tx_hash: tx.hash,
      status: "broadcast",
      error_message: "gas_topup",
    });
  } catch (err) {
    console.error(`[sweep] ${network} gas top-up failed`, err);
  }
}
