-- Soft account closure. We deliberately do NOT hard-delete the auth user or
-- the profiles row: trades, listings, messages and transactions all FK to
-- profiles.id, and ledger/dispute history must survive account closure
-- (same policy SafeTheTrade documents: "Ledger records: kept permanently").
-- closed_at marks the account closed for display purposes; the actual
-- login block is enforced by banning the auth user via the Admin API in
-- the closeAccount server function, not by this column.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;
