-- Sweeps open limit orders every minute via pg_cron + pg_net, hitting the
-- app's own /api/public/cron/execute-limit-orders route (fillEligibleLimitOrders
-- lives in src/lib/limit-orders.server.ts, same reason expire-trades hits the
-- Node app instead of an Edge Function — needs the app's own wallet/ledger
-- logic). Reuses the same Vault entries as expire-trades
-- (20260905_wire_expire_trades_cron.sql) — app_base_url and cron_secret —
-- no new secrets needed.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_execute_limit_orders()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'net'
AS $$
DECLARE
  app_url text;
  cron_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO app_url FROM vault.decrypted_secrets WHERE name = 'app_base_url';
  SELECT decrypted_secret INTO cron_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  IF app_url IS NULL OR cron_secret IS NULL THEN
    RAISE EXCEPTION 'app_base_url / cron_secret not set in vault.secrets';
  END IF;

  SELECT net.http_post(
    url := app_url || '/api/public/cron/execute-limit-orders',
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

REVOKE ALL ON FUNCTION public.trigger_execute_limit_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_execute_limit_orders() TO postgres;

SELECT cron.schedule(
  'execute-limit-orders',
  '* * * * *',
  $$ SELECT public.trigger_execute_limit_orders(); $$
);
