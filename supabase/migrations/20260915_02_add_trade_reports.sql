-- Client ask: "report a problem" must be a separate action from "dispute" —
-- usable by either trade party at any time (including after the trade is
-- completed) for things like chargebacks or abusive behavior, not tied to
-- escrow resolution the way public.disputes is. Mirrors disputes' shape
-- closely, but deliberately a separate table so reports are never confused
-- with escrow-affecting disputes in admin views or metrics.
CREATE TYPE public.trade_report_status AS ENUM ('open', 'reviewed');

CREATE TABLE public.trade_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id uuid NOT NULL REFERENCES public.trades(id),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  status public.trade_report_status NOT NULL DEFAULT 'open',
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trade_reports TO authenticated;
GRANT ALL ON public.trade_reports TO service_role;

ALTER TABLE public.trade_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trade party reports readable" ON public.trade_reports
  FOR SELECT TO authenticated
  USING (
    public.is_trade_party(trade_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER trade_reports_updated
  BEFORE UPDATE ON public.trade_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
