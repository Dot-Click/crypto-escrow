-- Per-user notification preferences (email) and saved Web Push subscriptions,
-- so trade/message notifications can be toggled from a Settings page.

ALTER TABLE public.profiles
  ADD COLUMN email_notifications boolean NOT NULL DEFAULT true;

CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner manages their own subscription rows directly; sending push
-- notifications to OTHER users happens server-side via service role.
CREATE POLICY "own push subscriptions readable" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "own push subscriptions insert" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "own push subscriptions delete" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
