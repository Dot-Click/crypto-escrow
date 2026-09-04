-- Verification-requirement toggle for offers, matching BitValve/SafeTheTrade's
-- "verified users only" gate. This build has no real KYC (see trader-level.ts),
-- so the equivalent trust signal is a minimum completed-trades count: sellers
-- can require a counterparty to have a trade history before starting a trade.
-- Null/0 = no requirement, open to any trader.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS min_trades_required integer;
