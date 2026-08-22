-- Adds margin-based live pricing, min/max trade-size ranges, and locked-in
-- platform fee tracking, so the trade-start calculator can compute a live
-- crypto amount from a fiat amount the same way NoOnes' offer page does.

ALTER TABLE public.listings
  ADD COLUMN margin_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN min_amount numeric,
  ADD COLUMN max_amount numeric;

-- fee_amount/payout_amount are locked in at trade-open time, same pattern as
-- the existing locked-in `price` column — later fee or market-price changes
-- must never affect an already-open trade.
ALTER TABLE public.trades
  ADD COLUMN fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN payout_amount numeric;

UPDATE public.trades SET payout_amount = amount WHERE payout_amount IS NULL;

ALTER TABLE public.trades ALTER COLUMN payout_amount SET NOT NULL;
