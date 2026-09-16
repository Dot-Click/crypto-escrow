import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Clock,
  RefreshCw,
  Share2,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getPublicListing } from "@/lib/public-marketplace.functions";
import { getMarketPrices, getFxRates } from "@/lib/market.functions";
import { createTrade } from "@/lib/trades.functions";
import { computeReceiveAmount, escrowFeePercentForMethod, resolveListingPrice } from "@/lib/pricing";
import { railKeyForMethod, providerForMethod } from "@/lib/payment-taxonomy";
import { currencySymbol } from "@/lib/currencies";
import { countryFlagEmoji, countryName } from "@/lib/countries";
import { CoinIcon } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { UserAvatar } from "@/components/user-avatar";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/listings/$id")({
  head: () => ({
    meta: [
      { title: "Offer — CEMP" },
      { name: "description", content: "View this CEMP P2P offer and start a trade." },
    ],
  }),
  component: ListingDetailPage,
});

const TERMS_PREVIEW_LENGTH = 160;

function ListingDetailPage() {
  const { id } = Route.useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [fiatAmount, setFiatAmount] = useState("");
  const [payment, setPayment] = useState<string | null>(null);
  const [termsExpanded, setTermsExpanded] = useState(false);

  const fetchListing = useServerFn(getPublicListing);
  const listing = useQuery({
    queryKey: ["public-listing", id],
    queryFn: () => fetchListing({ data: { id } }),
    retry: false,
  });

  const fetchMarketPrices = useServerFn(getMarketPrices);
  const marketPrices = useQuery({ queryKey: ["market-prices"], queryFn: () => fetchMarketPrices(), refetchInterval: 15_000 });
  const fetchFxRates = useServerFn(getFxRates);
  const fxRates = useQuery({ queryKey: ["fx-rates"], queryFn: () => fetchFxRates() });

  const copyLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied");
  };

  const l = listing.data;
  const activeMethod = payment ?? l?.accepted_payment_methods[0] ?? null;
  const price = l ? resolveListingPrice(l, marketPrices.data, fxRates.data) : null;
  const symbol = currencySymbol(l?.fiat_currency ?? "USD");
  const min = l?.min_amount != null ? Number(l.min_amount) : 0;
  const max = l?.max_amount != null ? Number(l.max_amount) : Infinity;
  const parsed = Number(fiatAmount);
  const feePercent = escrowFeePercentForMethod(activeMethod);
  const receive = price && parsed > 0 ? computeReceiveAmount(parsed, price, feePercent) : null;

  const rangeError = fiatAmount && (parsed < min || parsed > max) ? `Amount must be between ${symbol}${min} and ${symbol}${max}` : null;
  const notVerifiedEnough = !!l?.min_trades_required && (profile?.trades_completed ?? 0) < l.min_trades_required;
  const countryBlocked = !!profile?.country && !!l?.blocked_countries?.includes(profile.country);

  const create = useServerFn(createTrade);
  const startTrade = useMutation({
    mutationFn: async () => {
      if (!l || !activeMethod) throw new Error("Choose a payment method");
      return create({ data: { listingId: l.id, fiatAmount: parsed, paymentMethod: activeMethod } });
    },
    onSuccess: (res) => {
      toast.success("Trade opened — crypto is now held in escrow");
      void qc.invalidateQueries({ queryKey: ["trades"] });
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      navigate({ to: "/trades/$tradeId", params: { tradeId: res.tradeId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleStartTrade = () => {
    if (!user) {
      toast.info("Sign in to start a trade");
      void navigate({ to: "/auth" });
      return;
    }
    startTrade.mutate();
  };

  if (listing.isLoading) {
    return <div className="mx-auto w-full max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading offer…</div>;
  }
  if (listing.error || !l) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <p className="text-sm text-destructive">
          {listing.error instanceof Error ? listing.error.message : "This offer is no longer available."}
        </p>
        <Link to="/" className="mt-3 inline-block text-sm text-primary underline-offset-2 hover:underline">
          Back to the marketplace
        </Link>
      </div>
    );
  }

  const seller = l.seller;
  const primaryMethod = l.accepted_payment_methods[0] ?? "";
  const methodLabel = providerForMethod(primaryMethod);
  const isGiftCard = l.accepted_payment_methods.some((m) => railKeyForMethod(m) === "gift_card");
  const flag = countryFlagEmoji(seller.country);
  const blockedCountryNames = (l.blocked_countries ?? []).map((c) => countryName(c) ?? c);
  const validAmount = !!l && !!activeMethod && !!price && parsed > 0 && !rangeError && !notVerifiedEnough && !countryBlocked;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <p className="mb-2 text-xs text-muted-foreground">
        P2P Trading / {l.side === "sell" ? "Buy" : "Sell"} {l.crypto_type.toLowerCase()} / {methodLabel}
      </p>
      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-snug sm:text-3xl">
          <span className="text-primary">{l.side === "sell" ? "Buy" : "Sell"} </span>
          {l.crypto_type} <span className="text-primary">with {methodLabel} </span>
          from <span className="text-primary">{seller.displayName}</span>
        </h1>
        <Button variant="outline" size="icon" onClick={copyLink} aria-label="Share offer" className="shrink-0">
          <Share2 className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link
                  to="/traders/$userId"
                  params={{ userId: seller.id }}
                  className="flex items-center gap-3 hover:opacity-90"
                >
                  <UserAvatar userId={seller.id} displayName={seller.displayName} className="size-12" />
                  <div>
                    <p className="font-medium">{seller.displayName}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className={seller.isOnline ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-muted-foreground/40"} />
                      {seller.isOnline ? "Active now" : "Offline"}
                    </p>
                  </div>
                </Link>
                {seller.tradeSuccessRate30d != null ? (
                  <Badge variant="outline" className="gap-1">
                    {flag ? <span>{flag}</span> : null}
                    {seller.tradeSuccessRate30d >= 50 ? (
                      <TrendingUp className="size-3.5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="size-3.5 text-destructive" />
                    )}
                    {seller.tradeSuccessRate30d}%
                  </Badge>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={seller.isVerified ? "gap-1 border-primary/40 text-primary" : "gap-1 text-muted-foreground"}>
                  <BadgeCheck className="size-3.5" /> {seller.isVerified ? "Verified" : "Unverified"} {flag}
                </Badge>
                <TraderLevelBadge tradesCompleted={seller.tradesCompleted} />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                <span className="flex items-center gap-1" title="Completed trades">
                  <RefreshCw className="size-3.5" /> {seller.tradesCompleted}
                </span>
                <span className="flex items-center gap-1 text-emerald-600" title="Positive feedback">
                  <ThumbsUp className="size-3.5" /> {seller.positiveFeedback}
                </span>
                <span className="flex items-center gap-1 text-destructive" title="Negative feedback">
                  <ThumbsDown className="size-3.5" /> {seller.negativeFeedback}
                </span>
                {l.payment_window_minutes ? (
                  <span className="flex items-center gap-1" title="Payment time limit">
                    <Clock className="size-3.5" /> {l.payment_window_minutes * 60} sec.
                  </span>
                ) : null}
                <span className="flex items-center gap-1" title="Trusted by">
                  <UserPlus className="size-3.5" /> {seller.trustedByCount}
                </span>
                <span className="flex items-center gap-1" title="Blocked by">
                  <UserX className="size-3.5" /> {seller.blockedByCount}
                </span>
                <span className="flex items-center gap-1" title="Has blocked">
                  <Users className="size-3.5" /> {seller.hasBlockedCount}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 py-5">
              {isGiftCard ? (
                <Badge variant="secondary" className="font-normal">
                  No KYC Required
                </Badge>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md bg-background p-3">
                  <p className="text-xs text-muted-foreground">Region</p>
                  <p className="text-sm font-medium">
                    {blockedCountryNames.length === 0 ? "Global" : `Global, excludes ${blockedCountryNames.join(", ")}`}
                  </p>
                </div>
                <div className="rounded-md bg-background p-3">
                  <p className="text-xs text-muted-foreground">Trade limit</p>
                  <p className="text-sm font-medium">
                    {l.payment_window_minutes ? `${l.payment_window_minutes} min` : "No limit"}
                  </p>
                </div>
                <div className="rounded-md bg-background p-3">
                  <p className="text-xs text-muted-foreground">Offer info</p>
                  <p className="mono text-sm font-medium">
                    {l.fixed_price != null
                      ? `Fixed · ${l.fiat_currency}`
                      : `${Number(l.margin_percent) > 0 ? "+" : ""}${Number(l.margin_percent)}% · ${l.fiat_currency}`}
                  </p>
                </div>
                <div className="rounded-md bg-background p-3">
                  <p className="text-xs text-muted-foreground">Amount range</p>
                  <p className="mono text-sm font-medium">
                    {symbol}
                    {min.toLocaleString()} – {symbol}
                    {Number.isFinite(max) ? max.toLocaleString() : "∞"}
                  </p>
                  {price && Number.isFinite(max) ? (
                    <p className="mono text-xs text-muted-foreground">
                      ≈ {(min / price).toFixed(8)} – {(max / price).toFixed(8)} {l.crypto_type}
                    </p>
                  ) : null}
                </div>
              </div>

              {l.terms ? (
                <div className="rounded-md bg-background p-3">
                  <p className="mb-1 text-xs text-muted-foreground">Offer terms</p>
                  <p className="whitespace-pre-line text-sm">
                    {termsExpanded || l.terms.length <= TERMS_PREVIEW_LENGTH
                      ? l.terms
                      : `${l.terms.slice(0, TERMS_PREVIEW_LENGTH)}…`}
                  </p>
                  {l.terms.length > TERMS_PREVIEW_LENGTH ? (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-primary hover:underline"
                      onClick={() => setTermsExpanded((v) => !v)}
                    >
                      {termsExpanded ? "Show less" : "Show more"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-4 py-5">
            {notVerifiedEnough ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                This offer requires at least {l.min_trades_required} completed trades — you have{" "}
                {profile?.trades_completed ?? 0}.
              </p>
            ) : null}
            {countryBlocked ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                This offer isn't available to traders from your country.
              </p>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pay-amount">Pay</Label>
                <span className="text-xs text-muted-foreground">
                  Range: {symbol}
                  {min} – {symbol}
                  {Number.isFinite(max) ? max.toLocaleString() : "∞"}
                </span>
              </div>
              {l.accepted_payment_methods.length > 1 ? (
                <Select value={activeMethod ?? ""} onValueChange={setPayment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    {l.accepted_payment_methods.map((m) => (
                      <SelectItem key={m} value={m}>
                        <span className="flex items-center gap-2">
                          <PaymentRailIcon railKey={railKeyForMethod(m)} className="size-4 text-muted-foreground" />
                          {m}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <PaymentRailIcon railKey={railKeyForMethod(primaryMethod)} className="size-4" />
                  {primaryMethod}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Input
                  id="pay-amount"
                  inputMode="decimal"
                  value={fiatAmount}
                  onChange={(e) => setFiatAmount(e.target.value)}
                  placeholder={String(min || 50)}
                />
                <span className="mono shrink-0 text-sm text-muted-foreground">{l.fiat_currency}</span>
              </div>
              {rangeError ? <p className="text-xs text-destructive">{rangeError}</p> : null}
            </div>

            <div className="space-y-2 rounded-md bg-background p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Receive <span className="font-medium text-foreground">{l.crypto_type}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <CoinIcon code={l.crypto_type} className="size-4" />
                  {price ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"} {l.fiat_currency}
                </span>
              </div>
              <p className="mono text-sm font-medium">
                {receive ? receive.netCrypto.toFixed(8) : "0.00000000"} (1 {l.crypto_type} ={" "}
                {price ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"} {l.fiat_currency})
              </p>
            </div>

            <Button className="w-full" disabled={!validAmount || startTrade.isPending} onClick={handleStartTrade}>
              {startTrade.isPending ? "Starting…" : "Start trade"}
            </Button>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BadgeCheck className="size-3.5" /> Your funds are protected by escrow for a secure trade.
            </p>
          </CardContent>
        </Card>
      </div>

      <Link to="/" className="mt-6 inline-block text-sm text-primary underline-offset-2 hover:underline">
        Back to the marketplace
      </Link>
    </div>
  );
}
