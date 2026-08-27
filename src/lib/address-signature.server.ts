// Server-only: verifies that a user controls the private key for a deposit
// source address, by checking a signature over a server-issued challenge
// message. This is what lets deposit-verification.server.ts trust a binding
// on a brand-new (never-before-seen) address, not just a repeat one.
//
// One verifier per network family:
//   - ETH_SEPOLIA / USDT_BEP20 -> standard EIP-191 personal_sign, via ethers.
//   - BTC_TESTNET              -> BIP-322 (falls back to legacy BIP-137),
//                                  via bip322-js. Covers P2PKH, P2SH-P2WPKH,
//                                  P2WPKH, and P2TR addresses.
//   - LTC_TESTNET              -> classic BIP-137-style message signing via
//                                  bitcoinjs-message, with Litecoin's message
//                                  prefix. bitcoinjs-message's bech32 handling
//                                  is HRP-agnostic (it just compares the
//                                  witness program), so this also works for
//                                  native segwit ltc/tltc addresses as long
//                                  as the signing wallet sets the correct
//                                  BIP-137 header byte for a segwit key —
//                                  true for Litecoin Core and Electrum-LTC,
//                                  but coverage across every LTC wallet's
//                                  "sign message" feature isn't guaranteed.

import { SIGNATURE_REQUIRED_NETWORKS } from "@/lib/constants";

export type SignatureNetwork = "ETH_SEPOLIA" | "USDT_BEP20" | "BTC_TESTNET" | "LTC_TESTNET";

export function isSignatureNetwork(network: string): network is SignatureNetwork {
  return SIGNATURE_REQUIRED_NETWORKS.has(network);
}

async function verifyEvm(address: string, message: string, signature: string): Promise<boolean> {
  try {
    const { verifyMessage } = await import("ethers");
    const recovered = verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

async function verifyBtc(address: string, message: string, signature: string): Promise<boolean> {
  try {
    const mod = await import("bip322-js");
    const Verifier = (mod as { Verifier?: typeof mod.Verifier }).Verifier ?? mod.Verifier;
    return Verifier.verifySignature(address, message, signature);
  } catch {
    return false;
  }
}

async function verifyLtc(address: string, message: string, signature: string): Promise<boolean> {
  try {
    const mod = await import("bitcoinjs-message");
    const bitcoinMessage = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
    // useStrictVerification=false lets a segwit-flagged signature also match
    // a legacy address derived from the same key, mirroring bip322-js's
    // "loose" verification behavior for BTC.
    return bitcoinMessage.verify(message, address, signature, "Litecoin Signed Message:\n", true);
  } catch {
    return false;
  }
}

export async function verifyAddressSignature(
  network: SignatureNetwork,
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  switch (network) {
    case "ETH_SEPOLIA":
    case "USDT_BEP20":
      return verifyEvm(address, message, signature);
    case "BTC_TESTNET":
      return verifyBtc(address, message, signature);
    case "LTC_TESTNET":
      return verifyLtc(address, message, signature);
    default:
      return false;
  }
}
