// Thin RPC/explorer clients for the four supported mainnet networks. All
// endpoints below have a free tier that does not require an API key; if
// rate limits become a problem, drop in an Alchemy/QuickNode/GetBlock URL
// via the *_RPC_URL env vars.
//
// Each network exposes:
//   getTipHeight()        — current chain tip block number
//   listIncomingTxSince() — new incoming txs to a set of watched addresses
//                            since a given block/txid checkpoint
//   getBalance()          — balance of one address (satoshis / wei / token base)
//   broadcast()           — submit a signed tx hex to the network
//
// UTXO networks (BTC, LTC) use Esplora — the same schema for both.
// EVM networks (ETH, BSC) use JSON-RPC.

import { ethers } from "npm:ethers@6.13.4";

export type UtxoIncomingTx = {
  txid: string;
  network: string;
  address: string;       // the watched address it landed on
  amountSats: bigint;
  blockHeight: number | null;
  confirmations: number;
};

export type EvmIncomingTx = {
  txHash: string;
  network: string;
  address: string;       // the watched address (lowercased)
  amountWei: bigint;     // native (ETH/BNB); for tokens see amountTokenBase
  amountTokenBase?: bigint;
  tokenContract?: string;
  blockHeight: number | null;
  confirmations: number;
};

// ---------- UTXO (Esplora) ----------

const ESPLORA_URLS: Record<string, string> = {
  BTC_MAINNET: Deno.env.get("BTC_ESPLORA_URL") ?? "https://blockstream.info/api",
  LTC_MAINNET: Deno.env.get("LTC_ESPLORA_URL") ?? "https://litecoinspace.org/api",
  BTC_TESTNET: Deno.env.get("BTC_TESTNET_ESPLORA_URL") ?? "https://blockstream.info/testnet/api",
  LTC_TESTNET: Deno.env.get("LTC_TESTNET_ESPLORA_URL") ?? "https://litecoinspace.org/testnet/api",
};

