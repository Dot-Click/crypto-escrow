-- Schedules the watch-lightning-deposits Edge Function. Reuses
-- public.trigger_edge_function() installed by 20260828_05_wire_deposit_crons.sql
-- (same Vault entries: edge_functions_base_url, cron_secret) — no new
-- secrets needed for the scheduling mechanism itself, only for the
-- function's own BTCPAY_* Supabase secrets (set separately).
SELECT cron.schedule(
  'watch-lightning-deposits',
  '* * * * *',
  $$ SELECT public.trigger_edge_function('watch-lightning-deposits'); $$
);
