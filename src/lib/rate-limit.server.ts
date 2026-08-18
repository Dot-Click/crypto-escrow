// Server-only sliding-window rate limiter backed by public.rate_limits.
export async function enforceRateLimit(params: {
  userId: string;
  action: string;
  limit: number;
  windowSeconds: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - params.windowSeconds * 1000).toISOString();

  const { count, error } = await supabaseAdmin
    .from("rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .eq("action", params.action)
    .gte("created_at", since);

  if (error) throw new Error(error.message);
  if ((count ?? 0) >= params.limit) {
    throw new Error("Too many requests — please wait a moment and try again.");
  }

  await supabaseAdmin
    .from("rate_limits")
    .insert({ user_id: params.userId, action: params.action });
}
