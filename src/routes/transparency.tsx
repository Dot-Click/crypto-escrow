import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getTransparencyStats } from "@/lib/platform-stats.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/transparency")({
  head: () => ({
    meta: [
      { title: "Transparency — FOMN" },
      {
        name: "description",
        content: "Live reserves, liabilities and dispute numbers for the FOMN escrow platform.",
      },
    ],
  }),
  component: TransparencyPage,
});

function formatAmount(n: number) {
  if (n === 0) return "0";
  const decimals = n < 1 ? 8 : n < 1000 ? 4 : 2;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function timeAgo(iso: string) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function TransparencyPage() {
  const fetchStats = useServerFn(getTransparencyStats);
  const stats = useQuery({
    queryKey: ["transparency-stats"],
    queryFn: () => fetchStats(),
    refetchInterval: 30_000,
  });

  // Independent 1s tick so "last updated" stays live between the 30s refetches.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-start gap-3">
        <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transparency</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Live platform numbers, straight from the ledger — refreshed every 30 seconds
            {stats.data ? <> (checked {timeAgo(stats.data.checkedAt)})</> : null}. Your balance is
            yours: withdrawals are open at all times, with no lock-ups and no minimum holding
            period.
          </p>
        </div>
      </div>

      {stats.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading live numbers…</p>
      ) : stats.error ? (
        <p className="text-sm text-destructive">Couldn't load platform stats right now.</p>
      ) : stats.data ? (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            {[
              { label: "Open disputes", value: stats.data.disputes.open.toLocaleString() },
              {
                label: "Oldest open dispute",
                value:
                  stats.data.disputes.open === 0
                    ? "—"
                    : stats.data.disputes.oldestOpenMinutes < 60
                      ? `${stats.data.disputes.oldestOpenMinutes} min`
                      : `${Math.round(stats.data.disputes.oldestOpenMinutes / 60)} hr`,
              },
              { label: "Trades started (24h)", value: stats.data.trades24h.started.toLocaleString() },
              { label: "Trades completed (24h)", value: stats.data.trades24h.completed.toLocaleString() },
            ].map((s) => (
              <div key={s.label} className="bg-card p-4">
                <div className="mono text-2xl font-semibold tabular-nums">{s.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          <Card className="mt-6">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">System reserves</TableHead>
                    <TableHead className="text-right">User liabilities</TableHead>
                    <TableHead className="text-right">Coverage</TableHead>
                    <TableHead className="text-right">In escrow</TableHead>
                    <TableHead className="text-right">In transit</TableHead>
                    <TableHead className="text-right">Accounts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.data.ledger.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        No wallet activity yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.data.ledger.map((row) => {
                      const coverage =
                        row.userLiabilities === 0 ? null : (row.systemReserves / row.userLiabilities) * 100;
                      return (
                        <TableRow key={row.currency}>
                          <TableCell className="font-medium">{row.currency}</TableCell>
                          <TableCell className="mono text-right tabular-nums">
                            {formatAmount(row.systemReserves)}
                          </TableCell>
                          <TableCell className="mono text-right tabular-nums">
                            {formatAmount(row.userLiabilities)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                "mono tabular-nums " +
                                (coverage === null || coverage >= 100 ? "text-green-600" : "text-destructive")
                              }
                            >
                              {coverage === null ? "—" : `${coverage.toFixed(1)}%`}
                            </span>
                          </TableCell>
                          <TableCell className="mono text-right tabular-nums">
                            {formatAmount(row.inEscrow)}
                          </TableCell>
                          <TableCell className="mono text-right tabular-nums">
                            {formatAmount(row.inTransit)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.accounts}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="mt-4 text-xs text-muted-foreground">
            Reserves are what the platform holds against user balances; liabilities are what users
            can claim (wallet balance plus anything held in escrow). Coverage is reserves over
            liabilities — at or above 100% every balance is fully backed. This build is a
            testnet-ledger custody model: a deposit credits your wallet balance directly, so
            reserves are read from the same ledger as liabilities rather than a separate on-chain
            balance. Escrow is the slice currently locked inside active trades, and in transit is
            money already received that is still moving from deposit addresses to the platform's
            collector wallet (it's already counted inside reserves).
          </p>
        </>
      ) : null}
    </div>
  );
}
