-- TRC20 USDT collector addresses (withdrawal only — no Tron deposit support
-- yet, so no hd_wallet_state rows are needed here; those only matter for
-- allocating per-user deposit-address indices, which Tron doesn't have).
--
-- The addresses below MUST be filled in before this is useful: run
-- scripts/derive-tron-collector.mjs against the EXISTING wallet mnemonic
-- (it derives from the seed already deployed — it does not create a new
-- one) and paste its output over the two PLACEHOLDER_... strings. Left as
-- placeholders, the broadcaster refuses these rows outright (see
-- supabase/functions/broadcast-withdrawals/index.ts's collector check).
--
-- USDT-TRC20 mainnet contract (Tether's official one):
--   TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
-- Nile testnet USDT-TRC20 contract varies by faucet/deployment — verify the
-- current address before deploying (Tron testnet contracts get redeployed
-- more often than BSC's).

INSERT INTO public.master_wallets
  (crypto_type, network, label, address, token_contract_address, min_confirmations, active, purpose)
VALUES
  ('USDT', 'TRON_MAINNET', 'Tether USDT (Tron TRC20 mainnet)',
   'PLACEHOLDER_SET_COLLECTOR_ADDRESS_BEFORE_DEPLOY',
   'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 19, false, 'collector'),
  ('USDT', 'TRON_TESTNET', 'Tether USDT (Tron Nile testnet)',
   'PLACEHOLDER_SET_TESTNET_COLLECTOR_BEFORE_DEPLOY',
   'PLACEHOLDER_SET_NILE_USDT_CONTRACT_BEFORE_DEPLOY', 19, false, 'collector')
ON CONFLICT (crypto_type, network) DO UPDATE SET
  label = EXCLUDED.label,
  address = EXCLUDED.address,
  token_contract_address = EXCLUDED.token_contract_address,
  min_confirmations = EXCLUDED.min_confirmations,
  purpose = EXCLUDED.purpose,
  updated_at = now();
