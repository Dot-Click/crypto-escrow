-- Country (collected at signup, shown on register like SafeTheTrade's own
-- form) and a lightweight referral system: every profile gets a short
-- shareable code, and signing up with someone else's code links you to
-- them via referred_by. No rewards/commission logic — SafeTheTrade never
-- documents one either, it's purely an invite-attribution field.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id);

-- Backfill + default: 8-char code from a random UUID. Collisions are
-- astronomically unlikely at this project's scale; if that ever changes,
-- swap this for a retry-on-conflict generator function instead.
UPDATE public.profiles
  SET referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  WHERE referral_code IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN referral_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  ALTER COLUMN referral_code SET NOT NULL,
  ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);

-- Deliberately no anon SELECT grant for referral_code: resolution happens
-- server-side in this SECURITY DEFINER trigger, which bypasses RLS. An
-- unrecognized code is silently ignored (referred_by stays null) rather
-- than erroring — same low-friction "optional" feel as the register form.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  referrer_id uuid;
BEGIN
  IF NEW.raw_user_meta_data->>'referral_code' IS NOT NULL THEN
    SELECT id INTO referrer_id
    FROM public.profiles
    WHERE referral_code = upper(NEW.raw_user_meta_data->>'referral_code')
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role, country, referred_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email,'trader'),'@',1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.profile_role, 'both'),
    NEW.raw_user_meta_data->>'country',
    referrer_id
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
