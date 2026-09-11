#!/usr/bin/env node
// Derives the TRON_MAINNET/TRON_TESTNET collector addresses from the wallet
// seed THIS PROJECT ALREADY HAS DEPLOYED — unlike generate-wallet-seed.mjs
// (which creates a brand-new mnemonic), this does NOT generate anything new.
// Run it once to get the Tron collector addresses to paste into
// supabase/migrations/20260911_04_seed_tron_collectors.sql, replacing its
// PLACEHOLDER_... strings.
//
// **RUN THIS OFFLINE**, same precautions as generate-wallet-seed.mjs — you
// are about to type the mnemonic that controls every mainnet balance.
//
// Run with:
//   node scripts/derive-tron-collector.mjs
// It will prompt for the mnemonic (input is not echoed to the terminal).
//
// Dependencies (dev only; not shipped to the runtime):
//   npm install --no-save bip39 ethers

import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import * as bip39 from "bip39";
import { ethers } from "ethers";

const COLLECTOR_INDEX = 0;

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

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("=".repeat(72));
  console.log("Tron collector address derivation — OFFLINE USE ONLY");
  console.log("=".repeat(72));
  console.log();
  console.log("This reads your EXISTING wallet mnemonic and derives the Tron");
  console.log("addresses for it — it does not create a new wallet or touch any");
  console.log("secrets already stored in Supabase.");
  console.log();
  console.log("The mnemonic will be visible as you type it — make sure no one is");
  console.log("watching your screen and that this terminal isn't being recorded.");
  console.log();

  const mnemonic = await prompt("Paste the existing 24-word mnemonic, then press Enter: ");
  console.log();

  if (!bip39.validateMnemonic(mnemonic)) {
    console.error("That is not a valid BIP-39 mnemonic. Check for typos and try again.");
    process.exit(1);
  }

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const mainnet = ethers.HDNodeWallet.fromSeed(seed).derivePath(`m/44'/195'/0'/0/${COLLECTOR_INDEX}`);
  const testnet = mainnet; // same path/key on Tron mainnet and Nile testnet — only the RPC endpoint differs

  console.log("-- TRON COLLECTOR ADDRESSES --");
  console.log();
  console.log("  TRON_MAINNET  ->  " + tronAddressFromEvmAddress(mainnet.address));
  console.log("  TRON_TESTNET  ->  " + tronAddressFromEvmAddress(testnet.address) + "  (Nile — same key as mainnet)");
  console.log();
  console.log("Paste these into supabase/migrations/20260911_04_seed_tron_collectors.sql,");
  console.log("replacing the PLACEHOLDER_... strings, then fund the mainnet address with");
  console.log("a small amount of TRX (for transfer energy/bandwidth) before enabling it.");
  console.log();
  console.log("Clear this terminal now (Ctrl+L then `clear`, or close the window).");
  console.log("=".repeat(72));
}

main();
