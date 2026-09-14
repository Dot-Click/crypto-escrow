-- The buyer's 30-minute dispute-wait clock (see raiseDispute in
-- escrow.server.ts) was reading trades.updated_at — a field any future
-- unrelated update to the row would silently reset. Give it its own
-- timestamp so the clock is only ever set by claimPayment.
ALTER TABLE public.trades ADD COLUMN payment_claimed_at timestamptz;

-- Backfill trades already sitting in payment_claimed at the time this ran —
-- their real claim time isn't recoverable, so updated_at is the closest
-- approximation (status changes are the only thing that touches this row).
UPDATE public.trades SET payment_claimed_at = updated_at
  WHERE status = 'payment_claimed' AND payment_claimed_at IS NULL;
