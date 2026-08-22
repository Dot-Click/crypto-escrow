-- Lets a seller lock an absolute price instead of a margin over the live
-- market rate. When fixed_price is set, it's used as-is and margin_percent /
-- the live market feed are ignored for that listing.
ALTER TABLE public.listings
  ADD COLUMN fixed_price numeric;
