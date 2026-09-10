import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Users, ArrowLeftRight } from "lucide-react";
import { getTraderProfile } from "@/lib/trader-profile.functions";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { UserAvatar } from "@/components/user-avatar";
import { CoinIcon } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/traders/$userId")({
  head: () => ({
    meta: [{ title: "Trader profile — CEMP" }],
  }),
  component: TraderProfilePage,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function TraderProfilePage() {
  const { userId } = Route.useParams();
  const fetchProfile = useServerFn(getTraderProfile);
  const profile = useQuery({
    queryKey: ["trader-profile", userId],
    queryFn: () => fetchProfile({ data: { userId } }),
    retry: false,
  });

  if (profile.isLoading) {
    return <div className="mx-auto w-full max-w-[1400px] px-4 py-10 text-sm text-muted-foreground">Loading trader profile…</div>;
  }
  if (profile.error || !profile.data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 text-sm text-destructive">
        Couldn't find that trader.
      </div>
    );
  }

  const p = profile.data;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-10">
      <div className="mb-8 flex items-center gap-4">
        <UserAvatar userId={p.id} displayName={p.displayName} className="size-14 shrink-0 text-lg" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{p.displayName}</h1>
            <TraderLevelBadge tradesCompleted={p.tradesCompleted} />
          </div>
          <p className="text-sm text-muted-foreground">Trading since {formatDate(p.memberSince)}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        <div className="bg-card p-4">
          <div className="mono text-2xl font-semibold tabular-nums">{p.tradesCompleted}</div>
          <div className="mt-1 text-xs text-muted-foreground">Completed trades</div>
        </div>
        <div className="bg-card p-4">
          <div className="mono flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
            <Users className="size-4 text-muted-foreground" />
            {p.uniquePartners}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Unique trading partners</div>
        </div>
        <div className="col-span-2 bg-card p-4 sm:col-span-1">
          <div className="mono flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
            {p.volumeByCrypto.length === 0 ? (
              <span className="text-2xl">—</span>
            ) : (
              p.volumeByCrypto.map((v) => (
                <span key={v.cryptoType} className="inline-flex items-center gap-1 tabular-nums">
                  <CoinIcon code={v.cryptoType} className="size-4" />
                  {v.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {v.cryptoType}
                </span>
              ))
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Total volume traded</div>
        </div>
      </div>

      {p.methodBreakdown.length > 0 ? (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ArrowLeftRight className="size-4 text-muted-foreground" />
              Trades by payment method
            </div>
            <div className="flex flex-wrap gap-2">
              {p.methodBreakdown.map((m) => (
                <Badge key={m.method} variant="secondary" className="gap-1 font-normal">
                  <PaymentRailIcon railKey={railKeyForMethod(m.method)} className="size-3.5" />
                  {m.method} · {m.trades}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No completed trades yet.</p>
      )}
    </div>
  );
}
