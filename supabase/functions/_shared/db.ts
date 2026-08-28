// Supabase client for Edge Function use. Runs with the service role key so
// it can bypass RLS — never expose to a user request.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

let cached: SupabaseClient | null = null;

export function getAdminDb(): SupabaseClient {
  if (cached) return cached;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/**
 * Guard: fail if the caller did not provide the shared secret. Called at
 * the top of every cron-invoked function so a leaked function URL cannot
 * be triggered by anyone with the URL.
 */
export function requireCronSecret(req: Request): void {
  const expected = Deno.env.get("CRON_SECRET");
  const got = req.headers.get("x-cron-secret");
  if (!expected || !got || got !== expected) {
    throw new Response("forbidden", { status: 403 });
  }
}
