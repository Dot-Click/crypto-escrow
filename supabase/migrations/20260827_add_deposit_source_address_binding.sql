-- ============================================================
-- SUPERSEDED by 20260828_add_hd_deposit_addresses.sql
-- ============================================================
-- The tables created here (deposit_source_addresses,
-- deposit_address_challenges) are DROPPED by the HD migration.
-- Kept for history so the migration chain is monotonic; a
-- fresh project applies both migrations in order and ends up
-- without these tables, which is correct.
-- ============================================================

-- Anti-race-condition guard for manual deposit crediting: an on-chain sending
-- address, once bound to a user, permanently "belongs" to them — any claim
-- (even for a different TxID) whose on-chain sender resolves to an
-- already-bound address can only ever credit the bound owner. This closes
-- the "I saw your deposit on a public explorer and claimed it first" race.
--
-- Binding happens one of two ways:
--   'signature'     — the user cryptographically proved control of the
--                      address BEFORE depositing (see
--                      deposit_address_challenges below). Required for
--                      ETH_SEPOLIA, USDT_BEP20, BTC_TESTNET, LTC_TESTNET —
--                      deposit-verification.server.ts refuses to credit a
--                      first-time sender on these networks without one.
--   'first_deposit' — legacy/fallback binding, created automatically the
--                      first time an address is seen crediting a claim.
--                      Still race-prone on that very first deposit; used
--                      only for networks without a signature verifier
--                      wired up (currently USDT_TRC20).
CREATE TABLE public.deposit_source_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crypto_type text NOT NULL,
  network text NOT NULL,
  address text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  verification_method text NOT NULL DEFAULT 'first_deposit' CHECK (verification_method IN ('signature', 'first_deposit')),
  first_deposit_claim_id uuid REFERENCES public.deposit_claims(id),
  verified_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (network, address)
);

GRANT ALL ON public.deposit_source_addresses TO service_role;

-- Server-role only: bound via service-role deposit-verification /
-- deposit-address code, never read or written directly by client requests.
ALTER TABLE public.deposit_source_addresses ENABLE ROW LEVEL SECURITY;

-- Short-lived challenges: "prove you control address X by signing this
-- exact message." A row here is consumed (signature verified, once) before
-- it turns into a deposit_source_addresses binding.
CREATE TABLE public.deposit_address_challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  crypto_type text NOT NULL,
  network text NOT NULL,
  address text NOT NULL,
  nonce text NOT NULL,
  message text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX deposit_address_challenges_user_id_idx ON public.deposit_address_challenges (user_id, created_at DESC);

GRANT ALL ON public.deposit_address_challenges TO service_role;
ALTER TABLE public.deposit_address_challenges ENABLE ROW LEVEL SECURITY;
