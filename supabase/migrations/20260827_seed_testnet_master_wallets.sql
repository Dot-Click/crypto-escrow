-- Seed the platform-owned testnet deposit addresses. Network codes must match
-- the switch in src/lib/deposit-verification.server.ts exactly.
INSERT INTO public.master_wallets
  (crypto_type, network, label, address, token_contract_address, min_confirmations, active)
VALUES
  ('BTC', 'BTC_TESTNET', 'Bitcoin (testnet3)',
   'tb1qqltm70wyz734t9k8d9w70uuhyxnemyh56d5ra8rtw082ytd7ywmsqudq5e',
   NULL, 1, true),
  ('ETH', 'ETH_SEPOLIA', 'Ethereum (Sepolia)',
   '0xE4C0F43C711e87F7327D9e47320792Bf5cEe10cd',
   NULL, 1, true),
  ('USDT', 'USDT_BEP20', 'Tether USDT (BSC testnet)',
   '0xE4C0F43C711e87F7327D9e47320792Bf5cEe10cd',
   NULL, -- must be set to the testnet USDT-BEP20 token contract address before this network works correctly, see chat
   1, true),
  ('LTC', 'LTC_TESTNET', 'Litecoin (testnet3)',
   'tltc1qv2ekpquzl94vjvv5e3l2q9uwlppdwyjf5aeyx6',
   NULL, 1, true)
ON CONFLICT (crypto_type, network) DO UPDATE SET
  address = EXCLUDED.address,
  label = EXCLUDED.label,
  active = true,
  updated_at = now();
