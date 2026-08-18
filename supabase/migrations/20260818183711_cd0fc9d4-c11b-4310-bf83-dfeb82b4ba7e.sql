DELETE FROM public.transactions
WHERE provider_payment_id = '999123' OR external_address = 'tb1qexampletestnetaddressxyz0001';

UPDATE public.wallets
SET balance = 0
WHERE id = '860b5264-61ee-489c-a89e-2542ad2bd879';