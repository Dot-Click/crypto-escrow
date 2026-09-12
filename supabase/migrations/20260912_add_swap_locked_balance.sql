-- Client ask: "the swapped amount cannot be withdrawn only for trading" —
-- funds obtained via the Swap feature should stay usable for trading
-- (escrow holds, limit orders, further swaps) but never leave the
-- platform via withdrawal.
--
-- Crypto is fungible, so we can't tag individual units as "swap-derived" —
-- instead this tracks a running counter of how much of the wallet's
-- current balance is swap-restricted. It increases when a swap credits a
-- wallet, and decreases (floored at the amount actually spent) whenever
-- that balance is spent for its permitted purpose — trading. See
-- swap.server.ts, escrow.server.ts and limit-orders.server.ts for the
-- read/write sites; wallet.functions.ts's requestWithdrawal is the only
-- place that treats it as a ceiling.
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS swap_locked_balance numeric NOT NULL DEFAULT 0;
