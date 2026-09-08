import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, Layers, Plus, RefreshCw, Search, SlidersHorizontal, Tag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { UserAvatar } from "@/components/user-avatar";
import { CoinIcon, COIN_FULL_NAME } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { CRYPTO_TYPES, PLATFORM_FEE_PERCENT } from "@/lib/constants";
import { CURRENCIES, currencySymbol } from "@/lib/currencies";
import { COUNTRIES } from "@/lib/countries";
import { OFFER_TAGS, offerTagLabel } from "@/lib/offer-tags";
import { providerForMethod, railKeyForMethod } from "@/lib/payment-taxonomy";
import { PaymentMethodPicker } from "@/components/payment-method-picker";
import { computeReceiveAmount, resolveListingPrice, resolveListingPriceUsd } from "@/lib/pricing";
import { getFxRates, getMarketPrices } from "@/lib/market.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace — CEMP" },
      {
        name: "description",
        content:
          "Browse buy and sell crypto offers, trade with any payment method, and settle safely with platform-held escrow. Testnet demo.",
      },
      { property: "og:title", content: "Marketplace — CEMP" },
      {
        property: "og:description",
        content:
          "Browse buy and sell crypto offers and settle safely with platform-held escrow. Testnet demo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Marketplace,
});

type SortKey = "newest" | "price_asc" | "price_desc";

/** Multi-select tag filter — shared between the mobile compact bar and the
 * desktop sidebar so the checklist only exists once. */
