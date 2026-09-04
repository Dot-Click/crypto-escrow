-- Public avatar storage. One object per user at a fixed path (userId, no
-- extension) so the public URL is deterministic and no `avatar_url` column
-- is needed anywhere — the same pattern SafeTheTrade documents for its
-- fixed-path GET /v1/users/:id/avatar endpoint. Bucket is public so avatars
-- render on public pages (marketplace cards, /traders/:userId) with no auth.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "anyone can view avatars"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "users can upload their own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND name = auth.uid()::text);

CREATE POLICY "users can replace their own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND name = auth.uid()::text);

CREATE POLICY "users can delete their own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND name = auth.uid()::text);
