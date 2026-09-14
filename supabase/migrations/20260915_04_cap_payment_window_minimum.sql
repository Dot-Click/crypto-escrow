-- Client ask: a listing's payment time limit can't be set below 20 minutes --
-- too short a window was letting sellers set unrealistic auto-cancel timers
-- that buyers couldn't reasonably meet. Bump the couple of existing listings
-- that predate this floor, then enforce it going forward with a CHECK.
UPDATE public.listings
SET payment_window_minutes = 20
WHERE payment_window_minutes IS NOT NULL AND payment_window_minutes < 20;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_payment_window_minutes_floor
  CHECK (payment_window_minutes IS NULL OR payment_window_minutes >= 20);
