ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_provider_payment_id_key
  ON public.transactions (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_crypto_key
  ON public.wallets (user_id, crypto_type);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS rate_limits_lookup_idx
  ON public.rate_limits (user_id, action, created_at DESC);