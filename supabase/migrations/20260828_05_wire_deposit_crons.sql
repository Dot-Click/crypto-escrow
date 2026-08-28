-- Schedule the watch-deposits and sweep Edge Functions via pg_cron +
-- pg_net. The Supabase project must have both extensions enabled
-- (Database -> Extensions in the dashboard).
--
-- Prerequisites BEFORE running this migration:
--   1. Deploy the Edge Functions:
--        supabase functions deploy watch-deposits
--        supabase functions deploy sweep
--   2. Set the required secrets on the project:
--        supabase secrets set \
--          WALLET_ENCRYPTED_SEED='...' \
--          WALLET_MASTER_KEY='...' \
--          CRON_SECRET='<random 32-byte hex>'
--   3. In the Supabase SQL editor, once, set the vault entries used below
--      (or replace the vault.decrypted_secrets calls with hardcoded values
--      if you don't use Vault yet):
--        SELECT vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'edge_functions_base_url');
--        SELECT vault.create_secret('<CRON_SECRET>', 'cron_secret');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper: fires an Edge Function with the CRON_SECRET header. If Vault
-- isn't set up on this project, replace the two `vault.decrypted_secrets`
-- reads with literal strings — but that puts your CRON_SECRET into the
-- migration file, which is worse.
CREATE OR REPLACE FUNCTION public.trigger_edge_function(_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'net'
AS $$
DECLARE
  base_url text;
  cron_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'edge_functions_base_url';
  SELECT decrypted_secret INTO cron_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  IF base_url IS NULL OR cron_secret IS NULL THEN
    RAISE EXCEPTION 'edge_functions_base_url / cron_secret not set in vault.secrets';
  END IF;

  SELECT net.http_post(
    url := base_url || '/' || _name,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_edge_function(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_edge_function(text) TO postgres;

-- Deposit watcher: every minute.
SELECT cron.schedule(
  'watch-deposits',
  '* * * * *',
  $$ SELECT public.trigger_edge_function('watch-deposits'); $$
);

-- Sweeper: every 15 minutes. Off-cycle from the watcher so the two never
-- race on the same DB rows.
SELECT cron.schedule(
  'sweep-deposits',
  '7,22,37,52 * * * *',
  $$ SELECT public.trigger_edge_function('sweep'); $$
);
