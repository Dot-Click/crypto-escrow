-- Optional per-listing payment window: if the buyer doesn't mark payment sent
-- before trades.expires_at, escrow auto-refunds to the seller instead of
-- staying locked forever.

ALTER TABLE public.listings
  ADD COLUMN payment_window_minutes integer;

ALTER TABLE public.trades
  ADD COLUMN expires_at timestamp with time zone;