function TagFilterPopover({
  selected,
  onChange,
  className,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
  className?: string;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={`justify-start gap-2 font-normal ${className ?? ""}`}>
          <Tag className="size-4 text-muted-foreground" />
          {selected.length > 0 ? `${selected.length} tag${selected.length === 1 ? "" : "s"} selected` : "Tags"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-1 p-2" align="start">
        {OFFER_TAGS.map((t) => (
          <label
            key={t.value}
            className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
          >
            <Checkbox
              checked={selected.includes(t.value)}
              onCheckedChange={() => toggle(t.value)}
              className="mt-0.5"
            />
            <span>
              {t.label}
              <span className="block text-xs font-normal text-muted-foreground">{t.description}</span>
            </span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Marketplace() {
  const { profile } = useAuth();
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [crypto, setCrypto] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [methodFilters, setMethodFilters] = useState<string[]>([]);
  const [methodPickerOpen, setMethodPickerOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [activeListing, setActive] = useState<ListingRow | null>(null);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  // Desktop-only, matching the reference layout's "Enter Amount" box — the
  // mobile bar deliberately doesn't have this (removed per an earlier,
  // separate request), so it's not part of resetFilters either.
  const [amount, setAmount] = useState("");

  const resetFilters = () => {
    setCrypto("all");
    setCurrency("all");
    setCountryFilter("all");
    setMethodFilters([]);
    setTagFilter([]);
  };

  const fetchPrices = useServerFn(getMarketPrices);
  const marketPrices = useQuery({
    queryKey: ["market-prices"],
    queryFn: () => fetchPrices(),
    refetchInterval: 30_000,
  });

  const fetchFxRates = useServerFn(getFxRates);
  const fxRates = useQuery({
    queryKey: ["fx-rates"],
    queryFn: () => fetchFxRates(),
    refetchInterval: 5 * 60_000,
  });

  const LISTINGS_PAGE_SIZE = 10;
  const listings = useInfiniteQuery({
    queryKey: ["listings", side, crypto, currency, countryFilter, methodFilters, tagFilter],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("listings")
        .select("*, profiles!listings_seller_id_fkey(display_name, trades_completed, country)")
        .eq("status", "active")
        .eq("side", side);
      if (crypto !== "all") query = query.eq("crypto_type", crypto);
      if (currency !== "all") query = query.eq("fiat_currency", currency);
      if (countryFilter !== "all") query = query.not("blocked_countries", "cs", `{${countryFilter}}`);
      if (methodFilters.length > 0) query = query.overlaps("accepted_payment_methods", methodFilters);
      if (tagFilter.length > 0) query = query.overlaps("tags", tagFilter);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + LISTINGS_PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === LISTINGS_PAGE_SIZE ? allPages.length * LISTINGS_PAGE_SIZE : undefined,
  });

  const allListings = useMemo(() => listings.data?.pages.flat() ?? [], [listings.data]);

  const priceOf = (l: ListingRow) => resolveListingPrice(l, marketPrices.data, fxRates.data) ?? Number(l.price);

  const rows = useMemo(() => {
    const prices = marketPrices.data;
    const fx = fxRates.data;
    // Listings can be denominated in different currencies, so filtering/sorting
    // by price compares USD-equivalent values — display still uses each
    // listing's own currency via priceOf.
    const usdPriceOf = (l: ListingRow) => resolveListingPriceUsd(l, prices, fx) ?? Number(l.price);

    let out = allListings;
    if (amount) {
      const wanted = Number(amount);
      out = out.filter((l) => {
        const min = l.min_amount != null ? Number(l.min_amount) : 0;
        const max = l.max_amount != null ? Number(l.max_amount) : Infinity;
        return wanted >= min && wanted <= max;
      });
    }
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
  }, [allListings, marketPrices.data, fxRates.data, amount, search, sort]);

  // Display currency for the hero rate ticker — "Any Fiat" has no single
  // rate to show, so it falls back to USD.
  const heroCurrency = currency === "all" ? "USD" : currency;
  const heroFx = heroCurrency === "USD" ? 1 : fxRates.data?.[heroCurrency];
  const heroCryptoCode = crypto === "all" ? "BTC" : crypto;
  const heroCryptoPrice = marketPrices.data?.[heroCryptoCode];
  const heroMethodText =
    methodFilters.length === 0
      ? "All Payment Methods"
      : methodFilters.length === 1
        ? providerForMethod(methodFilters[0]!)
        : `${methodFilters.length} Payment Methods`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Hero — headline + live reference rate, matching the reference
          design. Reads off the same marketPrices/fxRates queries the
          listing cards already use, just at the currently selected
          crypto/currency (or their defaults). */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {side === "sell" ? "Buy" : "Sell"}{" "}
          <span className="text-primary">{crypto === "all" ? "Crypto" : COIN_FULL_NAME[crypto] ?? crypto}</span>{" "}
          with <span className="text-primary">{heroMethodText}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {heroFx && heroCurrency !== "USD" ? (
            <span className="flex items-center gap-1.5">
              <span className={`fi fi-${CURRENCIES.find((c) => c.code === "USD")?.flagCode ?? "us"}`} aria-hidden />
              1 USD = {heroFx.toLocaleString(undefined, { maximumFractionDigits: 4 })} {heroCurrency}
            </span>
          ) : null}
          {heroCryptoPrice ? (
            <span className="flex items-center gap-1.5">
              <CoinIcon code={heroCryptoCode} className="size-4" />
              1 {heroCryptoCode} = {(heroCryptoPrice * (heroFx ?? 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {heroCurrency}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Escrow-protected offers · testnet only, no real funds
        </p>
      </div>

      {/* Desktop filter bar — one row, matching the reference layout
          exactly (Buy/Sell, crypto, payment method, fiat, amount,
          create-offer, filters, refresh). Country/Tags/Sort share the
          same "Filters" sheet the mobile bar below uses. */}
      <div className="mb-4 hidden items-center gap-2 rounded-lg border border-border bg-card/40 p-2 lg:flex">
        <Button
          type="button"
          onClick={() => setSide("sell")}
          className={
            side === "sell"
              ? "h-10 shrink-0 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              : "h-10 shrink-0 gap-1.5 bg-muted text-foreground hover:bg-muted/80"
          }
        >
          <ArrowDownCircle className="size-4" /> Buy
        </Button>
        <Button
          type="button"
          onClick={() => setSide("buy")}
          className={
            side === "buy"
              ? "h-10 shrink-0 gap-1.5 bg-green-600 text-white hover:bg-green-600/90"
              : "h-10 shrink-0 gap-1.5 bg-muted text-foreground hover:bg-muted/80"
          }
        >
          <ArrowUpCircle className="size-4" /> Sell
        </Button>

        <Select value={crypto} onValueChange={setCrypto}>
          <SelectTrigger className="h-10 w-40 shrink-0">
            <span className="flex items-center gap-2 truncate">
              <Layers className="size-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="All crypto" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All crypto</SelectItem>
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

        <button
          type="button"
          className="flex h-10 w-48 shrink-0 items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm"
          onClick={() => setMethodPickerOpen(true)}
        >
          <span className="flex items-center gap-2 truncate">
            {methodFilters.length > 0 ? (
              <>
                <PaymentRailIcon railKey={railKeyForMethod(methodFilters[0]!)} className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{methodFilters[0]}</span>
                {methodFilters.length > 1 ? (
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    +{methodFilters.length - 1}
                  </Badge>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">Payment method</span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>

        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="h-10 w-32 shrink-0">
            <SelectValue placeholder="Any Fiat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Fiat</SelectItem>
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

        <div className="relative w-44 shrink-0">
          <Input
            className="h-10 pr-16"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter Amount"
          />
          <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            <span
              className={`fi fi-${currency === "all" ? "us" : (CURRENCIES.find((c) => c.code === currency)?.flagCode ?? "us")}`}
              aria-hidden
            />
            {heroCurrency}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button type="button" className="h-10 gap-1.5" asChild>
            <Link to="/listings/new">
              <Plus className="size-4" /> Create an offer
            </Link>
          </Button>
          <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => setMoreFiltersOpen(true)}>
            <SlidersHorizontal className="size-4" /> Filters
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Refresh offers"
            onClick={() => void listings.refetch()}
          >
            <RefreshCw className={`size-4 ${listings.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Compact filter bar — mobile/tablet only, matching the reference
          layout. Country, Tags and Sort live in the "Filters" sheet below
          instead of cluttering the main bar — the desktop bar above keeps
          everything inline since it has the room. */}
      <div className="mb-4 space-y-2 lg:hidden">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={() => setSide("sell")}
            className={
              side === "sell"
                ? "h-11 justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                : "h-11 justify-center gap-2 bg-muted text-foreground hover:bg-muted/80"
            }
          >
            <ArrowDownCircle className="size-4" /> Buy
          </Button>
          <Button
            type="button"
            onClick={() => setSide("buy")}
            className={
              side === "buy"
                ? "h-11 justify-center gap-2 bg-green-600 text-white hover:bg-green-600/90"
                : "h-11 justify-center gap-2 bg-muted text-foreground hover:bg-muted/80"
            }
          >
            <ArrowUpCircle className="size-4" /> Sell
          </Button>
        </div>

        <Select value={crypto} onValueChange={setCrypto}>
          <SelectTrigger className="h-11">
            <span className="flex items-center gap-2 truncate">
              <Layers className="size-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="All crypto" />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All crypto</SelectItem>
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

        <button
          type="button"
          className="flex h-11 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm"
          onClick={() => setMethodPickerOpen(true)}
        >
          <span className="flex items-center gap-2 truncate">
            {methodFilters.length > 0 ? (
              <>
                <PaymentRailIcon railKey={railKeyForMethod(methodFilters[0]!)} className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{methodFilters[0]}</span>
                {methodFilters.length > 1 ? (
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    +{methodFilters.length - 1}
                  </Badge>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">Payment method</span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>

        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Any Fiat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Fiat</SelectItem>
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

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button type="button" className="h-11 gap-1.5" asChild>
            <Link to="/listings/new">
              <Plus className="size-4" /> Create an offer
            </Link>
          </Button>
          <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => setMoreFiltersOpen(true)}>
            <SlidersHorizontal className="size-4" /> Filters
          </Button>
        </div>
      </div>

      <Sheet open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>More filters</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Your country</Label>
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
            <div className="space-y-2">
              <Label>Tags</Label>
              <TagFilterPopover selected={tagFilter} onChange={setTagFilter} className="w-full" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile-search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="mobile-search"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="BTC, bank transfer…"
                />
              </div>
            </div>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={resetFilters}>
              <X className="size-4" /> Clear all filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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
                l as unknown as {
                  profiles: { display_name: string; trades_completed: number; country: string | null } | null;
                }
              ).profiles;
              const price = priceOf(l);
              const symbol = currencySymbol(l.fiat_currency);
              const margin = Number(l.margin_percent);
              const previewFiat = l.min_amount != null ? Number(l.min_amount) : 10;
              const preview = computeReceiveAmount(previewFiat, price, PLATFORM_FEE_PERCENT);
              return (
                <Card key={l.id}>
                  <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <UserAvatar
                          userId={l.seller_id}
                          displayName={counterparty?.display_name ?? "Trader"}
                          className="size-8 shrink-0"
                        />
                        <span className="flex items-center gap-1.5 text-base font-semibold">
                          <CoinIcon code={l.crypto_type} className="size-5" />
                          {COIN_FULL_NAME[l.crypto_type] ?? l.crypto_type}
                        </span>
                        {counterparty?.country ? (
                          <span className={`fi fi-${counterparty.country.toLowerCase()}`} aria-hidden />
                        ) : null}
                        <Link
                          to="/traders/$userId"
                          params={{ userId: l.seller_id }}
                          className="transition-opacity hover:opacity-80"
                        >
                          <Badge variant="outline">{counterparty?.display_name ?? "Trader"}</Badge>
                        </Link>
                        <TraderLevelBadge tradesCompleted={counterparty?.trades_completed ?? 0} />
                        {(l.blocked_countries ?? []).length > 0 ? (
                          <Badge
                            variant="outline"
                            className="font-normal text-muted-foreground"
                            title={`Blocked: ${l.blocked_countries.map((code) => COUNTRIES.find((c) => c.code === code)?.name ?? code).join(", ")}`}
                          >
                            {l.blocked_countries.length} {l.blocked_countries.length === 1 ? "country" : "countries"} blocked
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mono flex items-center gap-2 text-sm text-muted-foreground">
                        {symbol}
                        {price.toLocaleString()} per {l.crypto_type}
                        {l.fixed_price != null ? (
                          <span className="text-muted-foreground">(fixed)</span>
                        ) : margin !== 0 ? (
                          <Badge
                            className={
                              margin < 0
                                ? "bg-green-600/15 font-normal text-green-600 hover:bg-green-600/15"
                                : "bg-destructive/15 font-normal text-destructive hover:bg-destructive/15"
                            }
                          >
                            {margin > 0 ? "+" : ""}
                            {margin}%
                          </Badge>
                        ) : null}
                      </p>
                      {l.min_amount != null && l.max_amount != null ? (
                        <p className="text-xs text-muted-foreground">
                          Range: {symbol}
                          {Number(l.min_amount).toLocaleString()} – {symbol}
                          {Number(l.max_amount).toLocaleString()}
                        </p>
                      ) : null}
                      {price ? (
                        <p className="text-xs text-muted-foreground">
                          Pay {symbol}
                          {previewFiat.toLocaleString()} · Receive {preview.netCrypto.toFixed(8)} {l.crypto_type}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5">
                        {l.accepted_payment_methods.map((m) => (
                          <Badge key={m} variant="secondary" className="gap-1 font-normal">
                            <PaymentRailIcon railKey={railKeyForMethod(m)} className="size-3" />
                            {m}
                          </Badge>
                        ))}
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
                      {l.side === "sell" ? "Buy" : "Sell"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
          {listings.hasNextPage ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={listings.isFetchingNextPage}
              onClick={() => listings.fetchNextPage()}
            >
              {listings.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>

      <PaymentMethodPicker
        open={methodPickerOpen}
        onOpenChange={setMethodPickerOpen}
        selected={methodFilters}
        onChange={setMethodFilters}
        multiple
      />

      <StartTradeDialog
        listing={activeListing}
        marketPrices={marketPrices.data}
        marketPricesError={marketPrices.error as Error | null}
        fxRates={fxRates.data}
        myTradesCompleted={profile?.trades_completed ?? 0}
        myCountry={profile?.country ?? null}
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
  blocked_countries: string[];
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
  myCountry,
  onClose,
}: {
  listing: ListingRow | null;
  marketPrices: Record<string, number> | undefined;
  marketPricesError?: Error | null;
  fxRates: Record<string, number> | undefined;
  myTradesCompleted: number;
  myCountry: string | null;
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
  const countryBlocked = !!myCountry && !!listing?.blocked_countries?.includes(myCountry);
  const valid =
    !!listing && !!payment && !!price && parsed > 0 && !rangeError && !notVerifiedEnough && !countryBlocked;

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
          {countryBlocked ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              This offer is not available to traders from your country.
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
