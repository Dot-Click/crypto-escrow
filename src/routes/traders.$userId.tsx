import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Users, ArrowLeftRight, BadgeCheck, Tag } from "lucide-react";
import { getTraderProfile } from "@/lib/trader-profile.functions";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { currencySymbol } from "@/lib/currencies";
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
            {p.isVerified ? (
              <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                <BadgeCheck className="size-3.5" /> Verified
              </Badge>
            ) : null}
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

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Tag className="size-4 text-muted-foreground" />
          Active offers
        </div>
        {p.activeListings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active offers right now.</p>
        ) : (
          <div className="space-y-2">
            {p.activeListings.map((l) => (
              <Link
                key={l.id}
                to="/listings/$id"
                params={{ id: l.id }}
                className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CoinIcon code={l.cryptoType} className="size-4" />
                    {l.side === "sell" ? "Selling" : "Buying"} {l.cryptoType}
                  </span>
                  <p className="mono text-xs text-muted-foreground">
                    {currencySymbol(l.fiatCurrency)}
                    {l.price.toLocaleString()} / {l.cryptoType}
                    {l.minAmount != null && l.maxAmount != null
                      ? ` · ${currencySymbol(l.fiatCurrency)}${l.minAmount.toLocaleString()}–${currencySymbol(l.fiatCurrency)}${l.maxAmount.toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {l.acceptedPaymentMethods.map((m) => (
                    <Badge key={m} variant="secondary" className="gap-1 font-normal">
                      <PaymentRailIcon railKey={railKeyForMethod(m)} className="size-3.5" />
                      {m}
                    </Badge>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
