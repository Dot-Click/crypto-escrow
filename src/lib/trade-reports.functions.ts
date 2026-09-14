import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * "Report a problem" — separate from openDispute (src/lib/trades.functions.ts).
 * Callable by either trade party regardless of trade status, including long
 * after it's released or cancelled — see reportTradeProblem in escrow.server.ts
 * for why this is deliberately not the same thing as a dispute.
 */
export const reportTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tradeId: string; reason: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input.tradeId)) throw new Error("Invalid trade id");
    if (!input.reason || input.reason.trim().length < 10) {
      throw new Error("Describe the problem in at least 10 characters");
    }
    if (input.reason.length > 2000) throw new Error("Reason is too long");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { reportTradeProblem } = await import("@/lib/escrow.server");
    return reportTradeProblem({ tradeId: data.tradeId, reason: data.reason.trim(), userId: context.userId });
  });
