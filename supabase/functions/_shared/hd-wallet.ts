// Shared HD-wallet derivation and signing helpers for Supabase Edge
// Functions. Deno runtime; imports npm packages via the `npm:` specifier.
//
// The BIP-39 mnemonic is encrypted at rest in the WALLET_ENCRYPTED_SEED
// secret and unlocked once per cold-start using WALLET_MASTER_KEY. The
// derived seed and root HDNode are cached in module scope so warm
// invocations skip re-decryption.
//
// SECURITY: any code with access to these secrets can drain every user's
// balance. Do NOT log the mnemonic, the raw seed, or any child private key.
// The exported helpers return addresses (public) or a signed transaction
// hex (public) — never a private key.

import { Buffer } from "node:buffer";
import * as bip39 from "npm:bip39@3.1.0";
import { BIP32Factory } from "npm:bip32@4.0.0";
import * as ecc from "npm:tiny-secp256k1@2.2.3";
import * as bitcoin from "npm:bitcoinjs-lib@6.1.5";
import { ethers } from "npm:ethers@6.13.4";

const bip32 = BIP32Factory(ecc);

// ---------- Network configs ----------

const LITECOIN_MAINNET = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip32: { public: 0x019da462, private: 0x019d9cfe },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

// Litecoin testnet4 uses tltc1 bech32 addresses. Version bytes taken from
// litecoin-project/litecoin chainparams.cpp testnet block.
const LITECOIN_TESTNET = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "tltc",
  bip32: { public: 0x0436f6e1, private: 0x0436ef7d },
  pubKeyHash: 0x6f,
  scriptHash: 0x3a,
  wif: 0xef,
};

export type SupportedNetwork =
  | "BTC_MAINNET"
  | "LTC_MAINNET"
  | "ETH_MAINNET"
  | "BSC_MAINNET"
  | "TRON_MAINNET"
  | "BTC_TESTNET"
  | "LTC_TESTNET"
  | "ETH_SEPOLIA"
  | "BSC_TESTNET"
  | "TRON_TESTNET";

export const NETWORK_META: Record<SupportedNetwork, {
  cryptoType: string;
  chainKind: "utxo" | "evm" | "tron";
  bip44Path: (i: number) => string;
  btcNetwork?: bitcoin.Network;
  evmChainId?: bigint;
  isTestnet: boolean;
}> = {
  // Mainnet
  BTC_MAINNET: {
    cryptoType: "BTC",
    chainKind: "utxo",
    bip44Path: (i) => `m/84'/0'/0'/0/${i}`,
    btcNetwork: bitcoin.networks.bitcoin,
    isTestnet: false,
  },
  LTC_MAINNET: {
    cryptoType: "LTC",
    chainKind: "utxo",
    bip44Path: (i) => `m/84'/2'/0'/0/${i}`,
    btcNetwork: LITECOIN_MAINNET as unknown as bitcoin.Network,
    isTestnet: false,
  },
  ETH_MAINNET: {
    cryptoType: "ETH",
    chainKind: "evm",
    bip44Path: (i) => `m/44'/60'/0'/0/${i}`,
    evmChainId: 1n,
    isTestnet: false,
  },
  BSC_MAINNET: {
    cryptoType: "USDT",
    chainKind: "evm",
    bip44Path: (i) => `m/44'/60'/0'/0/${i}`,
    evmChainId: 56n,
    isTestnet: false,
  },
  // Tron uses the same secp256k1 curve and address hash (keccak256 of the
  // uncompressed pubkey, last 20 bytes) as Ethereum — a Tron address is that
  // same 20-byte value, just base58check-encoded with a 0x41 prefix instead
  // of shown as "0x...". See tronAddressFromEvmAddress below. SLIP-44 coin
  // type 195 (https://github.com/satoshilabs/slips/blob/master/slip-0044.md).
  TRON_MAINNET: {
    cryptoType: "USDT",
    chainKind: "tron",
    bip44Path: (i) => `m/44'/195'/0'/0/${i}`,
    isTestnet: false,
  },
  // Testnet — coin_type 1 for UTXO (SLIP-44), chain-id 60 stays for EVM
  // (same key on every EVM chain). The address on testnet EVM equals the
  // address on mainnet EVM — a security note, since anyone who watches
  // your mainnet withdrawals can also send Sepolia dust to test-detect
  // your infra. Not a funds risk, but worth knowing.
  BTC_TESTNET: {
    cryptoType: "BTC",
    chainKind: "utxo",
    bip44Path: (i) => `m/84'/1'/0'/0/${i}`,
    btcNetwork: bitcoin.networks.testnet,
    isTestnet: true,
  },
  LTC_TESTNET: {
    cryptoType: "LTC",
    chainKind: "utxo",
    bip44Path: (i) => `m/84'/1'/0'/0/${i}`,
    btcNetwork: LITECOIN_TESTNET as unknown as bitcoin.Network,
    isTestnet: true,
  },
  ETH_SEPOLIA: {
    cryptoType: "ETH",
    chainKind: "evm",
    bip44Path: (i) => `m/44'/60'/0'/0/${i}`,
    evmChainId: 11155111n,
    isTestnet: true,
  },
  BSC_TESTNET: {
    cryptoType: "USDT",
    chainKind: "evm",
    bip44Path: (i) => `m/44'/60'/0'/0/${i}`,
    evmChainId: 97n,
    isTestnet: true,
  },
  // Nile is Tron's standard public testnet (coin_type 195 is unchanged — Tron
  // doesn't have a separate SLIP-44 testnet coin type the way BTC/LTC do).
  TRON_TESTNET: {
    cryptoType: "USDT",
    chainKind: "tron",
    bip44Path: (i) => `m/44'/195'/0'/0/${i}`,
    isTestnet: true,
  },
};

