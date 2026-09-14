-- Splits the old "/profile" page into a public reputation Profile page and a
-- separate Account Settings page. The public page needs several features this
-- schema never tracked: a bio, presence, per-trade positive/negative feedback,
-- trust/block relationships between traders, generic user reports (as opposed
-- to the existing trade_reports, which are always tied to one trade), and an
-- internal wallet-to-wallet "Send crypto" transfer between two users.

ALTER TABLE public.profiles ADD COLUMN bio text;
ALTER TABLE public.profiles ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

-- One rating per trade side (buyer rates seller, seller rates buyer), always
-- public — this is reputation data, the same spirit as the profile page it
-- feeds. Only reads go through the public client; the public trader-profile
-- page itself always uses supabaseAdmin like getTraderProfile already does.
CREATE TABLE public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  rated_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_positive boolean NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, rater_id)
);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback publicly readable" ON public.user_feedback
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "trade party rates the other side" ON public.user_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND rated_user_id <> auth.uid()
    AND public.is_trade_party(trade_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.trades t
      WHERE t.id = trade_id
        AND t.status = 'released'
        AND (
          (t.buyer_id = auth.uid() AND t.seller_id = rated_user_id)
          OR (t.seller_id = auth.uid() AND t.buyer_id = rated_user_id)
        )
    )
  );

-- Trust/block are one-directional opinions the actor holds about another
-- trader. No public select policy: aggregate counts shown on a profile
-- (trusted by / blocked by / has blocked) are computed server-side with
-- supabaseAdmin, same pattern as every other aggregate on that page.
CREATE TABLE public.user_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  other_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('trust', 'block')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, other_user_id, kind),
  CHECK (user_id <> other_user_id)
);

ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own relationships" ON public.user_relationships
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Generic "report this user" — mirrors trade_reports but isn't tied to one
-- trade, for abuse that spans a trader's whole account rather than one deal.
CREATE TABLE public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id),
  reported_user_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  status public.trade_report_status NOT NULL DEFAULT 'open',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);

GRANT SELECT ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reporter reads own reports" ON public.user_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "users file reports" ON public.user_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());

CREATE TRIGGER user_reports_updated
  BEFORE UPDATE ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lets a transaction record who the other side of an internal transfer was
-- (the new "Send crypto" feature). Nullable: irrelevant for every other
-- existing transaction type.
ALTER TABLE public.transactions ADD COLUMN counterparty_id uuid REFERENCES public.profiles(id);

ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'transfer_in';

CREATE INDEX idx_user_feedback_rated_user ON public.user_feedback(rated_user_id, created_at DESC);
CREATE INDEX idx_user_relationships_other_user ON public.user_relationships(other_user_id, kind);
