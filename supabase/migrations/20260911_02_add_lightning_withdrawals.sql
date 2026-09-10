-- Outbound counterpart to lightning_deposit_invoices (20260903). Paying out
-- via BTCPay settles synchronously within the request (see
-- payLightningInvoice in src/lib/btcpay.server.ts) — there's no pending
-- polling loop like the deposit side's watcher, so status here only ever
-- moves pending -> paid or pending -> failed, both set by the same request
-- that attempted the payment.
CREATE TABLE public.lightning_withdrawals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id),
  bolt11 text NOT NULL,
  amount_btc numeric NOT NULL,
  fee_btc numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed')),
  btcpay_payment_id text,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX lightning_withdrawals_user_idx ON public.lightning_withdrawals (user_id, created_at DESC);

GRANT SELECT ON public.lightning_withdrawals TO authenticated;
GRANT ALL ON public.lightning_withdrawals TO service_role;

ALTER TABLE public.lightning_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own lightning withdrawals readable" ON public.lightning_withdrawals
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER lightning_withdrawals_updated
  BEFORE UPDATE ON public.lightning_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
