ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END $$;

DROP POLICY IF EXISTS "trade party can read attachments" ON storage.objects;
CREATE POLICY "trade party can read attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'trade-attachments'
  AND public.is_trade_party(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "trade party can upload attachments" ON storage.objects;
CREATE POLICY "trade party can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'trade-attachments'
  AND public.is_trade_party(((storage.foldername(name))[1])::uuid, auth.uid())
);