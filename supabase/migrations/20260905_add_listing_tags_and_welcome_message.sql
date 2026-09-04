-- Freeform offer tags + automatic trade welcome message, matching BitValve's
-- "Optional Settings" checklist (verification/phone/physical-card/e-code/
-- third-party/VPN policies) and its "Automatic Trade Message" field.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS welcome_message text;
