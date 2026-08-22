-- Full schema migration for the P2P escrow platform.
-- Run this against a fresh Supabase project to create all tables, enums,
-- Row Level Security policies, functions, triggers, realtime, and storage ACLs.

-- ---------- ENUMS ----------
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.dispute_status AS ENUM ('open', 'resolved');
CREATE TYPE public.listing_side AS ENUM ('sell', 'buy');
CREATE TYPE public.listing_status AS ENUM ('active', 'paused', 'completed');
CREATE TYPE public.profile_role AS ENUM ('buyer', 'seller', 'both');
CREATE TYPE public.trade_status AS ENUM (
  'pending',
  'escrow_funded',
  'payment_claimed',
  'released',
  'disputed',
  'cancelled'
);
CREATE TYPE public.tx_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE public.tx_type AS ENUM (
  'deposit',
  'withdrawal',
  'escrow_hold',
  'escrow_release',
  'escrow_refund'
);

-- ---------- TABLES ----------
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  email text,
  display_name text NOT NULL DEFAULT 'Trader'::text,
  role public.profile_role NOT NULL DEFAULT 'both'::public.profile_role,
  trades_completed integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE public.wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  crypto_type text NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  held_balance numeric NOT NULL DEFAULT 0,
  external_deposit_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, crypto_type)
);

CREATE TABLE public.listings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES public.profiles(id),
  side public.listing_side NOT NULL DEFAULT 'sell'::public.listing_side,
  crypto_type text NOT NULL,
  amount numeric NOT NULL,
  price numeric NOT NULL,
  margin_percent numeric NOT NULL DEFAULT 0,
  fixed_price numeric,
  min_amount numeric,
  max_amount numeric,
  payment_window_minutes integer,
  fiat_currency text NOT NULL DEFAULT 'USD'::text,
  accepted_payment_methods text[] NOT NULL DEFAULT '{}'::text[],
  terms text,
  status public.listing_status NOT NULL DEFAULT 'active'::public.listing_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid REFERENCES public.listings(id),
  buyer_id uuid NOT NULL REFERENCES public.profiles(id),
  seller_id uuid NOT NULL REFERENCES public.profiles(id),
  crypto_type text NOT NULL,
  amount numeric NOT NULL,
  price numeric NOT NULL,
  fee_amount numeric NOT NULL DEFAULT 0,
  payout_amount numeric NOT NULL DEFAULT 0,
  expires_at timestamp with time zone,
  fiat_currency text NOT NULL DEFAULT 'USD'::text,
  payment_method text,
  status public.trade_status NOT NULL DEFAULT 'pending'::public.trade_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id uuid NOT NULL REFERENCES public.trades(id),
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  content text,
  attachment_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  trade_id uuid REFERENCES public.trades(id),
  type public.tx_type NOT NULL,
  amount numeric NOT NULL,
  crypto_type text NOT NULL,
  external_tx_hash text,
  external_address text,
  status public.tx_status NOT NULL DEFAULT 'completed'::public.tx_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  provider_payment_id text,
  provider_payload jsonb
);

CREATE TABLE public.disputes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id uuid NOT NULL REFERENCES public.trades(id),
  raised_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  status public.dispute_status NOT NULL DEFAULT 'open'::public.dispute_status,
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

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

-- ---------- GRANTS ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

GRANT SELECT, INSERT ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;

GRANT SELECT, INSERT, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

GRANT ALL ON public.rate_limits TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;

GRANT SELECT, INSERT, DELETE ON public.listing_payment_methods TO authenticated;
GRANT ALL ON public.listing_payment_methods TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "own profile insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "own roles readable" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "listings readable" ON public.listings
  FOR SELECT TO authenticated
  USING (
    status = 'active'::public.listing_status
    OR seller_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "own listings insert" ON public.listings
  FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());

CREATE POLICY "own listings update" ON public.listings
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());

CREATE POLICY "own listings delete" ON public.listings
  FOR DELETE TO authenticated USING (seller_id = auth.uid());

CREATE POLICY "party trades readable" ON public.trades
  FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid()
    OR seller_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "trade party messages readable" ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.is_trade_party(trade_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "trade party messages insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_trade_party(trade_id, auth.uid())
  );

CREATE POLICY "own transactions readable" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "trade party disputes readable" ON public.disputes
  FOR SELECT TO authenticated
  USING (
    public.is_trade_party(trade_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "own wallets readable" ON public.wallets
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "own wallets insert" ON public.wallets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "own wallets update" ON public.wallets
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

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

-- ---------- FUNCTIONS & TRIGGERS ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email,'trader'),'@',1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.profile_role, 'both')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_trade_party(_trade_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trades
    WHERE id = _trade_id AND (buyer_id = _user_id OR seller_id = _user_id)
  );
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER wallets_updated
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER listings_updated
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trades_updated
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER disputes_updated
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lock down SECURITY DEFINER functions from public/anonymous invocation.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.is_trade_party(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trade_party(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trade_party(uuid, uuid) TO service_role;

-- ---------- REALTIME ----------
ALTER TABLE public.messages REPLICA IDENTITY FULL;
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ---------- STORAGE ----------
-- Create the private attachments bucket if it doesn't exist.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trade-attachments',
  'trade-attachments',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow trade parties to upload attachments only under trade_id/<id> paths.
CREATE POLICY "trade parties can upload attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'trade-attachments'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_trade_party(
      (storage.foldername(name))[1]::uuid,
      auth.uid()
    )
  );

CREATE POLICY "trade parties can read attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'trade-attachments'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_trade_party(
      (storage.foldername(name))[1]::uuid,
      auth.uid()
    )
  );
