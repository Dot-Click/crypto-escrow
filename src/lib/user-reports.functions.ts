import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "Report this user" from a trader's public profile — not tied to one trade,
 * unlike reportTrade in trade-reports.functions.ts. */
export const reportUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; reason: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.userId)) throw new Error("Invalid user id");
    if (!input.reason || input.reason.trim().length < 10) {
      throw new Error("Describe the problem in at least 10 characters");
    }
    if (input.reason.length > 2000) throw new Error("Reason is too long");
    return input;
  })
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) throw new Error("You can't report yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_reports").insert({
      reporter_id: context.userId,
      reported_user_id: data.userId,
      reason: data.reason.trim(),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
