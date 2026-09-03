-- BTCPay Lightning Network deposits. Fully separate from the HD wallet
-- system (user_deposit_addresses / master_wallets / watch-deposits / sweep):
-- this only ever touches wallets/transactions to credit a settled invoice,
-- exactly like the HD watcher does, but the source of funds is a BTCPay
-- Lightning invoice instead of an on-chain address.
--
-- Crediting path: the watch-lightning-deposits Edge Function polls BTCPay
-- for each pending row's invoice status (there is no BTCPay webhook event
-- for a raw Lightning-node invoice, only for BTCPay's own "Invoice" object —
-- see supabase/functions/watch-lightning-deposits/index.ts for the full
-- explanation). A manual "check now" recheck from the wallet UI uses the
-- same guarded transition.
CREATE TABLE public.lightning_deposit_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id),
  btcpay_invoice_id text NOT NULL UNIQUE,
  payment_hash text,
  bolt11 text NOT NULL,
  amount_btc numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'settled', 'expired', 'cancelled')),
  expires_at timestamp with time zone NOT NULL,
  transaction_id uuid REFERENCES public.transactions(id),
  last_checked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX lightning_deposit_invoices_user_idx ON public.lightning_deposit_invoices (user_id, created_at DESC);
CREATE INDEX lightning_deposit_invoices_pending_idx ON public.lightning_deposit_invoices (status, expires_at) WHERE status = 'pending';

GRANT SELECT ON public.lightning_deposit_invoices TO authenticated;
GRANT ALL ON public.lightning_deposit_invoices TO service_role;

ALTER TABLE public.lightning_deposit_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own lightning deposits readable" ON public.lightning_deposit_invoices
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER lightning_deposit_invoices_updated
  BEFORE UPDATE ON public.lightning_deposit_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
