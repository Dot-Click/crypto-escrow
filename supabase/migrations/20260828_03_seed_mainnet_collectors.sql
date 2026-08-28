-- Mainnet collector (hot) addresses. These are the destinations the sweeper
-- moves user deposits to; withdrawals draw from them. The addresses below
-- MUST be filled in from the output of scripts/generate-wallet-seed.mjs
-- BEFORE this migration runs against production. Placeholders here fail
-- fast in the sweeper (see supabase/functions/sweep/index.ts).
--
-- Confirmations are mainnet defaults; adjust per your risk tolerance.
-- The token_contract_address for USDT_BSC MUST be BSC-USDT's real contract:
--   0x55d398326f99059fF775485246999027B3197955

INSERT INTO public.master_wallets
  (crypto_type, network, label, address, token_contract_address, min_confirmations, active, purpose)
VALUES
  ('BTC', 'BTC_MAINNET', 'Bitcoin (mainnet)',
   'PLACEHOLDER_SET_COLLECTOR_ADDRESS_BEFORE_DEPLOY',
   NULL, 3, false, 'collector'),
  ('LTC', 'LTC_MAINNET', 'Litecoin (mainnet)',
   'PLACEHOLDER_SET_COLLECTOR_ADDRESS_BEFORE_DEPLOY',
   NULL, 6, false, 'collector'),
  ('ETH', 'ETH_MAINNET', 'Ethereum (mainnet)',
   'PLACEHOLDER_SET_COLLECTOR_ADDRESS_BEFORE_DEPLOY',
   NULL, 12, false, 'collector'),
  ('USDT', 'BSC_MAINNET', 'Tether USDT (BSC BEP-20 mainnet)',
   'PLACEHOLDER_SET_COLLECTOR_ADDRESS_BEFORE_DEPLOY',
   '0x55d398326f99059fF775485246999027B3197955', 15, false, 'collector')
ON CONFLICT (crypto_type, network) DO UPDATE SET
  label = EXCLUDED.label,
  token_contract_address = EXCLUDED.token_contract_address,
  min_confirmations = EXCLUDED.min_confirmations,
  purpose = EXCLUDED.purpose,
  updated_at = now();
