import { supabase } from "@/integrations/supabase/client";

const BUCKET = "avatars";

/** Deterministic public URL for a user's avatar — no DB column needed. */
export function avatarUrl(userId: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(userId).data.publicUrl;
}

export async function uploadAvatar(userId: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(userId, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
    cacheControl: "0",
  });
  if (error) throw new Error(error.message);
}
