import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Copy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getPublicListing } from "@/lib/public-marketplace.functions";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { currencySymbol } from "@/lib/currencies";
import { CoinIcon } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { UserAvatar } from "@/components/user-avatar";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/listings/$id")({
  head: () => ({
    meta: [
      { title: "Offer — CEMP" },
      { name: "description", content: "View this CEMP P2P offer and start a trade." },
    ],
  }),
  component: ListingDetailPage,
});

function ListingDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fetchListing = useServerFn(getPublicListing);
  const listing = useQuery({
    queryKey: ["public-listing", id],
    queryFn: () => fetchListing({ data: { id } }),
    retry: false,
  });

  const copyLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied");
  };

  const startTrade = () => {
    if (!user) {
      toast.info("Sign in to start a trade");
      void navigate({ to: "/auth" });
      return;
    }
    void navigate({ to: "/", search: { listing: id } });
  };

  if (listing.isLoading) {
    return <div className="mx-auto w-full max-w-2xl px-4 py-10 text-sm text-muted-foreground">Loading offer…</div>;
  }
  if (listing.error || !listing.data) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <p className="text-sm text-destructive">
          {listing.error instanceof Error ? listing.error.message : "This offer is no longer available."}
        </p>
        <Link to="/" className="mt-3 inline-block text-sm text-primary underline-offset-2 hover:underline">
          Back to the marketplace
        </Link>
      </div>
    );
  }

  const l = listing.data;
  const seller = l.profiles;
  const symbol = currencySymbol(l.fiat_currency);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CoinIcon code={l.crypto_type} className="size-6" />
            {l.side === "sell" ? "Selling" : "Buying"} {l.crypto_type}
          </h1>
          <p className="mono text-sm text-muted-foreground">
            {symbol}
            {Number(l.price).toLocaleString()} / {l.crypto_type}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5">
          <Copy className="size-4" /> Copy link
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-4 py-5">
          {seller ? (
            <Link
              to="/traders/$userId"
              params={{ userId: l.seller_id }}
              className="flex items-center gap-3 hover:opacity-90"
            >
              <UserAvatar userId={l.seller_id} displayName={seller.display_name} className="size-10" />
              <div>
                <div className="flex items-center gap-1.5 font-medium">
                  {seller.display_name}
                  {seller.is_verified ? <BadgeCheck className="size-4 text-primary" /> : null}
                  <TraderLevelBadge tradesCompleted={seller.trades_completed} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {seller.trades_completed} completed trades{seller.country ? ` · ${seller.country}` : ""}
                </p>
              </div>
            </Link>
          ) : null}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {l.min_amount != null && l.max_amount != null ? (
              <div>
                <p className="text-xs text-muted-foreground">Trade limits</p>
                <p className="mono">
                  {symbol}
                  {Number(l.min_amount).toLocaleString()}–{symbol}
                  {Number(l.max_amount).toLocaleString()}
                </p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-muted-foreground">Currency</p>
              <p>{l.fiat_currency}</p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Accepted payment methods</p>
            <div className="flex flex-wrap gap-2">
              {(l.accepted_payment_methods ?? []).map((m: string) => (
                <Badge key={m} variant="secondary" className="gap-1.5 font-normal">
                  <PaymentRailIcon railKey={railKeyForMethod(m)} className="size-3.5" />
                  {m}
                </Badge>
              ))}
            </div>
          </div>

          {l.terms ? (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Trade terms</p>
              <p className="whitespace-pre-wrap text-sm">{l.terms}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Button className="w-full" onClick={startTrade}>
        {l.side === "sell" ? "Buy" : "Sell"} {l.crypto_type}
      </Button>
    </div>
  );
}