async function esploraGet<T>(network: string, path: string): Promise<T> {
  const base = ESPLORA_URLS[network];
  if (!base) throw new Error(`Unknown UTXO network: ${network}`);
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`Esplora ${network} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function utxoGetTipHeight(network: string): Promise<number> {
  const h = await esploraGet<number>(network, "/blocks/tip/height");
  return Number(h);
}

/** Fetch address history. Returns most-recent-first. */
async function esploraAddressTxs(network: string, address: string) {
  return esploraGet<Array<{
    txid: string;
    status: { confirmed: boolean; block_height: number | null };
    vin: Array<{ prevout?: { scriptpubkey_address?: string } }>;
    vout: Array<{ scriptpubkey_address?: string; value: number }>;
  }>>(network, `/address/${address}/txs`);
}

export async function utxoListIncoming(
  network: "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET",
  address: string,
  tipHeight: number,
): Promise<UtxoIncomingTx[]> {
  const txs = await esploraAddressTxs(network, address);
  const out: UtxoIncomingTx[] = [];
  for (const tx of txs) {
    let received = 0n;
    for (const vout of tx.vout) {
      if (vout.scriptpubkey_address === address) received += BigInt(vout.value);
    }
    if (received === 0n) continue;
    const blockHeight = tx.status.block_height;
    out.push({
      txid: tx.txid,
      network,
      address,
      amountSats: received,
      blockHeight,
      confirmations: blockHeight ? Math.max(0, tipHeight - blockHeight + 1) : 0,
    });
  }
  return out;
}

export async function utxoGetUtxos(
  network: "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET",
  address: string,
) {
  return esploraGet<Array<{
    txid: string;
    vout: number;
    value: number;
    status: { confirmed: boolean; block_height: number | null };
  }>>(network, `/address/${address}/utxo`);
}

export async function utxoBroadcast(
  network: "BTC_MAINNET" | "LTC_MAINNET" | "BTC_TESTNET" | "LTC_TESTNET",
  rawHex: string,
): Promise<string> {
  const base = ESPLORA_URLS[network];
  const res = await fetch(`${base}/tx`, { method: "POST", body: rawHex });
  if (!res.ok) throw new Error(`Broadcast ${network} -> ${res.status}: ${await res.text()}`);
  return (await res.text()).trim();
}

// ---------- EVM (JSON-RPC) ----------

const EVM_RPC_URLS: Record<string, string> = {
  ETH_MAINNET: Deno.env.get("ETH_RPC_URL") ?? "https://ethereum-rpc.publicnode.com",
  BSC_MAINNET: Deno.env.get("BSC_RPC_URL") ?? "https://bsc-dataseed.binance.org",
  ETH_SEPOLIA: Deno.env.get("ETH_SEPOLIA_RPC_URL") ?? "https://ethereum-sepolia-rpc.publicnode.com",
  BSC_TESTNET: Deno.env.get("BSC_TESTNET_RPC_URL") ?? "https://data-seed-prebsc-1-s1.binance.org:8545",
};

type EvmNetwork = EvmNetwork | "ETH_SEPOLIA" | "BSC_TESTNET";

const providers = new Map<string, ethers.JsonRpcProvider>();

export function evmProvider(network: EvmNetwork): ethers.JsonRpcProvider {
  let p = providers.get(network);
  if (!p) {
    const url = EVM_RPC_URLS[network];
    if (!url) throw new Error(`Unknown EVM network: ${network}`);
    p = new ethers.JsonRpcProvider(url);
    providers.set(network, p);
  }
  return p;
}

export async function evmGetTipHeight(network: EvmNetwork): Promise<number> {
  return evmProvider(network).getBlockNumber();
}

/** ERC-20 Transfer(address,address,uint256) topic. */
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Scan a block range for incoming native or token transfers to `addresses`. */
export async function evmListIncoming(params: {
  network: EvmNetwork;
  fromBlock: number;
  toBlock: number;
  addresses: string[];              // lowercased watched addresses
  tokenContract?: string;           // if set, watch ERC-20 Transfers instead of native
}): Promise<EvmIncomingTx[]> {
  const p = evmProvider(params.network);
  const set = new Set(params.addresses.map((a) => a.toLowerCase()));
  const tip = params.toBlock;
  const out: EvmIncomingTx[] = [];

  if (params.tokenContract) {
    // ERC-20 Transfer scan via getLogs.
    const topics: Array<string | null | string[]> = [
      ERC20_TRANSFER_TOPIC,
      null,
      params.addresses.map((a) => ethers.zeroPadValue(ethers.getAddress(a), 32).toLowerCase()),
    ];
    const logs = await p.getLogs({
      address: params.tokenContract,
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
      topics: topics as any,
    });
    for (const log of logs) {
      const to = "0x" + log.topics[2].slice(26);
      if (!set.has(to.toLowerCase())) continue;
      const amount = BigInt(log.data);
      out.push({
        txHash: log.transactionHash,
        network: params.network,
        address: to.toLowerCase(),
        amountWei: 0n,
        amountTokenBase: amount,
        tokenContract: params.tokenContract,
        blockHeight: log.blockNumber,
        confirmations: Math.max(0, tip - log.blockNumber + 1),
      });
    }
    return out;
  }

  // Native transfer scan: iterate blocks. Cheap on BSC, tolerable on ETH
  // for small ranges (< 20 blocks) — the caller enforces range size.
  for (let b = params.fromBlock; b <= params.toBlock; b++) {
    const block = await p.getBlock(b, true);
    if (!block) continue;
    for (const tx of block.prefetchedTransactions) {
      if (!tx.to) continue;
      if (!set.has(tx.to.toLowerCase())) continue;
      if (tx.value === 0n) continue;
      out.push({
        txHash: tx.hash,
        network: params.network,
        address: tx.to.toLowerCase(),
        amountWei: tx.value,
        blockHeight: b,
        confirmations: Math.max(0, tip - b + 1),
      });
    }
  }
  return out;
}

export async function evmGetNativeBalance(
  network: EvmNetwork,
  address: string,
): Promise<bigint> {
  return evmProvider(network).getBalance(address);
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export function erc20Contract(
  network: EvmNetwork,
  contract: string,
  signerOrProvider?: ethers.Signer | ethers.Provider,
) {
  return new ethers.Contract(contract, ERC20_ABI, signerOrProvider ?? evmProvider(network));
}
