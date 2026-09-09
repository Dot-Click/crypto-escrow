-- Limit orders: "swap from_crypto -> to_crypto once the rate reaches
-- target_rate" (to_crypto received per 1 from_crypto), filled automatically
-- by a cron sweep (see 20260909_03_wire_limit_orders_cron.sql), same
-- belt-and-suspenders pg_cron + pg_net pattern already used for
-- expire-trades. The committed from_amount is held (wallets.balance ->
-- held_balance) at creation time, same escrow-hold mechanism trades already
-- use, so a user can't double-spend funds behind an open order.
CREATE TABLE IF NOT EXISTS public.limit_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  from_crypto text NOT NULL,
  to_crypto text NOT NULL,
  from_amount numeric NOT NULL CHECK (from_amount > 0),
  target_rate numeric NOT NULL CHECK (target_rate > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  filled_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  filled_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS limit_orders_open_idx ON public.limit_orders (from_crypto, to_crypto) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS limit_orders_user_id_idx ON public.limit_orders (user_id);

ALTER TABLE public.limit_orders ENABLE ROW LEVEL SECURITY;

-- Defense in depth only — all reads/writes actually go through server
-- functions using supabaseAdmin (service role), same as trades/wallets.
CREATE POLICY "own limit orders select" ON public.limit_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
