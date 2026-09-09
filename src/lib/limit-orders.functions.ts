import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createLimitOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fromCrypto: string; toCrypto: string; fromAmount: number; targetRate: number }) => input)
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    await enforceRateLimit({ userId: context.userId, action: "limit_order_create", limit: 20, windowSeconds: 3600 });

    const { createLimitOrder } = await import("@/lib/limit-orders.server");
    return createLimitOrder({ userId: context.userId, ...data });
  });

export const cancelLimitOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const { cancelLimitOrder } = await import("@/lib/limit-orders.server");
    return cancelLimitOrder({ userId: context.userId, orderId: data.orderId });
  });

export const listMyLimitOrdersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listMyLimitOrders } = await import("@/lib/limit-orders.server");
    return listMyLimitOrders(context.userId);
  });
