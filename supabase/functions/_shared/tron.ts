// Thin RPC client for Tron (TronGrid's full-node HTTP API), matching the
// style of rpc.ts's UTXO/EVM clients — deliberately no tronweb dependency.
// TronGrid's own full node does the protobuf transaction serialization for
// us (via /wallet/triggersmartcontract): we only sign the txID it returns
// and broadcast the signed result. See hd-wallet.ts's tronAddressFromEvmAddress
// comment for why Tron needs no separate key-derivation library either —
// same secp256k1 math as Ethereum, just a different address encoding.
//
// Withdrawal (USDT-TRC20) only — no deposit-side scanning here. Enabling
// Tron deposits is a separate, not-yet-done follow-up (would need this
// file's account/event-scan equivalent of rpc.ts's evmListIncoming, plus
// entries in derive-address/index.ts's ALLOWED list and sweep/index.ts).
import { Buffer } from "node:buffer";
import { ethers } from "npm:ethers@6.13.4";

export type TronNetwork = "TRON_MAINNET" | "TRON_TESTNET";

const TRON_RPC_URLS: Record<TronNetwork, string> = {
  TRON_MAINNET: Deno.env.get("TRON_RPC_URL") ?? "https://api.trongrid.io",
  TRON_TESTNET: Deno.env.get("TRON_TESTNET_RPC_URL") ?? "https://nile.trongrid.io",
};

/** TRC20 USDT uses 6 decimals (unlike this project's BSC-pegged USDT, which uses 18). */
export const TRON_USDT_DECIMALS = 6;

function tronHeaders(): Record<string, string> {
  const key = Deno.env.get("TRONGRID_API_KEY");
  return key ? { "TRON-PRO-API-KEY": key } : {};
}

