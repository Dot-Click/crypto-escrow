-- Fixes a stuck-trade bug: a trade only expired lazily (when a party
-- reopened that exact trade or their trades list), and any trade opened on
-- a listing with its time limit disabled got expires_at = NULL, which can
-- never satisfy expireStaleTrades's `.lt("expires_at", now)` filter — so it
-- sat funded in escrow forever no matter how often anyone looked at it.
--
-- One-time backfill: give every currently-open trade with a null
-- expires_at a fresh 24h window from now, rather than retroactively
-- expiring (and refunding) trades that may be actively in progress.
UPDATE public.trades
SET expires_at = now() + interval '24 hours'
WHERE status = 'escrow_funded' AND expires_at IS NULL;

-- Ongoing fix (app-side, see src/lib/escrow.server.ts openTrade): every new
-- trade now always gets an expires_at, falling back to
-- DEFAULT_MAX_PAYMENT_WINDOW_MINUTES when the listing's time limit is off.

-- Belt-and-suspenders sweep: call the app's own /api/public/cron/expire-trades
-- route every 5 minutes via pg_cron + pg_net, so a trade nobody revisits
-- still gets swept. This complements (doesn't replace) the CRON_SECRET-based
-- Edge Function pattern already wired in 20260828_05_wire_deposit_crons.sql —
-- the difference is this hits the Node app itself, not a Supabase Edge
-- Function, since expireStaleTrades()'s refund + email-notify logic already
-- lives there.
--
-- Prerequisites BEFORE running this migration:
--   1. Set CRON_SECRET in the app's environment (Vercel Project Settings ->
--      Environment Variables) — reuse the same value already set for the
--      Edge Functions' CRON_SECRET if you have one, or generate a new
--      random 32-byte hex value.
--   2. In the Supabase SQL editor, once, register the app's public base URL
--      and the same CRON_SECRET in Vault (skip the first if you already
--      created 'cron_secret' for the deposit crons — reuse it):
--        SELECT vault.create_secret('https://your-deployed-domain.com', 'app_base_url');
--        SELECT vault.create_secret('<CRON_SECRET>', 'cron_secret');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_expire_trades()
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
    url := app_url || '/api/public/cron/expire-trades',
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

REVOKE ALL ON FUNCTION public.trigger_expire_trades() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_expire_trades() TO postgres;

SELECT cron.schedule(
  'expire-trades',
  '*/5 * * * *',
  $$ SELECT public.trigger_expire_trades(); $$
);
