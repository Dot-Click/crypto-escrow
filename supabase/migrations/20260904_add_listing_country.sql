-- Country/region targeting for offers, matching BitValve and SafeTheTrade's
-- pattern of scoping an offer to a country (or leaving it untargeted/global).
-- Null = Global, shown to every country's filter; a set value narrows the
-- offer to that country specifically. Purely a display/filter attribute —
-- doesn't gate who can actually start a trade (no buyer geolocation check).
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS country text;