async function tronPost<T>(network: TronNetwork, path: string, body: unknown): Promise<T> {
  const base = TRON_RPC_URLS[network];
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tronHeaders() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Tron ${network} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Tron's error `message` fields on failed calls are hex-encoded ASCII. */
function decodeTronMessage(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  try {
    return Buffer.from(hex, "hex").toString("utf8") || fallback;
  } catch {
    return fallback;
  }
}

// ---------- base58 (decode only — encoding lives in hd-wallet.ts, used for
// address derivation; this file only ever needs to go the other way, to
// turn a base58 address back into the raw hex ABI calldata needs) ----------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array {
  let num = 0n;
  for (const ch of s) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base58 character in Tron address: ${s}`);
    num = num * 58n + BigInt(idx);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = hex === "0" ? new Uint8Array(0) : Uint8Array.from(Buffer.from(hex, "hex"));
  let leadingZeros = 0;
  for (const ch of s) {
    if (ch === "1") leadingZeros++;
    else break;
  }
  const out = new Uint8Array(leadingZeros + body.length);
  out.set(body, leadingZeros);
  return out;
}

/** Tron base58check address -> its 20-byte body, ABI-padded to 32 bytes hex (no 0x prefix), for embedding in TRC20 call parameters. */
function tronAddressToPaddedHex(address: string): string {
  const full = base58Decode(address); // 0x41 prefix + 20-byte body + 4-byte checksum = 25 bytes
  if (full.length !== 25) throw new Error(`Not a valid Tron address: ${address}`);
  const body = full.slice(1, 21);
  return "0".repeat(24) + Buffer.from(body).toString("hex");
}

export function isValidTronAddress(address: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false;
  try {
    return base58Decode(address).length === 25;
  } catch {
    return false;
  }
}

export async function tronGetTrc20Balance(
  network: TronNetwork,
  ownerAddress: string,
  contractAddress: string,
): Promise<bigint> {
  const res = await tronPost<{ constant_result?: string[] }>(network, "/wallet/triggerconstantcontract", {
    owner_address: ownerAddress,
    contract_address: contractAddress,
    function_selector: "balanceOf(address)",
    parameter: tronAddressToPaddedHex(ownerAddress),
    visible: true,
  });
  const hex = res.constant_result?.[0];
  if (!hex) throw new Error("Tron balanceOf call returned no result");
  return BigInt("0x" + hex);
}

export async function tronGetTrxBalance(network: TronNetwork, address: string): Promise<bigint> {
  const res = await tronPost<{ balance?: number }>(network, "/wallet/getaccount", { address, visible: true });
  return BigInt(res.balance ?? 0);
}

type TronBuiltTransaction = {
  txID: string;
  raw_data: unknown;
  raw_data_hex: string;
};

async function buildTrc20Transfer(params: {
  network: TronNetwork;
  ownerAddress: string;
  contractAddress: string;
  toAddress: string;
  amountRaw: bigint;
  feeLimitSun: number;
}): Promise<TronBuiltTransaction> {
  const parameter = tronAddressToPaddedHex(params.toAddress) + params.amountRaw.toString(16).padStart(64, "0");
  const res = await tronPost<{
    transaction?: TronBuiltTransaction;
    result?: { result: boolean; message?: string };
  }>(params.network, "/wallet/triggersmartcontract", {
    owner_address: params.ownerAddress,
    contract_address: params.contractAddress,
    function_selector: "transfer(address,uint256)",
    parameter,
    fee_limit: params.feeLimitSun,
    call_value: 0,
    visible: true,
  });
  if (!res.transaction) {
    throw new Error(`Tron triggersmartcontract failed: ${decodeTronMessage(res.result?.message, "no transaction returned")}`);
  }
  return res.transaction;
}

async function signAndBroadcast(
  network: TronNetwork,
  tx: TronBuiltTransaction,
  signer: ethers.HDNodeWallet,
): Promise<string> {
  const digest = "0x" + tx.txID;
  const sig = signer.signingKey.sign(digest);
  // Tron wants the same r(32) + s(32) + recovery-id(1) shape Ethereum's
  // recoverable ECDSA signatures use — ethers' v is 27/28, Tron wants 0/1.
  const recoveryByte = (sig.v - 27).toString(16).padStart(2, "0");
  const signatureHex = sig.r.slice(2) + sig.s.slice(2) + recoveryByte;

  const res = await tronPost<{ result?: boolean; code?: string; message?: string }>(
    network,
    "/wallet/broadcasttransaction",
    { ...tx, signature: [signatureHex] },
  );
  if (!res.result) {
    throw new Error(`Tron broadcast failed: ${decodeTronMessage(res.message, res.code ?? "unknown error")}`);
  }
  return tx.txID;
}

/** Builds, signs and broadcasts a TRC20 transfer in one call — the withdrawal broadcaster's single entry point into this file. */
export async function tronTransferTrc20(params: {
  network: TronNetwork;
  ownerAddress: string;
  contractAddress: string;
  toAddress: string;
  amountRaw: bigint;
  feeLimitSun: number;
  signer: ethers.HDNodeWallet;
}): Promise<string> {
  const tx = await buildTrc20Transfer(params);
  return signAndBroadcast(params.network, tx, params.signer);
}

export async function tronGetTipHeight(network: TronNetwork): Promise<number> {
  const res = await tronPost<{ block_header?: { raw_data?: { number?: number } } }>(
    network,
    "/wallet/getnowblock",
    {},
  );
  return res.block_header?.raw_data?.number ?? 0;
}

export async function tronGetTransactionInfo(
  network: TronNetwork,
  txId: string,
): Promise<{ blockNumber: number | null; success: boolean | null }> {
  const res = await tronPost<{ blockNumber?: number; receipt?: { result?: string } }>(
    network,
    "/wallet/gettransactioninfobyid",
    { value: txId },
  );
  if (res.blockNumber == null) return { blockNumber: null, success: null };
  return { blockNumber: res.blockNumber, success: res.receipt?.result === "SUCCESS" };
}
