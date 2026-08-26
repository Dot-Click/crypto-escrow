-- Manual crypto deposit verification: platform-owned master wallets, user
-- deposit claims verified against public block explorer APIs, a replay guard
-- so a TxID can never be credited twice, and an audit log of every check.

CREATE TABLE public.master_wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  crypto_type text NOT NULL,
  network text NOT NULL,
  label text NOT NULL,
  address text NOT NULL,
  token_contract_address text,
  warning_message text NOT NULL DEFAULT '',
  min_confirmations integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (crypto_type, network)
);

CREATE TABLE public.deposit_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id),
  master_wallet_id uuid NOT NULL REFERENCES public.master_wallets(id),
  crypto_type text NOT NULL,
  network text NOT NULL,
  claimed_amount numeric NOT NULL,
  tx_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason text,
  verified_amount numeric,
  confirmations integer,
  attempt_count integer NOT NULL DEFAULT 0,
  last_checked_at timestamp with time zone,
  transaction_id uuid REFERENCES public.transactions(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX deposit_claims_user_id_idx ON public.deposit_claims (user_id, created_at DESC);
CREATE INDEX deposit_claims_status_idx ON public.deposit_claims (status, created_at DESC);

-- The replay guard: a row here can only ever be inserted once per
-- (network, tx_hash), and it is inserted as the very first step of crediting
-- a claim (before the wallet balance or transactions row are touched). A
-- unique-violation on this insert is how a double-credit race is caught.
CREATE TABLE public.used_tx_hashes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network text NOT NULL,
  tx_hash text NOT NULL,
  deposit_claim_id uuid NOT NULL REFERENCES public.deposit_claims(id),
  used_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (network, tx_hash)
);

CREATE TABLE public.deposit_verification_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deposit_claim_id uuid NOT NULL REFERENCES public.deposit_claims(id),
  attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  result text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX deposit_verification_log_claim_id_idx ON public.deposit_verification_log (deposit_claim_id, attempt_at);

-- ---------- GRANTS ----------
GRANT SELECT ON public.master_wallets TO authenticated;
GRANT ALL ON public.master_wallets TO service_role;

GRANT SELECT, INSERT ON public.deposit_claims TO authenticated;
GRANT ALL ON public.deposit_claims TO service_role;

GRANT ALL ON public.used_tx_hashes TO service_role;
GRANT ALL ON public.deposit_verification_log TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.master_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.used_tx_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_verification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active master wallets readable" ON public.master_wallets
  FOR SELECT TO authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "own deposit claims readable" ON public.deposit_claims
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "own deposit claims insert" ON public.deposit_claims
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- used_tx_hashes and deposit_verification_log carry no user-facing reads;
-- the wallet page and admin dashboard both go through service-role server
-- functions, so no authenticated-role policy is needed on those two tables.
