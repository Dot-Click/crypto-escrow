-- Two client-requested features:
--   1. A "Send feedback" entry point from the profile page.
--   2. Manual identity verification: a user uploads an ID image, an admin
--      reviews it by hand and approves/rejects — no automated KYC.

CREATE TYPE public.verification_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  page_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own feedback" ON public.feedback
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "users read own feedback" ON public.feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_path text NOT NULL, -- storage.objects path in the private 'verification-docs' bucket
  status public.verification_status NOT NULL DEFAULT 'pending',
  note text, -- reviewer's reason, shown back to the user on rejection
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own verification request" ON public.verification_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "users read own verification requests" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Only an admin resolves a request; enforced again in admin.server.ts's assertAdmin.
CREATE POLICY "admin updates verification requests" ON public.verification_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.profiles ADD COLUMN is_verified boolean NOT NULL DEFAULT false;

-- Private bucket — an ID document is never public. Only the uploading user
-- and admins (via supabaseAdmin, which bypasses storage RLS entirely) can
-- read it; there's deliberately no "anyone can view" policy like avatars.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-docs',
  'verification-docs',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "users upload own verification doc"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users read own verification doc"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
