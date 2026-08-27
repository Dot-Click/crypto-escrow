export const CRYPTO_TYPES = [
  { code: "BTC", label: "Bitcoin (testnet)" },
  { code: "ETH", label: "Ethereum (testnet)" },
  { code: "USDT", label: "Tether USDT (testnet)" },
  { code: "LTC", label: "Litecoin (testnet)" },
] as const;

/**
 * Deposit networks where a first-time sending address must be
 * signature-verified (see address-signature.server.ts /
 * deposit-address.functions.ts) before a deposit from it can be credited.
 * Shared between client (to gate the deposit UI) and server (to enforce it).
 */
export const SIGNATURE_REQUIRED_NETWORKS: ReadonlySet<string> = new Set([
  "ETH_SEPOLIA",
  "USDT_BEP20",
  "BTC_TESTNET",
  "LTC_TESTNET",
]);

/** Deducted from the buyer's crypto payout when escrow releases; locked into trade.fee_amount at open time. */
export const PLATFORM_FEE_PERCENT = 1;

export type TradeStatus =
  | "pending"
  | "escrow_funded"
  | "payment_claimed"
  | "released"
  | "disputed"
  | "cancelled";

export const TRADE_STATUS_LABEL: Record<TradeStatus, string> = {
  pending: "Pending",
  escrow_funded: "In Escrow",
  payment_claimed: "Payment Claimed",
  released: "Released",
  disputed: "Disputed",
  cancelled: "Cancelled",
};
