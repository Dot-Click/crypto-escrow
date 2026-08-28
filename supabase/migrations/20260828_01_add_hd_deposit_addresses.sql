-- Per-user HD deposit addresses (mainnet). Replaces the "shared master
-- wallet + manual TxID claim + signature-verified sending-address binding"
-- design. Every user now gets their own deterministic address per coin,
-- derived server-side from a single encrypted BIP-39 mnemonic. Incoming
-- transactions are picked up by a background watcher and credited without
-- any user action; funds are periodically swept to a collector address so
-- withdrawals have a hot-wallet to draw from.
--
-- ---------- CUSTODIAL RISK ACKNOWLEDGEMENT ----------
-- The BIP-39 seed that derives every user address lives in a Supabase
-- secret (WALLET_ENCRYPTED_SEED) unlocked by a master key
-- (WALLET_MASTER_KEY) in the same environment. A full compromise of the
-- Supabase project's secrets drains every user's balance. This is the
-- documented, accepted trade-off in exchange for zero third-party custody
-- cost. See README > Wallet operations.

-- ---------- NEW: PER-USER DEPOSIT ADDRESSES ----------
CREATE TABLE public.user_deposit_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  crypto_type text NOT NULL,
  network text NOT NULL,
  address text NOT NULL,
  derivation_index integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (network, address),
  UNIQUE (user_id, crypto_type, network),
  UNIQUE (network, derivation_index)
);

CREATE INDEX user_deposit_addresses_network_idx
  ON public.user_deposit_addresses (network, created_at);

GRANT SELECT ON public.user_deposit_addresses TO authenticated;
GRANT ALL ON public.user_deposit_addresses TO service_role;

ALTER TABLE public.user_deposit_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own deposit addresses readable" ON public.user_deposit_addresses
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ---------- NEW: HD WALLET STATE (per network) ----------
-- next_index is the derivation index that will be handed to the NEXT user
-- who requests an address on this network. Allocated atomically via
-- allocate_deposit_index() below so two concurrent requests never collide.
--
-- last_scanned_block is the highest block number the watcher has processed;
-- the watcher scans forward from here every tick. Never rewound past the
-- confirmation depth for the network (that would let a reorged tx get
-- re-credited).
CREATE TABLE public.hd_wallet_state (
  network text NOT NULL PRIMARY KEY,
  next_index integer NOT NULL DEFAULT 0,
  last_scanned_block bigint,
  last_scanned_txid text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.hd_wallet_state TO service_role;
ALTER TABLE public.hd_wallet_state ENABLE ROW LEVEL SECURITY;

-- Seed one row per supported mainnet network. next_index starts at 1
-- because index 0 is reserved for the collector address on every network
-- (see scripts/generate-wallet-seed.mjs).
INSERT INTO public.hd_wallet_state (network, next_index) VALUES
  ('BTC_MAINNET', 1),
  ('LTC_MAINNET', 1),
  ('ETH_MAINNET', 1),
  ('BSC_MAINNET', 1)
ON CONFLICT (network) DO NOTHING;

-- Atomic allocator: returns the next derivation index for a network and
-- increments the counter in a single row-locked write. Called by the
-- get-or-create-address server function; without SECURITY DEFINER + this
-- pattern, two simultaneous first-time-deposit requests on the same network
-- could hand two users the same address.
CREATE OR REPLACE FUNCTION public.allocate_deposit_index(_network text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  allocated integer;
BEGIN
  UPDATE public.hd_wallet_state
     SET next_index = next_index + 1,
         updated_at = now()
   WHERE network = _network
  RETURNING next_index - 1 INTO allocated;

  IF allocated IS NULL THEN
    RAISE EXCEPTION 'unknown network: %', _network;
  END IF;

  RETURN allocated;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_deposit_index(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_deposit_index(text) TO service_role;

-- ---------- MASTER WALLETS -> COLLECTOR WALLETS ----------
-- master_wallets stays, but its meaning changes: the address column is now
-- the COLLECTOR address per network (where the sweeper deposits funds
-- consolidated from user addresses). Users never see these addresses; they
-- see their own row from user_deposit_addresses.
ALTER TABLE public.master_wallets
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'collector'
    CHECK (purpose IN ('collector'));

COMMENT ON TABLE public.master_wallets IS
  'Collector (hot) addresses. Sweeper consolidates user deposits here; withdrawals draw from here.';

COMMENT ON COLUMN public.master_wallets.address IS
  'Collector address for this network. NOT shown to users. Funds live here between deposit and withdrawal.';

-- Realistic mainnet confirmation depths. Existing testnet rows are cleared —
-- the seed migration below re-seeds mainnet collector addresses from env.
UPDATE public.master_wallets SET active = false;

-- ---------- REMOVE SIGNATURE-CHALLENGE FLOW ----------
-- Unique per-user addresses supersede sender-binding. No signature challenge
-- is needed because the credit signal is "funds arrived at YOUR address",
-- not "you claimed a TxID sent to a shared address."
DROP TABLE IF EXISTS public.deposit_address_challenges CASCADE;
DROP TABLE IF EXISTS public.deposit_source_addresses CASCADE;

-- ---------- DEPOSIT CLAIMS: NOW WATCHER-INSERTED, NOT USER-INSERTED ----------
-- The table stays for a per-user history feed, but its lifecycle changes:
-- the watcher inserts a row when it detects an incoming tx to a user's
-- address, and updates the row as confirmations accrue. Users no longer
-- insert claims manually. Revoke their INSERT.
REVOKE INSERT ON public.deposit_claims FROM authenticated;

-- Watcher needs to know when it has already ingested a tx (so it doesn't
-- re-insert a deposit_claim for one it already picked up in an earlier tick).
-- used_tx_hashes serves this — one row per (network, tx_hash) already
-- credited. Widen the constraint: the watcher inserts BEFORE crediting,
-- with a nullable deposit_claim_id, so the same guard covers both "seen"
-- and "credited".
ALTER TABLE public.used_tx_hashes
  ALTER COLUMN deposit_claim_id DROP NOT NULL;

-- ---------- DROP master_wallet_id ON deposit_claims (nullable now) ----------
-- The claim row is now anchored to a user_deposit_addresses row, not to a
-- shared master wallet. Old rows keep their master_wallet_id for audit.
ALTER TABLE public.deposit_claims
  ALTER COLUMN master_wallet_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_deposit_address_id uuid
    REFERENCES public.user_deposit_addresses(id);

CREATE INDEX IF NOT EXISTS deposit_claims_uda_idx
  ON public.deposit_claims (user_deposit_address_id);

-- ---------- SWEEP RECORDS ----------
-- Every sweep the background worker executes is recorded so we can audit
-- movements from user addresses to the collector, and so partial failures
-- (broadcast succeeded, DB write failed) can be reconciled.
CREATE TABLE public.deposit_sweeps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network text NOT NULL,
  crypto_type text NOT NULL,
  user_deposit_address_id uuid NOT NULL REFERENCES public.user_deposit_addresses(id),
  from_address text NOT NULL,
  to_address text NOT NULL,
  amount numeric NOT NULL,
  fee numeric,
  tx_hash text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'broadcast', 'confirmed', 'failed')),
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX deposit_sweeps_network_status_idx
  ON public.deposit_sweeps (network, status, created_at);

GRANT ALL ON public.deposit_sweeps TO service_role;
ALTER TABLE public.deposit_sweeps ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER deposit_sweeps_updated
  BEFORE UPDATE ON public.deposit_sweeps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
