-- Reusable, profile-level saved payment methods (bank details, PayPal email,
-- etc.), so sellers stop having to retype account details into trade chat
-- every time. A listing can attach at most one saved method per accepted
-- payment method name; the trade room reveals the attached details to the
-- counterparty once a trade is open on that listing.

CREATE TABLE public.payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  method text NOT NULL,
  label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.listing_payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  method text NOT NULL,
  UNIQUE (listing_id, method)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;

GRANT SELECT, INSERT, DELETE ON public.listing_payment_methods TO authenticated;
GRANT ALL ON public.listing_payment_methods TO service_role;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_payment_methods ENABLE ROW LEVEL SECURITY;

-- Only the owner ever reads/writes their saved payment method rows directly.
-- Revealing a seller's details to a buyer happens through a server function
-- (service role + an explicit trade-party check), not through RLS, since the
-- reveal condition ("are you a party to a trade on this listing") spans
-- tables RLS can't cleanly express without leaking rows.
CREATE POLICY "own payment methods readable" ON public.payment_methods
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "own payment methods insert" ON public.payment_methods
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "own payment methods update" ON public.payment_methods
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own payment methods delete" ON public.payment_methods
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "own listing payment methods readable" ON public.listing_payment_methods
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid()));

CREATE POLICY "own listing payment methods insert" ON public.listing_payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.payment_methods p WHERE p.id = payment_method_id AND p.user_id = auth.uid())
  );

CREATE POLICY "own listing payment methods delete" ON public.listing_payment_methods
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid()));
