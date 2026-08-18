UPDATE public.wallets
SET external_deposit_address = NULL
WHERE external_deposit_address LIKE 'TESTNET-DEMO-%';