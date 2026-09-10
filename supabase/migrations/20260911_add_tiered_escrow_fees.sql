-- Records which fee rate/rail actually applied to a trade at open time.
-- fee_amount already stores the locked-in raw number, but not the rate that
-- produced it — these columns close that gap for auditability, now that the
-- escrow fee is tiered by payment rail instead of a single flat percent.
ALTER TABLE public.trades ADD COLUMN fee_percent numeric;
ALTER TABLE public.trades ADD COLUMN fee_rail text;
