export const CRYPTO_TYPES = [
  { code: "BTC", label: "Bitcoin (testnet)" },
  { code: "ETH", label: "Ethereum (testnet)" },
  { code: "USDT", label: "Tether USDT (testnet)" },
  { code: "LTC", label: "Litecoin (testnet)" },
] as const;

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
