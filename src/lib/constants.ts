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
 * Fixed platform withdrawal fee, in the coin's own unit, keyed by
 * "{cryptoType}:{networkLabel}" (see withdrawalNetworkLabel in
 * @/lib/withdrawal-validation). Only covers the networks the client's fee
 * schedule specified — ETH and LTC withdrawals stay "network fee only" (no
 * platform fee) since they weren't part of that schedule.
 */
export const WITHDRAWAL_FIXED_FEE: Record<string, number> = {
  "USDT:BEP20": 0.8,
  "USDT:TRC20": 1.9,
  "BTC:ONCHAIN": 0.000026,
  "BTC:LIGHTNING": 0.000008,
};

/**
 * Kill switch for TRC20 (Tron) withdrawal. The TRON_MAINNET master_wallets
 * collector row now has a real derived address (see
 * supabase/migrations/20260911_04_seed_tron_collectors.sql) and is active.
 * If that address is ever short on real TRX (needed to pay Tron transfer
 * fees), a TRC20 withdrawal will debit the user immediately and only get
 * refunded hours later once broadcast-withdrawals exhausts its retry
 * attempts — a bad failure mode for something the UI otherwise makes look
 * instant. Flip this back to false if the collector ever runs dry.
 */
export const TRC20_WITHDRAWAL_ENABLED = true;

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