export const ALL_NETWORKS = Object.keys(NETWORK_META) as SupportedNetwork[];

// ---------- Tron address encoding ----------
// No Tron SDK dependency (tronweb is heavy and has a history of Deno
// compatibility issues) — just the base58check encoding Tron uses on top of
// the same 20-byte address ethers already computes for an EVM key.

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte === 0) leadingZeros++;
    else break;
  }
  return BASE58_ALPHABET[0]!.repeat(leadingZeros) + digits.reverse().map((d) => BASE58_ALPHABET[d]).join("");
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

/**
 * Tron address = 0x41 prefix + the same 20-byte hash Ethereum uses for an
 * address (keccak256 of the uncompressed pubkey, last 20 bytes) + a 4-byte
 * double-SHA256 checksum, base58-encoded. Same underlying key, same 20
 * bytes — Tron just displays it differently than Ethereum's "0x...".
 */
export async function tronAddressFromEvmAddress(evmAddress: string): Promise<string> {
  const body = Buffer.from(evmAddress.replace(/^0x/i, ""), "hex");
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(body, 1);
  const checksum = await sha256(await sha256(payload));
  const full = new Uint8Array(25);
  full.set(payload, 0);
  full.set(checksum.slice(0, 4), 21);
  return base58Encode(full);
}

// ---------- Secret unwrapping ----------

let cachedSeed: Uint8Array | null = null;

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function decryptSeedOnce(): Promise<Uint8Array> {
  if (cachedSeed) return cachedSeed;

  const encoded = Deno.env.get("WALLET_ENCRYPTED_SEED");
  const keyB64 = Deno.env.get("WALLET_MASTER_KEY");
  if (!encoded || !keyB64) {
    throw new Error("Wallet secrets not configured: set WALLET_ENCRYPTED_SEED and WALLET_MASTER_KEY.");
  }

  const blob = b64decode(encoded);
  const iv = blob.slice(0, 12);
  const tag = blob.slice(12, 28);
  const ciphertext = blob.slice(28);

  const key = await crypto.subtle.importKey(
    "raw",
    b64decode(keyB64),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // WebCrypto AES-GCM expects ciphertext || tag concatenated.
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const plaintextBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, combined);
  const mnemonic = new TextDecoder().decode(plaintextBuf).trim();
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error("Decrypted seed is not a valid BIP-39 mnemonic — check WALLET_MASTER_KEY.");
  }

  cachedSeed = new Uint8Array(await bip39.mnemonicToSeed(mnemonic));
  return cachedSeed;
}

// ---------- Public API ----------

export type DerivedAddress = {
  network: SupportedNetwork;
  index: number;
  address: string;
};

export async function deriveAddress(
  network: SupportedNetwork,
  index: number,
): Promise<DerivedAddress> {
  const seed = await decryptSeedOnce();
  const meta = NETWORK_META[network];

  if (meta.chainKind === "utxo") {
    const root = bip32.fromSeed(Buffer.from(seed), meta.btcNetwork!);
    const child = root.derivePath(meta.bip44Path(index));
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(child.publicKey),
      network: meta.btcNetwork,
    });
    if (!address) throw new Error(`Failed to derive UTXO address for ${network}#${index}`);
    return { network, index, address };
  }

  const node = ethers.HDNodeWallet.fromSeed(seed).derivePath(meta.bip44Path(index));
  if (meta.chainKind === "tron") {
    return { network, index, address: await tronAddressFromEvmAddress(node.address) };
  }
  return { network, index, address: node.address };
}

/**
 * INTERNAL: returns a signing wallet. Never log or persist the returned
 * object. The private key lives only for the lifetime of the call chain.
 */
export async function _internal_deriveEvmSigner(
  network: SupportedNetwork,
  index: number,
): Promise<ethers.HDNodeWallet> {
  const meta = NETWORK_META[network];
  if (meta.chainKind !== "evm") throw new Error(`${network} is not an EVM network`);
  const seed = await decryptSeedOnce();
  return ethers.HDNodeWallet.fromSeed(seed).derivePath(meta.bip44Path(index));
}

/**
 * INTERNAL: returns a signing wallet for a Tron network. Same key math as
 * _internal_deriveEvmSigner (Tron uses secp256k1 + Ethereum-style recoverable
 * ECDSA signatures too) — only the derivation path and address encoding
 * differ, both handled elsewhere. Tron transaction signing (in
 * _shared/tron.ts) uses this wallet's `.signingKey.sign(digest)`.
 */
export async function _internal_deriveTronSigner(
  network: SupportedNetwork,
  index: number,
): Promise<ethers.HDNodeWallet> {
  const meta = NETWORK_META[network];
  if (meta.chainKind !== "tron") throw new Error(`${network} is not a Tron network`);
  const seed = await decryptSeedOnce();
  return ethers.HDNodeWallet.fromSeed(seed).derivePath(meta.bip44Path(index));
}

/**
 * INTERNAL: returns a BIP32 child capable of signing. UTXO-only.
 */
export async function _internal_deriveUtxoChild(
  network: SupportedNetwork,
  index: number,
) {
  const meta = NETWORK_META[network];
  if (meta.chainKind !== "utxo") throw new Error(`${network} is not a UTXO network`);
  const seed = await decryptSeedOnce();
  const root = bip32.fromSeed(Buffer.from(seed), meta.btcNetwork!);
  return {
    child: root.derivePath(meta.bip44Path(index)),
    btcNetwork: meta.btcNetwork!,
  };
}

export { bitcoin, ethers };
