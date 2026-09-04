import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createTrade } from "@/lib/trades.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import {
  Search,
  ShieldCheck,
  MessagesSquare,
  Users,
  ArrowRight,
  ArrowUpRight,
  Lock,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { CoinIcon, COIN_FULL_NAME } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { CRYPTO_TYPES, PLATFORM_FEE_PERCENT } from "@/lib/constants";
import { CURRENCIES, currencySymbol } from "@/lib/currencies";
import { COUNTRIES } from "@/lib/countries";
import { offerTagLabel } from "@/lib/offer-tags";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { PaymentMethodPicker } from "@/components/payment-method-picker";
import { computeReceiveAmount, resolveListingPrice, resolveListingPriceUsd } from "@/lib/pricing";
import { getFxRates, getMarketPrices } from "@/lib/market.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FOMN — Peer-to-peer crypto trading with escrow" },
      {
        name: "description",
        content:
          "Browse buy and sell crypto offers, trade with any payment method, and settle safely with platform-held escrow. Testnet demo.",
      },
      { property: "og:title", content: "FOMN — Peer-to-peer crypto trading with escrow" },
      {
        property: "og:description",
        content:
          "Browse buy and sell crypto offers and settle safely with platform-held escrow. Testnet demo.",
      },
    ],
  }),
  component: Marketplace,
});

type SortKey = "newest" | "price_asc" | "price_desc";

