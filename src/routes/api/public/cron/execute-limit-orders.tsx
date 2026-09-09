import { createFileRoute } from "@tanstack/react-router";

// Sweeps every open limit order against live prices and fills whichever
// have crossed their target rate, called by pg_cron every minute (see
// supabase/migrations/20260909_03_wire_limit_orders_cron.sql). Same
// CRON_SECRET pattern as /api/public/cron/expire-trades.
export const Route = createFileRoute("/api/public/cron/execute-limit-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env['CRON_SECRET'];
        const got = request.headers.get("x-cron-secret");
        if (!expected || !got || got !== expected) {
          return new Response("forbidden", { status: 403 });
        }

        const { fillEligibleLimitOrders } = await import("@/lib/limit-orders.server");
        const result = await fillEligibleLimitOrders();
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
