// Per-network destination-address validation and minimum-withdrawal
// enforcement. Shared between client (for form-level feedback) and server
// (for authoritative refusal).
//
// The active environment (mainnet vs testnet) is driven by NETWORK_ENV
// on the server side. When testnet, addresses are validated against
// testnet prefixes (tb1/tltc1/…) and BTC/LTC withdrawals are routed to
// the testnet collector. EVM addresses look identical on both — the
// difference is only which chain they broadcast on.

export type SupportedNetwork =
  | "BTC_MAINNET" | "LTC_MAINNET" | "ETH_MAINNET" | "BSC_MAINNET"
  | "BTC_TESTNET" | "LTC_TESTNET" | "ETH_SEPOLIA" | "BSC_TESTNET";

export type NetworkEnv = "mainnet" | "testnet";

export function currentNetworkEnv(): NetworkEnv {
  // Server-only. On the browser side, imports of this file are still fine
  // because process.env is stripped at bundle time; the fallback picks
  // mainnet, which is the correct default for the address regex too.
  const env = typeof process !== "undefined" ? process.env?.NETWORK_ENV : undefined;
  return env === "testnet" ? "testnet" : "mainnet";
}

const MAINNET_MAP: Record<string, SupportedNetwork> = {
  BTC: "BTC_MAINNET",
  LTC: "LTC_MAINNET",
  ETH: "ETH_MAINNET",
  USDT: "BSC_MAINNET",
};

const TESTNET_MAP: Record<string, SupportedNetwork> = {
  BTC: "BTC_TESTNET",
  LTC: "LTC_TESTNET",
  ETH: "ETH_SEPOLIA",
  USDT: "BSC_TESTNET",
};

export function cryptoToNetwork(cryptoType: string, env: NetworkEnv = currentNetworkEnv()): SupportedNetwork {
  return (env === "testnet" ? TESTNET_MAP : MAINNET_MAP)[cryptoType];
}

/** Alias kept for callers written before the env flag existed. */
export const CRYPTO_TO_NETWORK = new Proxy(
  {} as Record<string, SupportedNetwork>,
  { get: (_t, prop: string) => cryptoToNetwork(prop) },
);

/**
 * Minimum withdrawal amount in the coin's native unit. Set to comfortably
 * exceed dust + typical fee so the tx actually reaches the recipient.
 * Testnet minimums are tiny so faucet drips are enough to test.
 */
export const WITHDRAWAL_MIN_MAINNET: Record<string, number> = {
  BTC: 0.0005,
  LTC: 0.02,
  ETH: 0.005,
  USDT: 5,
};

export const WITHDRAWAL_MIN_TESTNET: Record<string, number> = {
  BTC: 0.00002,
  LTC: 0.0002,
  ETH: 0.0005,
  USDT: 0.5,
};

export function withdrawalMin(cryptoType: string, env: NetworkEnv = currentNetworkEnv()): number | undefined {
  return (env === "testnet" ? WITHDRAWAL_MIN_TESTNET : WITHDRAWAL_MIN_MAINNET)[cryptoType];
}

// Mainnet-only prefixes.
const BTC_MAINNET_ADDR = /^(bc1[a-z0-9]{6,87}|[13][A-HJ-NP-Za-km-z1-9]{25,34})$/;
const LTC_MAINNET_ADDR = /^(ltc1[a-z0-9]{6,87}|[LM3][A-HJ-NP-Za-km-z1-9]{25,34})$/;

// Testnet prefixes.
const BTC_TESTNET_ADDR = /^(tb1[a-z0-9]{6,87}|[mn2][A-HJ-NP-Za-km-z1-9]{25,34})$/;
const LTC_TESTNET_ADDR = /^(tltc1[a-z0-9]{6,87}|[mQ][A-HJ-NP-Za-km-z1-9]{25,34})$/;

// EVM addresses look the same on every chain.
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function isValidAddress(cryptoType: string, address: string, env: NetworkEnv = currentNetworkEnv()): boolean {
  const a = address.trim();
  const utxoBtc = env === "testnet" ? BTC_TESTNET_ADDR : BTC_MAINNET_ADDR;
  const utxoLtc = env === "testnet" ? LTC_TESTNET_ADDR : LTC_MAINNET_ADDR;
  switch (cryptoType) {
    case "BTC": return utxoBtc.test(a);
    case "LTC": return utxoLtc.test(a);
    case "ETH":
    case "USDT": return EVM_ADDRESS.test(a);
    default: return false;
  }
}

export function withdrawalError(cryptoType: string, amount: number, address: string, env: NetworkEnv = currentNetworkEnv()): string | null {
  const min = withdrawalMin(cryptoType, env);
  if (min == null) return "Unsupported coin";
  if (!(amount >= min)) return `Minimum withdrawal is ${min} ${cryptoType}`;
  if (!isValidAddress(cryptoType, address, env)) return `Enter a valid ${cryptoType} address for ${env}`;
  return null;
}