function Marketplace() {
  const { user, profile } = useAuth();
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [crypto, setCrypto] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState<string | null>(null);
  const [methodPickerOpen, setMethodPickerOpen] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [activeListing, setActive] = useState<ListingRow | null>(null);

  const fetchPrices = useServerFn(getMarketPrices);
  const marketPrices = useQuery({
    queryKey: ["market-prices"],
    enabled: !!user,
    queryFn: () => fetchPrices(),
    refetchInterval: 30_000,
  });

  const fetchFxRates = useServerFn(getFxRates);
  const fxRates = useQuery({
    queryKey: ["fx-rates"],
    enabled: !!user,
    queryFn: () => fetchFxRates(),
    refetchInterval: 5 * 60_000,
  });

  const listings = useQuery({
    queryKey: ["listings"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*, profiles!listings_seller_id_fkey(display_name, trades_completed)")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const priceOf = (l: ListingRow) => resolveListingPrice(l, marketPrices.data, fxRates.data) ?? Number(l.price);

  const rows = useMemo(() => {
    const prices = marketPrices.data;
    const fx = fxRates.data;
    // Listings can be denominated in different currencies, so filtering/sorting
    // by price compares USD-equivalent values — display still uses each
    // listing's own currency via priceOf.
    const usdPriceOf = (l: ListingRow) => resolveListingPriceUsd(l, prices, fx) ?? Number(l.price);

    let out = (listings.data ?? []).filter((l) => l.side === side);
    if (crypto !== "all") out = out.filter((l) => l.crypto_type === crypto);
    if (currency !== "all") out = out.filter((l) => l.fiat_currency === currency);
    if (countryFilter !== "all") {
      out = out.filter((l) => l.country === countryFilter || l.country == null);
    }
    if (methodFilter) {
      out = out.filter((l) => l.accepted_payment_methods.includes(methodFilter));
    }
    if (minPrice) out = out.filter((l) => usdPriceOf(l) >= Number(minPrice));
    if (maxPrice) out = out.filter((l) => usdPriceOf(l) <= Number(maxPrice));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (l) =>
          l.crypto_type.toLowerCase().includes(q) ||
          l.accepted_payment_methods.join(" ").toLowerCase().includes(q) ||
          (l.terms ?? "").toLowerCase().includes(q),
      );
    }
    if (sort === "price_asc") out = [...out].sort((a, b) => usdPriceOf(a) - usdPriceOf(b));
    if (sort === "price_desc") out = [...out].sort((a, b) => usdPriceOf(b) - usdPriceOf(a));
    return out;
  }, [
    listings.data,
    marketPrices.data,
    fxRates.data,
    side,
    crypto,
    currency,
    countryFilter,
    methodFilter,
    minPrice,
    maxPrice,
    search,
    sort,
  ]);

  if (!user) return <LandingHero />;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Marketplace</h1>
          <p className="text-sm text-muted-foreground">
            Escrow-protected offers · testnet only, no real funds
          </p>
        </div>
        <Button asChild>
          <Link to="/listings/new">Create offer</Link>
        </Button>
      </div>

      <div className="mb-4 inline-flex rounded-md border border-border p-1">
        <Button
          variant={side === "sell" ? "default" : "ghost"}
          size="sm"
          onClick={() => setSide("sell")}
        >
          Buy crypto
        </Button>
        <Button
          variant={side === "buy" ? "default" : "ghost"}
          size="sm"
          onClick={() => setSide("buy")}
        >
          Sell crypto
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="q">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="q"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="BTC, bank transfer…"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Crypto type</Label>
              <Select value={crypto} onValueChange={setCrypto}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All coins</SelectItem>
                  {CRYPTO_TYPES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <CoinIcon code={c.code} className="size-4" />
                        {c.code}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any currency</SelectItem>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <span className={`fi fi-${c.flagCode}`} aria-hidden />
                        {c.code}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any country</SelectItem>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <span className={`fi fi-${c.code.toLowerCase()}`} aria-hidden />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2 font-normal"
                  onClick={() => setMethodPickerOpen(true)}
                >
                  {methodFilter ? (
                    <PaymentRailIcon railKey={railKeyForMethod(methodFilter)} className="size-4 text-muted-foreground" />
                  ) : null}
                  <span className="truncate">{methodFilter ?? "Any method"}</span>
                </Button>
                {methodFilter ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Clear payment method filter"
                    onClick={() => setMethodFilter(null)}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="min">Min price (USD equiv.)</Label>
                <Input
                  id="min"
                  inputMode="decimal"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max">Max price (USD equiv.)</Label>
                <Input
                  id="max"
                  inputMode="decimal"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sort by</Label>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price_asc">Price: low to high</SelectItem>
                  <SelectItem value="price_desc">Price: high to low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {listings.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading offers…</p>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No offers match your filters yet.
              </CardContent>
            </Card>
          ) : (
            rows.map((l) => {
              const counterparty = (
                l as unknown as { profiles: { display_name: string; trades_completed: number } | null }
              ).profiles;
              const price = priceOf(l);
              const symbol = currencySymbol(l.fiat_currency);
              const margin = Number(l.margin_percent);
              return (
                <Card key={l.id}>
                  <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-base font-semibold">
                          <CoinIcon code={l.crypto_type} className="size-5" />
                          {COIN_FULL_NAME[l.crypto_type] ?? l.crypto_type}
                        </span>
                        <Link
                          to="/traders/$userId"
                          params={{ userId: l.seller_id }}
                          className="transition-opacity hover:opacity-80"
                        >
                          <Badge variant="outline">{counterparty?.display_name ?? "Trader"}</Badge>
                        </Link>
                        <TraderLevelBadge tradesCompleted={counterparty?.trades_completed ?? 0} />
                        <span className="text-xs text-muted-foreground">
                          {counterparty?.trades_completed ?? 0} trades
                        </span>
                        {l.country ? (
                          <Badge variant="outline" className="gap-1.5 font-normal">
                            <span className={`fi fi-${l.country.toLowerCase()}`} aria-hidden />
                            {COUNTRIES.find((c) => c.code === l.country)?.name ?? l.country}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            🌐 Global
                          </Badge>
                        )}
                      </div>
                      <p className="mono text-sm text-muted-foreground">
                        {symbol}
                        {price.toLocaleString()} per {l.crypto_type}
                        {l.fixed_price != null ? (
                          <span className="text-muted-foreground"> (fixed)</span>
                        ) : margin !== 0 ? (
                          <span className={margin < 0 ? "text-green-600" : "text-muted-foreground"}>
                            {" "}
                            ({margin > 0 ? "+" : ""}
                            {margin}%)
                          </span>
                        ) : null}
                      </p>
                      {l.min_amount != null && l.max_amount != null ? (
                        <p className="text-xs text-muted-foreground">
                          Range: {symbol}
                          {Number(l.min_amount).toLocaleString()} – {symbol}
                          {Number(l.max_amount).toLocaleString()}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5">
                        {l.accepted_payment_methods.map((m) => (
                          <Badge key={m} variant="secondary" className="gap-1 font-normal">
                            <PaymentRailIcon railKey={railKeyForMethod(m)} className="size-3" />
                            {m}
                          </Badge>
                        ))}
                        {l.min_trades_required ? (
                          <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                            <ShieldCheck className="size-3" />
                            {l.min_trades_required}+ trades required
                          </Badge>
                        ) : null}
                        {(l.tags ?? []).map((t) => (
                          <Badge key={t} variant="outline" className="font-normal text-muted-foreground">
                            {offerTagLabel(t)}
                          </Badge>
                        ))}
                      </div>
                      {l.terms ? (
                        <p className="max-w-prose text-xs text-muted-foreground">{l.terms}</p>
                      ) : null}
                    </div>
                    <Button className="w-full sm:w-auto" onClick={() => setActive(l)}>
                      Start trade
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <PaymentMethodPicker
        open={methodPickerOpen}
        onOpenChange={setMethodPickerOpen}
        selected={methodFilter ? [methodFilter] : []}
        onChange={(methods) => setMethodFilter(methods[0] ?? null)}
        multiple={false}
      />

      <StartTradeDialog
        listing={activeListing}
        marketPrices={marketPrices.data}
        marketPricesError={marketPrices.error as Error | null}
        fxRates={fxRates.data}
        myTradesCompleted={profile?.trades_completed ?? 0}
        onClose={() => setActive(null)}
      />
    </div>
  );
}

type ListingRow = {
  id: string;
  seller_id: string;
  side: string;
  crypto_type: string;
  price: number | string;
  margin_percent: number | string;
  fixed_price: number | string | null;
  min_amount: number | string | null;
  max_amount: number | string | null;
  payment_window_minutes: number | string | null;
  fiat_currency: string;
  country: string | null;
  min_trades_required: number | null;
  tags: string[];
  accepted_payment_methods: string[];
};

function StartTradeDialog({
  listing,
  marketPrices,
  marketPricesError,
  fxRates,
  myTradesCompleted,
  onClose,
}: {
  listing: ListingRow | null;
  marketPrices: Record<string, number> | undefined;
  marketPricesError?: Error | null;
  fxRates: Record<string, number> | undefined;
  myTradesCompleted: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createTrade);
  const [fiatAmount, setFiatAmount] = useState("");
  const [payment, setPayment] = useState("");

  const price = listing ? resolveListingPrice(listing, marketPrices, fxRates) : null;
  const symbol = currencySymbol(listing?.fiat_currency ?? "USD");
  const min = listing?.min_amount != null ? Number(listing.min_amount) : 0;
  // No listing-level inventory cap — the fiat range is the only declared
  // ceiling. Whether the seller can actually cover a trade this size is
  // checked live against their wallet balance when the trade is opened.
  const max = listing?.max_amount != null ? Number(listing.max_amount) : Infinity;

  const parsed = Number(fiatAmount);
  const rangeError =
    fiatAmount && (parsed < min || parsed > max) ? `Value must be between ${min} and ${max}` : null;
  const notVerifiedEnough =
    !!listing?.min_trades_required && myTradesCompleted < listing.min_trades_required;
  const valid = !!listing && !!payment && !!price && parsed > 0 && !rangeError && !notVerifiedEnough;

  const receive = price ? computeReceiveAmount(parsed, price, PLATFORM_FEE_PERCENT) : null;

  const start = useMutation({
    mutationFn: async () => {
      if (!listing) throw new Error("No offer selected");
      return create({
        data: { listingId: listing.id, fiatAmount: parsed, paymentMethod: payment },
      });
    },
    onSuccess: (res) => {
      toast.success("Trade opened — crypto is now held in escrow");
      void qc.invalidateQueries({ queryKey: ["trades"] });
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      onClose();
      setFiatAmount("");
      setPayment("");
      navigate({ to: "/trades/$tradeId", params: { tradeId: res.tradeId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={!!listing}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setFiatAmount("");
          setPayment("");
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {listing ? <CoinIcon code={listing.crypto_type} className="size-5" /> : null}
            Start trade · {listing?.crypto_type}
          </DialogTitle>
          <DialogDescription>
            {listing?.side === "sell"
              ? "You buy crypto. Escrow holds the seller's balance until you pay and they release."
              : "You sell crypto. Escrow holds your wallet balance until the buyer pays."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {notVerifiedEnough ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              This offer requires at least {listing?.min_trades_required} completed trades — you have{" "}
              {myTradesCompleted}.
            </p>
          ) : null}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="trade-amount">
                Pay ({listing?.fiat_currency ?? "USD"}) · range {symbol}
                {min} – {symbol}
                {max.toLocaleString()}
              </Label>
              {Number.isFinite(max) ? (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setFiatAmount(String(max))}
                >
                  MAX
                </button>
              ) : null}
            </div>
            <Input
              id="trade-amount"
              inputMode="decimal"
              value={fiatAmount}
              onChange={(e) => setFiatAmount(e.target.value)}
              placeholder={String(min || 50)}
            />
            {rangeError ? <p className="text-xs text-destructive">{rangeError}</p> : null}
          </div>

          {price ? (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Receive</span>
                <span className="mono font-medium">
                  {receive ? receive.netCrypto.toFixed(8) : "0"} {listing?.crypto_type}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Rate {symbol}
                {price.toFixed(2)} per {listing?.crypto_type} · {PLATFORM_FEE_PERCENT}% fee included
              </p>
              {listing?.payment_window_minutes ? (
                <p className="text-xs text-muted-foreground">
                  You'll have {listing.payment_window_minutes} minutes to pay once escrow opens.
                </p>
              ) : null}
            </div>
          ) : marketPricesError ? (
            <p className="text-xs text-destructive">
              Couldn't load the live market price: {marketPricesError.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Loading live market price…</p>
          )}

          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a method" />
              </SelectTrigger>
              <SelectContent>
                {(listing?.accepted_payment_methods ?? []).map((m) => (
                  <SelectItem key={m} value={m}>
                    <span className="flex items-center gap-2">
                      <PaymentRailIcon railKey={railKeyForMethod(m)} className="size-4 text-muted-foreground" />
                      {m}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            className="w-full"
            disabled={!valid || start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? "Opening escrow…" : "Open trade room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const HERO_NAV = [
  { index: "01", label: "Marketplace", to: "/" as const },
  { index: "02", label: "How it Works", to: "/#how-it-works" as const },
  { index: "03", label: "Create Offer", to: "/auth" as const },
  { index: "04", label: "Wallet", to: "/auth" as const },
];

const FEATURE_CARDS = [
  {
    icon: ShieldCheck,
    title: "Secure Escrow",
    body: "Crypto locks in the seller's balance the moment a trade opens — released only when both sides confirm.",
  },
  {
    icon: MessagesSquare,
    title: "Real-Time Trade Chat",
    body: "Coordinate payment directly with your trade partner in a private, escrow-linked room.",
  },
  {
    icon: Users,
    title: "Trusted by the Community",
    body: "Transparent trade history, trader stats and dispute protection on every offer.",
  },
];

// A cluster of 3 tall glass-like isometric bars — top face + one glowing
// vertical edge, near-transparent body. Drawn once, mirrored via CSS for
// the right-hand cluster so the "camera angle" stays physically consistent.
// Heights are 65% / 100% / 40% of the cluster's max height — kept distinct
// on purpose so the "bar chart" silhouette reads clearly.
// Bar widths ~1.6x the previous pass, gap widened to match so the cluster
// doesn't feel cramped. Heights (and their 65/100/40% ratios) are untouched.
const ISO_BARS = [
  { x: 2, w: 46, h: 143 }, // 65%
  { x: 58, w: 53, h: 220 }, // 100% — tallest, reaches toward the hero's midpoint
  { x: 121, w: 42, h: 88 }, // 40%
];
const ISO_VIEW_W = 190;
const ISO_VIEW_H = 420;
const ISO_DEPTH = 12;
const ISO_SKEW = 9;

function IsometricBarCluster({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${ISO_VIEW_W} ${ISO_VIEW_H}`}
      preserveAspectRatio="xMidYMax meet"
      className="h-full w-full"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden
    >
      <defs>
        <filter id="isoBarGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {ISO_BARS.map((b, i) => {
        const yBase = ISO_VIEW_H;
        const yTop = ISO_VIEW_H - b.h;
        const xL = b.x;
        const xR = b.x + b.w;
        const front = `${xL},${yBase} ${xR},${yBase} ${xR},${yTop} ${xL},${yTop}`;
        const top = `${xL},${yTop} ${xR},${yTop} ${xR + ISO_DEPTH},${yTop - ISO_SKEW} ${xL + ISO_DEPTH},${yTop - ISO_SKEW}`;
        const side = `${xR},${yTop} ${xR + ISO_DEPTH},${yTop - ISO_SKEW} ${xR + ISO_DEPTH},${yBase - ISO_SKEW} ${xR},${yBase}`;
        const topRim = `${xL},${yTop} ${xR},${yTop} ${xR + ISO_DEPTH},${yTop - ISO_SKEW}`;
        return (
          <g key={i}>
            {/* shaded side face — a shade lighter than pure background, still reads as depth */}
            <polygon points={side} fill="var(--primary)" fillOpacity="0.1" />
            {/* glass body — brighter primary tint so the 3D form itself is visible */}
            <polygon points={front} fill="var(--primary)" fillOpacity="0.16" />
            {/* glowing top face */}
            <polygon points={top} fill="var(--primary)" fillOpacity="0.38" />

            {/* neon edge-light: soft halo pass (low intensity) */}
            <polyline
              points={topRim}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeOpacity="0.35"
              filter="url(#isoBarGlow)"
            />
            <line
              x1={xR}
              y1={yTop}
              x2={xR}
              y2={yBase}
              stroke="var(--primary)"
              strokeWidth="1.8"
              strokeOpacity="0.3"
              filter="url(#isoBarGlow)"
            />
            {/* crisp core on top of the halo — reads as a lit edge without overpowering */}
            <polyline points={topRim} fill="none" stroke="var(--primary)" strokeWidth="1.1" strokeOpacity="0.7" />
            <line
              x1={xR}
              y1={yTop}
              x2={xR}
              y2={yBase}
              stroke="var(--primary)"
              strokeWidth="1"
              strokeOpacity="0.65"
            />
          </g>
        );
      })}
    </svg>
  );
}

function LandingHero() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden overflow-x-clip">
      {/* ---------- Hero ---------- */}
      <section className="relative flex flex-1 flex-col overflow-hidden bg-background">
        {/* soft top-center glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, var(--primary) 0%, transparent 70%)",
            opacity: 0.16,
          }}
        />

        {/* side decorative glass pillar clusters — purely decorative, sit behind all content.
            Flush against the screen corners (no horizontal inset). Only shown from xl+ (1280px) —
            below that, the coin badges (which only get pushed further out at the xl breakpoint)
            sit too close to the edge for the wider bars to clear them, so hiding is the correct
            responsive behavior at narrower widths rather than overlapping. */}
        <div className="pointer-events-none absolute bottom-0 left-0 hidden h-full w-60 xl:block">
          <IsometricBarCluster />
        </div>
        <div className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-60 xl:block">
          <IsometricBarCluster flip />
        </div>

        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-4">
          {/* bracket-indexed nav — sits in the hero, below the transparent site header */}
          <nav className="hidden shrink-0 items-center justify-center gap-8 pb-2 pt-16 md:flex">
            {HERO_NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="mono text-xs text-primary">[{item.index}]</span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="relative mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center pt-14 text-center md:pt-0">
            {/* floating crypto badges — pushed far out from the headline */}
            <div className="pointer-events-none absolute left-2 top-1/4 hidden flex-col gap-6 md:flex lg:-left-16 xl:-left-36">
              {CRYPTO_TYPES.slice(0, 2).map((c) => (
                <div key={c.code} className="flex flex-col items-center gap-1.5">
                  <span className="flex size-16 items-center justify-center rounded-full border border-border bg-card/70 backdrop-blur lg:size-20">
                    <CoinIcon code={c.code} className="size-9 lg:size-11" />
                  </span>
                  <span className="text-xs text-muted-foreground/40">{COIN_FULL_NAME[c.code] ?? c.code}</span>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute right-2 top-1/3 hidden flex-col gap-6 md:flex lg:-right-16 xl:-right-36">
              {CRYPTO_TYPES.slice(2, 4).map((c) => (
                <div key={c.code} className="flex flex-col items-center gap-1.5">
                  <span className="flex size-16 items-center justify-center rounded-full border border-border bg-card/70 backdrop-blur lg:size-20">
                    <CoinIcon code={c.code} className="size-9 lg:size-11" />
                  </span>
                  <span className="text-xs text-muted-foreground/40">{COIN_FULL_NAME[c.code] ?? c.code}</span>
                </div>
              ))}
            </div>

            <Badge variant="outline" className="mb-3">
              Testnet demo · no real funds
            </Badge>

            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Trade crypto peer-to-peer,
              <br />
              held safely in{" "}
              <Lock className="inline-block size-7 -translate-y-1 text-primary sm:size-10" />{" "}
              escrow
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Buy and sell crypto with any payment method — funds stay locked until both sides
              confirm the trade.
            </p>

            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full px-7" asChild>
                <Link to="/auth">
                  Start Trading <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-4 flex items-center justify-center gap-3">
              <div className="flex -space-x-2">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="size-7 rounded-full border-2 border-background bg-muted"
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Trusted by early traders</span>
            </div>
          </div>

          {/* feature cards — always 3-across so stacking never pushes the page past one screen */}
          <div
            id="how-it-works"
            className="mx-auto grid w-full max-w-2xl shrink-0 grid-cols-3 gap-2 pb-2 sm:gap-3"
          >
            {FEATURE_CARDS.map((f, i) => {
              const elevated = i === 1;
              return (
                <Card
                  key={f.title}
                  className={
                    "relative overflow-hidden bg-card/20 backdrop-blur-sm " +
                    (elevated ? "border-primary/40 shadow-glow sm:-translate-y-2" : "border-border")
                  }
                >
                  {/* glossy top sheen */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-foreground/10 to-transparent"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent"
                  />
                  <CardContent className="relative space-y-1 p-2 sm:space-y-1.5 sm:p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-8 sm:rounded-xl">
                        <f.icon className="size-3 sm:size-3.5" />
                      </span>
                      <span className="hidden size-6 items-center justify-center rounded-full border border-border text-muted-foreground sm:flex">
                        <ArrowUpRight className="size-3" />
                      </span>
                    </div>
                    <CardTitle className="text-xs">{f.title}</CardTitle>
                    <CardDescription className="hidden text-xs leading-snug sm:block">
                      {f.body}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
