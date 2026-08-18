-- enums
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TYPE public.profile_role AS ENUM ('buyer','seller','both');
CREATE TYPE public.listing_side AS ENUM ('sell','buy');
CREATE TYPE public.listing_status AS ENUM ('active','paused','completed');
CREATE TYPE public.trade_status AS ENUM ('pending','escrow_funded','payment_claimed','released','disputed','cancelled');
CREATE TYPE public.tx_type AS ENUM ('deposit','withdrawal','escrow_hold','escrow_release','escrow_refund');
CREATE TYPE public.tx_status AS ENUM ('pending','completed','failed');
CREATE TYPE public.dispute_status AS ENUM ('open','resolved');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  display_name TEXT NOT NULL DEFAULT 'Trader',
  role public.profile_role NOT NULL DEFAULT 'both',
  trades_completed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- new user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email,'trader'),'@',1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.profile_role, 'both')
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- wallets
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  crypto_type TEXT NOT NULL,
  balance NUMERIC(24,8) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  held_balance NUMERIC(24,8) NOT NULL DEFAULT 0 CHECK (held_balance >= 0),
  external_deposit_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, crypto_type)
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallets readable" ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER wallets_updated BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- listings
CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  side public.listing_side NOT NULL DEFAULT 'sell',
  crypto_type TEXT NOT NULL,
  amount NUMERIC(24,8) NOT NULL CHECK (amount > 0),
  price NUMERIC(18,2) NOT NULL CHECK (price > 0),
  fiat_currency TEXT NOT NULL DEFAULT 'USD',
  accepted_payment_methods TEXT[] NOT NULL DEFAULT '{}',
  terms TEXT,
  status public.listing_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings readable" ON public.listings FOR SELECT TO authenticated USING (status = 'active' OR seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own listings insert" ON public.listings FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());
CREATE POLICY "own listings update" ON public.listings FOR UPDATE TO authenticated USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());
CREATE POLICY "own listings delete" ON public.listings FOR DELETE TO authenticated USING (seller_id = auth.uid());
CREATE TRIGGER listings_updated BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- trades
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  buyer_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  crypto_type TEXT NOT NULL,
  amount NUMERIC(24,8) NOT NULL CHECK (amount > 0),
  price NUMERIC(18,2) NOT NULL,
  fiat_currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT,
  status public.trade_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "party trades readable" ON public.trades FOR SELECT TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trades_updated BEFORE UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_trade_party(_trade_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trades t WHERE t.id = _trade_id AND (t.buyer_id = _user_id OR t.seller_id = _user_id))
$$;

-- messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade party messages readable" ON public.messages FOR SELECT TO authenticated USING (public.is_trade_party(trade_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "trade party messages insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid() AND public.is_trade_party(trade_id, auth.uid()));

-- transactions (ledger) - server writes only
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  trade_id UUID REFERENCES public.trades(id) ON DELETE SET NULL,
  type public.tx_type NOT NULL,
  amount NUMERIC(24,8) NOT NULL,
  crypto_type TEXT NOT NULL,
  external_tx_hash TEXT,
  external_address TEXT,
  status public.tx_status NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions readable" ON public.transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- disputes
CREATE TABLE public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL,
  reason TEXT NOT NULL,
  status public.dispute_status NOT NULL DEFAULT 'open',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade party disputes readable" ON public.disputes FOR SELECT TO authenticated USING (public.is_trade_party(trade_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER disputes_updated BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_listings_status ON public.listings(status, created_at DESC);
CREATE INDEX idx_trades_parties ON public.trades(buyer_id, seller_id);
CREATE INDEX idx_messages_trade ON public.messages(trade_id, created_at);
CREATE INDEX idx_tx_user ON public.transactions(user_id, created_at DESC);