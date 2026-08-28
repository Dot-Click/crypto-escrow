-- Outbound-withdrawal broadcaster state. Mirrors deposit_sweeps but for
-- money leaving the collector. Every user withdrawal request creates a
-- withdrawals row in status 'pending'; the broadcast-withdrawals Edge
-- Function picks it up, signs from the collector's key (derivation index
-- 0), broadcasts, and moves it to 'broadcast' → 'confirmed' or 'failed'.
--
-- The user's wallet balance is debited by requestWithdrawal *before* the
-- row is inserted; on 'failed' the debit is reversed by the broadcaster.

CREATE TABLE public.withdrawals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id),
  transaction_id uuid REFERENCES public.transactions(id),
  crypto_type text NOT NULL,
  network text NOT NULL,
  destination_address text NOT NULL,
  amount numeric NOT NULL,
  fee numeric,
  tx_hash text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'broadcast', 'confirmed', 'failed', 'refunded')),
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX withdrawals_status_idx ON public.withdrawals (status, created_at);
CREATE INDEX withdrawals_user_idx ON public.withdrawals (user_id, created_at DESC);

GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own withdrawals readable" ON public.withdrawals
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER withdrawals_updated
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Wire the cron schedule (assumes trigger_edge_function() from
-- 20260828_wire_deposit_crons.sql is already installed). Every 5 minutes
-- is enough for a low-volume MVP; increase or decrease as needed.
SELECT cron.schedule(
  'broadcast-withdrawals',
  '2,17,32,47 * * * *',
  $$ SELECT public.trigger_edge_function('broadcast-withdrawals'); $$
);
