import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function hasTradedWith(userId: string, otherUserId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("trades")
    .select("id", { count: "exact", head: true })
    .or(`and(buyer_id.eq.${userId},seller_id.eq.${otherUserId}),and(seller_id.eq.${userId},buyer_id.eq.${otherUserId})`);
  return (count ?? 0) > 0;
}

/** The viewer's own relationship to the profile they're looking at. */
export const getViewerRelationship = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetUserId: string }) => input)
  .handler(async ({ data, context }) => {
    if (data.targetUserId === context.userId) {
      return { isTrusted: false, isBlocked: false, canBlock: false, isSelf: true as const };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rows }, canBlock] = await Promise.all([
      supabaseAdmin
        .from("user_relationships")
        .select("kind")
        .eq("user_id", context.userId)
        .eq("other_user_id", data.targetUserId),
      hasTradedWith(context.userId, data.targetUserId),
    ]);
    const kinds = new Set((rows ?? []).map((r) => r.kind));
    return {
      isTrusted: kinds.has("trust"),
      isBlocked: kinds.has("block"),
      canBlock,
      isSelf: false as const,
    };
  });

export const setTrust = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetUserId: string; trusted: boolean }) => input)
  .handler(async ({ data, context }) => {
    if (data.targetUserId === context.userId) throw new Error("You can't trust yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.trusted) {
      const { error } = await supabaseAdmin
        .from("user_relationships")
        .upsert(
          { user_id: context.userId, other_user_id: data.targetUserId, kind: "trust" },
          { onConflict: "user_id,other_user_id,kind", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_relationships")
        .delete()
        .eq("user_id", context.userId)
        .eq("other_user_id", data.targetUserId)
        .eq("kind", "trust");
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const setBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetUserId: string; blocked: boolean }) => input)
  .handler(async ({ data, context }) => {
    if (data.targetUserId === context.userId) throw new Error("You can't block yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.blocked) {
      if (!(await hasTradedWith(context.userId, data.targetUserId))) {
        throw new Error("You can only block someone you've traded with");
      }
      const { error } = await supabaseAdmin
        .from("user_relationships")
        .upsert(
          { user_id: context.userId, other_user_id: data.targetUserId, kind: "block" },
          { onConflict: "user_id,other_user_id,kind", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_relationships")
        .delete()
        .eq("user_id", context.userId)
        .eq("other_user_id", data.targetUserId)
        .eq("kind", "block");
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });
