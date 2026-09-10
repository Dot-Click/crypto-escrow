export const SUPPORT_EMAIL = "support@cemp.app";

export const CRYPTO_TYPES = [
  { code: "BTC", label: "Bitcoin" },
  { code: "ETH", label: "Ethereum" },
  { code: "USDT", label: "Tether USDT (BEP-20)" },
  { code: "LTC", label: "Litecoin" },
] as const;

/**
 * Escrow fee, deducted from the buyer's crypto payout when escrow releases and
 * locked into trade.fee_amount at open time. Tiered by the payment rail the
 * buyer pays over — see escrowFeePercentForMethod in @/lib/pricing.
 */
export const ESCROW_FEE_PERCENT_BY_RAIL: Record<string, number> = {
  gift_card: 1.99,
  bank_transfer: 0.4,
};
/** Applied to any rail not listed above (mobile money, online wallets, cash, cards, crypto, goods & services). */
export const ESCROW_FEE_PERCENT_DEFAULT = 0.59;

/** Deducted from the crypto-to-crypto Swap feature's output amount (instant swaps and filled limit orders alike). */
export const SWAP_FEE_PERCENT = 0;

/**
 * Fallback payment window for trades opened on a listing with its time
 * limit disabled. A trade must always have an expires_at — a null value
 * can never satisfy expireStaleTrades's `.lt("expires_at", now)` filter,
 * so it would sit in escrow forever regardless of how the sweep runs.
 */
export const DEFAULT_MAX_PAYMENT_WINDOW_MINUTES = 24 * 60;

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
