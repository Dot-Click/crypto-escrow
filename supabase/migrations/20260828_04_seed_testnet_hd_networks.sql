-- Testnet HD network state + collector addresses. Coexists with the
-- mainnet rows: each network is one row in master_wallets + one in
-- hd_wallet_state, so activating testnet doesn't touch mainnet and
-- vice versa. Start here for the full end-to-end test on cheap coins
-- before flipping mainnet on.
--
-- Testnet USDT-BEP20 contract on the Chapel testnet:
--   0x337610d27c682E347C9cD60BD4b3b107C9d34dDd
-- (Verify current address at https://testnet.bscscan.com/token/... before
-- deploying. Testnet token contracts occasionally get re-deployed.)

INSERT INTO public.hd_wallet_state (network, next_index) VALUES
  ('BTC_TESTNET', 1),
  ('LTC_TESTNET', 1),
  ('ETH_SEPOLIA', 1),
  ('BSC_TESTNET', 1)
ON CONFLICT (network) DO NOTHING;

INSERT INTO public.master_wallets
  (crypto_type, network, label, address, token_contract_address, min_confirmations, active, purpose)
VALUES
  ('BTC', 'BTC_TESTNET', 'Bitcoin (testnet3)',
   'PLACEHOLDER_SET_TESTNET_COLLECTOR_BEFORE_DEPLOY',
   NULL, 1, false, 'collector'),
  ('LTC', 'LTC_TESTNET', 'Litecoin (testnet4)',
   'PLACEHOLDER_SET_TESTNET_COLLECTOR_BEFORE_DEPLOY',
   NULL, 1, false, 'collector'),
  ('ETH', 'ETH_SEPOLIA', 'Ethereum (Sepolia)',
   'PLACEHOLDER_SET_TESTNET_COLLECTOR_BEFORE_DEPLOY',
   NULL, 3, false, 'collector'),
  ('USDT', 'BSC_TESTNET', 'Tether USDT (BSC BEP-20 testnet)',
   'PLACEHOLDER_SET_TESTNET_COLLECTOR_BEFORE_DEPLOY',
   '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', 3, false, 'collector')
ON CONFLICT (crypto_type, network) DO UPDATE SET
  label = EXCLUDED.label,
  address = EXCLUDED.address,
  token_contract_address = EXCLUDED.token_contract_address,
  min_confirmations = EXCLUDED.min_confirmations,
  purpose = EXCLUDED.purpose,
  updated_at = now();
