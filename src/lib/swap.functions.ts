import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const quoteSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fromCrypto: string; toCrypto: string; fromAmount: number }) => input)
  .handler(async ({ data }) => {
    const { getSwapQuote } = await import("@/lib/swap.server");
    return getSwapQuote(data.fromCrypto, data.toCrypto, data.fromAmount);
  });

export const swap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fromCrypto: string; toCrypto: string; fromAmount: number }) => input)
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    await enforceRateLimit({ userId: context.userId, action: "swap", limit: 20, windowSeconds: 3600 });

    const { executeSwap } = await import("@/lib/swap.server");
    return executeSwap({ userId: context.userId, ...data });
  });
