import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyTrades } from "@/lib/trades.functions";
import { TRADE_STATUS_LABEL, type TradeStatus } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/trades/")({
  head: () => ({
    meta: [
      { title: "My trades — EscrowP2P" },
      { name: "description", content: "Track your escrow-protected P2P crypto trades." },
      { property: "og:title", content: "My trades — EscrowP2P" },
      { property: "og:description", content: "Track your escrow-protected P2P crypto trades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TradesPage,
});

export function statusVariant(status: string) {
  if (status === "released") return "default" as const;
  if (status === "disputed" || status === "cancelled") return "destructive" as const;
  return "secondary" as const;
}

function TradesPage() {
  const fetchTrades = useServerFn(listMyTrades);
  const trades = useQuery({ queryKey: ["trades"], queryFn: () => fetchTrades() });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My trades</h1>
          <p className="text-sm text-muted-foreground">Escrow holds, payment status and settlement</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">Browse offers</Link>
        </Button>
      </div>

      {trades.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading trades…</p>
      ) : (trades.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No trades yet — start one from the marketplace.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(trades.data ?? []).map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {t.amount} {t.crypto_type}
                    </span>
                    <Badge variant={statusVariant(t.status)}>
                      {TRADE_STATUS_LABEL[t.status as TradeStatus] ?? t.status}
                    </Badge>
                    <Badge variant="outline">You are the {t.role}</Badge>
                  </div>
                  <p className="mono text-sm text-muted-foreground">
                    ${(t.amount * t.price).toLocaleString()} total · {t.payment_method ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    With {t.role === "buyer" ? t.seller?.display_name : t.buyer?.display_name} ·{" "}
                    {new Date(t.created_at).toLocaleString()}
                  </p>
                </div>
                <Button asChild className="w-full sm:w-auto">
                  <Link to="/trades/$tradeId" params={{ tradeId: t.id }}>
                    Open trade room
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
