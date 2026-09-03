import { createServerFn } from "@tanstack/react-start";

/**
 * Public, unauthenticated platform-health numbers for the Transparency page.
 *
 * "System reserves" equals user liabilities here on purpose: this build is a
 * custodial *ledger*, not a segregated hot-wallet — a deposit credits
 * `wallets.balance` directly (see ARCHITECTURE.md), so there is no separate
 * on-chain reserve figure to reconcile against yet. Once withdrawals sweep
 * from real collector wallets with on-chain balances, reserves should be
 * read from those wallets instead of mirrored from liabilities.
 */
export const getTransparencyStats = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: openDisputes }, { count: started24h }, { count: completed24h }, { data: wallets }, { data: sweepsInFlight }] =
    await Promise.all([
      supabaseAdmin.from("disputes").select("created_at").eq("status", "open"),
      supabaseAdmin.from("trades").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      supabaseAdmin
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("status", "released")
        .gte("updated_at", dayAgo),
      supabaseAdmin.from("wallets").select("crypto_type, balance, held_balance"),
      // Deposits already credited to a user's wallet balance, but not yet
      // swept from their personal deposit address into the collector
      // wallet — "received but still moving," same definition SafeTheTrade
      // uses. It's already counted inside reserves/liabilities above; this
      // is purely the informational breakout of how much of it is in flight.
      supabaseAdmin.from("deposit_sweeps").select("crypto_type, amount").in("status", ["pending", "broadcast"]),
    ]);

  const now = Date.now();
  const oldestOpenMs = (openDisputes ?? []).reduce((max, d) => {
    const age = now - new Date(d.created_at).getTime();
    return age > max ? age : max;
  }, 0);

  const byCurrency = new Map<
    string,
    { userLiabilities: number; inEscrow: number; inTransit: number; accounts: number }
  >();
  for (const w of wallets ?? []) {
    const bucket =
      byCurrency.get(w.crypto_type) ?? { userLiabilities: 0, inEscrow: 0, inTransit: 0, accounts: 0 };
    const balance = Number(w.balance);
    const held = Number(w.held_balance);
    bucket.userLiabilities += balance + held;
    bucket.inEscrow += held;
    if (balance + held > 0) bucket.accounts += 1;
    byCurrency.set(w.crypto_type, bucket);
  }
  for (const s of sweepsInFlight ?? []) {
    const bucket = byCurrency.get(s.crypto_type) ?? {
      userLiabilities: 0,
      inEscrow: 0,
      inTransit: 0,
      accounts: 0,
    };
    bucket.inTransit += Number(s.amount);
    byCurrency.set(s.crypto_type, bucket);
  }

  const ledger = [...byCurrency.entries()]
    .map(([currency, v]) => ({
      currency,
      systemReserves: v.userLiabilities, // see note above — mirrored 1:1 for this ledger model
      userLiabilities: v.userLiabilities,
      inEscrow: v.inEscrow,
      inTransit: v.inTransit,
      accounts: v.accounts,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    checkedAt: new Date().toISOString(),
    disputes: {
      open: openDisputes?.length ?? 0,
      oldestOpenMinutes: Math.round(oldestOpenMs / 60000),
    },
    trades24h: {
      started: started24h ?? 0,
      completed: completed24h ?? 0,
    },
    ledger,
  };
});
