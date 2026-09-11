#!/usr/bin/env node
// One-time offline seed generator for the CEMP hot HD wallet.
//
// **THIS SCRIPT MUST BE RUN OFFLINE** — ideally on an air-gapped machine, or
// at minimum on a laptop with Wi-Fi disabled. It generates a BIP-39
// mnemonic that controls every user deposit address on mainnet. Anyone with
// this mnemonic can drain every balance.
//
// What it produces:
//   - The mnemonic (write it on paper, seal it in an envelope, store in a
//     safe. This is the ONLY recovery path — losing it = losing all funds.)
//   - WALLET_MASTER_KEY (32 random bytes, base64) — the AES-256-GCM key
//     that decrypts the seed inside Supabase Edge Functions.
//   - WALLET_ENCRYPTED_SEED (ciphertext blob, base64) — the mnemonic
//     encrypted with the master key.
//   - The public collector addresses for BTC / LTC / ETH / BSC / TRON, to
//     paste into the seed-mainnet-collectors migration before running it.
//
// Where to put the outputs:
//   MASTER_KEY + ENCRYPTED_SEED    -> Supabase project secrets, via
//                                     `supabase secrets set` (or the
//                                     Supabase dashboard, project settings
//                                     -> Edge Functions -> Secrets).
//   Collector addresses            -> paste into
//                                     supabase/migrations/20260828_seed_mainnet_collectors.sql
//                                     replacing the four PLACEHOLDER_...
//                                     strings, then run the migration.
//
// Run with:
//   node scripts/generate-wallet-seed.mjs
//
// Dependencies (dev only; not shipped to the runtime):
//   npm install --no-save bip39 bip32 tiny-secp256k1 bitcoinjs-lib ethers

import { randomBytes, createCipheriv, createHash } from "node:crypto";
import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bitcoin from "bitcoinjs-lib";
import { ethers } from "ethers";

const bip32 = BIP32Factory(ecc);

// Collector address is at index 0 on each network. User addresses start at
// index 1 (via allocate_deposit_index() incrementing next_index from 0
// through the app; the collector is derived separately and never handed
// out to users).
const COLLECTOR_INDEX = 0;

function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: iv || tag || ciphertext, base64-encoded.
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

const LITECOIN_MAINNET = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip32: { public: 0x019da462, private: 0x019d9cfe },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

const LITECOIN_TESTNET = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "tltc",
  bip32: { public: 0x0436f6e1, private: 0x0436ef7d },
  pubKeyHash: 0x6f,
  scriptHash: 0x3a,
  wif: 0xef,
};

function deriveUtxo(seed, btcNetwork, path, label) {
  const root = bip32.fromSeed(seed, btcNetwork);
  const child = root.derivePath(path);
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network: btcNetwork,
  });
  return { label, address };
}

function deriveEvm(seed, path, label) {
  const hdNode = ethers.HDNodeWallet.fromSeed(seed).derivePath(path);
  return { label, address: hdNode.address };
}

// Tron uses the same secp256k1 key + address hash as Ethereum — a Tron
// address is that same 20-byte value, base58check-encoded with a 0x41
// prefix instead of shown as "0x...". See the matching comment in
// supabase/functions/_shared/hd-wallet.ts for the full explanation.
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes) {
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
  return BASE58_ALPHABET[0].repeat(leadingZeros) + digits.reverse().map((d) => BASE58_ALPHABET[d]).join("");
}

function tronAddressFromEvmAddress(evmAddress) {
  const body = Buffer.from(evmAddress.replace(/^0x/i, ""), "hex");
  const payload = Buffer.concat([Buffer.from([0x41]), body]);
  const checksum = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest();
  return base58Encode(Buffer.concat([payload, checksum.subarray(0, 4)]));
}

function deriveTron(seed, path, label) {
  const hdNode = ethers.HDNodeWallet.fromSeed(seed).derivePath(path);
  return { label, address: tronAddressFromEvmAddress(hdNode.address) };
}

