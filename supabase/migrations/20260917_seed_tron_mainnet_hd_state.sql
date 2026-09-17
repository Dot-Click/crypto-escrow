-- Enables allocate_deposit_index('TRON_MAINNET') — the deposit-address
-- allocator raises "unknown network" without a row here. TRON_MAINNET is
-- the only Tron network with a real (non-placeholder) collector address
-- and USDT contract configured (see 20260911_04_seed_tron_collectors.sql),
-- so it's the only one seeded. next_index starts at 1 — index 0 is
-- reserved for the collector on every network, same as the other coins.
--
-- Note: this only lets a per-user deposit address be derived and shown in
-- the UI. It does NOT make incoming Tron deposits auto-detected/credited —
-- watch-deposits only scans UTXO and EVM-RPC chains today, with no Tron
-- (TronGrid-based) scanning path yet. That's a separate, larger piece of
-- work still to be built.
INSERT INTO public.hd_wallet_state (network, next_index) VALUES
  ('TRON_MAINNET', 1)
ON CONFLICT (network) DO NOTHING;
