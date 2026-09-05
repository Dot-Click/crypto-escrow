import { createFileRoute } from "@tanstack/react-router";

// Belt-and-suspenders sweep for stale trades, called by pg_cron every 5
// minutes (see supabase/migrations/*_wire_expire_trades_cron.sql). Without
// this, a trade only expires lazily — when a party happens to reopen that
// exact trade or their trades list — so one nobody revisits can sit funded
// indefinitely. Calling expireStaleTrades() with no params sweeps every
// escrow_funded trade past its expiry, platform-wide.
export const Route = createFileRoute("/api/public/cron/expire-trades")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env['CRON_SECRET'];
        const got = request.headers.get("x-cron-secret");
        if (!expected || !got || got !== expected) {
          return new Response("forbidden", { status: 403 });
        }

        const { expireStaleTrades } = await import("@/lib/escrow.server");
        const result = await expireStaleTrades();
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