function main() {
  console.log("=".repeat(72));
  console.log("CEMP mainnet HD wallet seed generator — OFFLINE USE ONLY");
  console.log("=".repeat(72));
  console.log();
  console.log("Before continuing, confirm:");
  console.log("  [ ] Wi-Fi is disabled / this machine is air-gapped");
  console.log("  [ ] The terminal buffer will be cleared after copying outputs");
  console.log("  [ ] You have paper + pen ready to write the mnemonic");
  console.log();

  // 256 bits of entropy -> 24-word mnemonic.
  const mnemonic = bip39.generateMnemonic(256);
  const seed = bip39.mnemonicToSeedSync(mnemonic);

  const masterKey = randomBytes(32);
  const encryptedSeed = encrypt(mnemonic, masterKey);

  // Mainnet collectors (BIP84, coin_type 0 for BTC, 2 for LTC, 60 for EVM).
  const btcMain = deriveUtxo(seed, bitcoin.networks.bitcoin, `m/84'/0'/0'/0/${COLLECTOR_INDEX}`, "BTC_MAINNET collector");
  const ltcMain = deriveUtxo(seed, LITECOIN_MAINNET, `m/84'/2'/0'/0/${COLLECTOR_INDEX}`, "LTC_MAINNET collector");
  const ethMain = deriveEvm(seed, `m/44'/60'/0'/0/${COLLECTOR_INDEX}`, "ETH_MAINNET collector");
  const bscMain = deriveEvm(seed, `m/44'/60'/0'/0/${COLLECTOR_INDEX}`, "BSC_MAINNET collector (same key as ETH)");
  const tronMain = deriveTron(seed, `m/44'/195'/0'/0/${COLLECTOR_INDEX}`, "TRON_MAINNET collector");

  // Testnet collectors (coin_type 1 for both BTC and LTC per SLIP-44).
  const btcTest = deriveUtxo(seed, bitcoin.networks.testnet, `m/84'/1'/0'/0/${COLLECTOR_INDEX}`, "BTC_TESTNET collector");
  const ltcTest = deriveUtxo(seed, LITECOIN_TESTNET, `m/84'/1'/0'/0/${COLLECTOR_INDEX}`, "LTC_TESTNET collector");
  const ethTest = deriveEvm(seed, `m/44'/60'/0'/0/${COLLECTOR_INDEX}`, "ETH_SEPOLIA collector (same key as ETH_MAINNET)");
  const bscTest = deriveEvm(seed, `m/44'/60'/0'/0/${COLLECTOR_INDEX}`, "BSC_TESTNET collector (same key as ETH_MAINNET)");
  const tronTest = deriveTron(seed, `m/44'/195'/0'/0/${COLLECTOR_INDEX}`, "TRON_TESTNET collector (Nile)");

  console.log("-- 1. MNEMONIC (write this on paper, DO NOT store digitally) --");
  console.log();
  console.log("  " + mnemonic);
  console.log();
  console.log("-- 2. SUPABASE SECRETS (paste into `supabase secrets set`) --");
  console.log();
  console.log("  WALLET_MASTER_KEY=" + masterKey.toString("base64"));
  console.log("  WALLET_ENCRYPTED_SEED=" + encryptedSeed);
  console.log();
  console.log("  Command:");
  console.log("    supabase secrets set \\");
  console.log("      WALLET_MASTER_KEY='" + masterKey.toString("base64") + "' \\");
  console.log("      WALLET_ENCRYPTED_SEED='" + encryptedSeed + "'");
  console.log();
  console.log("-- 3a. MAINNET COLLECTORS (paste into seed_mainnet_collectors.sql) --");
  console.log();
  console.log("  BTC_MAINNET   ->  " + btcMain.address);
  console.log("  LTC_MAINNET   ->  " + ltcMain.address);
  console.log("  ETH_MAINNET   ->  " + ethMain.address);
  console.log("  BSC_MAINNET   ->  " + bscMain.address);
  console.log("  TRON_MAINNET  ->  " + tronMain.address);
  console.log();
  console.log("-- 3b. TESTNET COLLECTORS (paste into seed_testnet_collectors.sql) --");
  console.log();
  console.log("  BTC_TESTNET   ->  " + btcTest.address);
  console.log("  LTC_TESTNET   ->  " + ltcTest.address);
  console.log("  ETH_SEPOLIA   ->  " + ethTest.address);
  console.log("  BSC_TESTNET   ->  " + bscTest.address);
  console.log("  TRON_TESTNET  ->  " + tronTest.address + "  (Nile)");
  console.log();
  console.log("=".repeat(72));
  console.log("After copying outputs:");
  console.log("  1. Write the mnemonic on paper, seal in an envelope, store in a safe.");
  console.log("  2. Clear this terminal (Ctrl+L then `clear`, or close the window).");
  console.log("  3. Do NOT save this output to a file, screenshot, or paste in chat.");
  console.log("=".repeat(72));
}

main();
