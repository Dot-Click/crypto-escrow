-- Replace single-country targeting with the reverse: a seller now blocks
-- specific countries from an otherwise-global offer, rather than restricting
-- the offer to one country. No listing has ever set `country` (checked live
-- before writing this), so it's safe to drop rather than keep dead alongside
-- the new column.
ALTER TABLE public.listings
  DROP COLUMN IF EXISTS country,
  ADD COLUMN IF NOT EXISTS blocked_countries text[] NOT NULL DEFAULT '{}';
