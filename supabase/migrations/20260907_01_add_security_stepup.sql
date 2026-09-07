-- Per-action security preferences: withdrawal and escrow-release each get
-- an independent verification method ('none' | 'email' | 'totp'). Login
-- already gets real 2FA for free via Supabase's own TOTP/AAL system when a
-- factor is enrolled (see auth-middleware.ts) — the only new login option
-- here is an EMAIL-code alternative for accounts that don't want to install
-- an authenticator app, which is why it's a separate boolean rather than a
-- third value on the same enum as the other two (it can only ever be "on"
-- when TOTP is off — enforced in security-settings.functions.ts, not here).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS withdrawal_verification text NOT NULL DEFAULT 'none'
    CHECK (withdrawal_verification IN ('none', 'email', 'totp')),
  ADD COLUMN IF NOT EXISTS release_verification text NOT NULL DEFAULT 'none'
    CHECK (release_verification IN ('none', 'email', 'totp')),
  ADD COLUMN IF NOT EXISTS login_email_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_notifications boolean NOT NULL DEFAULT true;

-- One-time codes for the 'email' verification method. A single table
-- serves all three purposes (login / withdrawal / release) — purpose is
-- part of every lookup so a code issued for one can never be replayed
-- against another.
CREATE TABLE public.verification_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('login', 'withdrawal', 'release')),
  code_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX verification_codes_lookup_idx
  ON public.verification_codes (user_id, purpose, consumed_at, expires_at);

GRANT ALL ON public.verification_codes TO service_role;
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
-- Server-role only: issued and checked exclusively from
-- step-up.server.ts via supabaseAdmin, never read/written by a client
-- request directly.

-- Marks a session (by its Supabase-issued session_id JWT claim) as having
-- completed the email login step-up. Checked on every authenticated
-- request by requireSupabaseAuth for accounts with login_email_verification
-- on and no TOTP factor enrolled — this is what makes the email option a
-- real second factor rather than a one-time UI screen: without a row here,
-- every other server function refuses the request, not just the login page.
CREATE TABLE public.login_step_ups (
  session_id text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verified_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL
);

CREATE INDEX login_step_ups_user_idx ON public.login_step_ups (user_id);

GRANT ALL ON public.login_step_ups TO service_role;
ALTER TABLE public.login_step_ups ENABLE ROW LEVEL SECURITY;

-- ---------- Telegram ----------
CREATE TABLE public.telegram_links (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL UNIQUE,
  linked_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_links TO service_role;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

-- Short-lived one-time codes for the "message this code to our bot" linking
-- handshake. A code is consumed (deleted) the moment the webhook matches it.
CREATE TABLE public.telegram_link_codes (
  code text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_link_codes TO service_role;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;
