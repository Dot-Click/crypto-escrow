-- New ledger transaction types for the Swap feature and for limit orders
-- filling (a filled limit order is economically just a swap). Two distinct
-- types rather than one ambiguous "swap", matching the existing
-- escrow_hold/escrow_release/escrow_refund pattern where direction is
-- encoded in the type rather than the sign of `amount`.
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'swap_out';
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'swap_in';
