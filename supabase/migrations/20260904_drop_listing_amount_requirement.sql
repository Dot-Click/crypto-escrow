-- Matching SafeTheTrade's offer model: a listing declares a price (margin
-- or fixed) and a fiat trade-size range (min_amount/max_amount), never a
-- total crypto inventory. How much a seller can actually cover is enforced
-- live against their wallet balance at trade-start (see escrow.server.ts's
-- openTrade), not against a number typed in at listing-creation time.
--
-- amount was already functionally redundant before this: it was only ever
-- checked as a ceiling (`grossCrypto > listing.amount`), never decremented
-- after a trade, so it never tracked real remaining inventory anyway.
--
-- Column is kept (nullable) rather than dropped, since older rows already
-- have a value and nothing else needs to change to stop relying on it.
ALTER TABLE public.listings
  ALTER COLUMN amount DROP NOT NULL;
