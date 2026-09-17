import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Layers, Link2, MoreVertical, Pencil, Plus, Search, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CRYPTO_TYPES, MIN_PAYMENT_WINDOW_MINUTES } from "@/lib/constants";
import { CoinIcon } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { PaymentMethodPicker } from "@/components/payment-method-picker";
import { CountryBlockPicker } from "@/components/country-block-picker";
import { COUNTRIES } from "@/lib/countries";
import { OFFER_TAG_PAIRS, offerTagLabel } from "@/lib/offer-tags";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { currencySymbol } from "@/lib/currencies";
import { computeEffectivePrice } from "@/lib/pricing";
import { getFxRates, getMarketPrices } from "@/lib/market.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/offers")({
  head: () => ({
    meta: [
      { title: "My offers — CEMP" },
      { name: "description", content: "Manage, pause, or edit your published CEMP offers." },
    ],
  }),
  component: OffersPage,
});

type Listing = {
  id: string;
  side: string;
  crypto_type: string;
  fiat_currency: string;
  price: number;
  margin_percent: number;
  fixed_price: number | null;
  min_amount: number | null;
  max_amount: number | null;
  payment_window_minutes: number | null;
  min_trades_required: number | null;
  blocked_countries: string[];
  accepted_payment_methods: string[];
  terms: string | null;
  welcome_message: string | null;
  tags: string[];
  status: string;
};

function OffersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Listing | null>(null);
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [search, setSearch] = useState("");
  const [cryptoFilter, setCryptoFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");

  const myListings = useQuery({
    queryKey: ["my-listings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("seller_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Listing[];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-listings", user?.id] });
    void queryClient.invalidateQueries({ queryKey: ["listings"] });
  };

  const copyOfferLink = (id: string) => {
    void navigator.clipboard.writeText(`${window.location.origin}/listings/${id}`);
    toast.success("Offer link copied");
  };

  const setStatus = async (id: string, status: "active" | "paused") => {
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  };

  const all = myListings.data ?? [];
  const sellCount = all.filter((l) => l.side === "sell").length;
  const buyCount = all.filter((l) => l.side === "buy").length;
  const currencies = [...new Set(all.map((l) => l.fiat_currency))].sort();
  const paymentMethods = [...new Set(all.flatMap((l) => l.accepted_payment_methods))].sort();
  const q = search.trim().toLowerCase();
  const filtered = all
    .filter((l) => l.side === side)
    .filter((l) => cryptoFilter === "all" || l.crypto_type === cryptoFilter)
    .filter((l) => currencyFilter === "all" || l.fiat_currency === currencyFilter)
    .filter((l) => paymentFilter === "all" || l.accepted_payment_methods.includes(paymentFilter))
    .filter((l) => !activeOnly || l.status === "active")
    .filter(
      (l) =>
        !q ||
        l.crypto_type.toLowerCase().includes(q) ||
        l.fiat_currency.toLowerCase().includes(q) ||
        l.accepted_payment_methods.some((m) => m.toLowerCase().includes(q)),
    )
    .sort((a, b) => (sort === "price_asc" ? a.price - b.price : sort === "price_desc" ? b.price - a.price : 0));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8">
      <div className="mb-6 border-b border-border pb-6">
        <h1 className="text-3xl font-bold">My offers</h1>
        <p className="mt-1 text-muted-foreground">View and manage your offers</p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-muted p-4">
        {/* Row 1 — side toggle + create button. Stacks on mobile so the
            toggle pair never has to squeeze next to the button. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSide("sell")}
              className={
                side === "sell"
                  ? "flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground sm:flex-initial"
                  : "flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-background/60 sm:flex-initial"
              }
            >
              Offers to sell
              <Badge variant="secondary" className="bg-black/15 font-normal">
                {sellCount}
              </Badge>
            </button>
            <button
              type="button"
              onClick={() => setSide("buy")}
              className={
                side === "buy"
                  ? "flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground sm:flex-initial"
                  : "flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-background/60 sm:flex-initial"
              }
            >
              Offers to buy
              <Badge variant="secondary" className="bg-black/15 font-normal">
                {buyCount}
              </Badge>
            </button>
          </div>

          <Button asChild className="gap-1.5">
            <Link to="/listings/new">
              <Plus className="size-4" /> Create an offer
            </Link>
          </Button>
        </div>

        {/* Row 2 — the search/filter panel, itself made of two nested
            containers: search+toggle+sort, and the crypto/currency/payment
            filters below it. */}
        <div className="space-y-3 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search anything"
                className="pl-9"
              />
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
              Active offers only
            </label>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-44 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Sort by newest</SelectItem>
                <SelectItem value="price_asc">Price: low to high</SelectItem>
                <SelectItem value="price_desc">Price: high to low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-2.5">
            <Select value={cryptoFilter} onValueChange={setCryptoFilter}>
              <SelectTrigger className="w-40 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <Layers className="size-4 shrink-0 text-muted-foreground" />
                    All crypto
                  </span>
                </SelectItem>
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
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger className="w-40 shrink-0 sm:ml-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <Wallet className="size-4 shrink-0 text-muted-foreground" />
                    Currency: All
                  </span>
                </SelectItem>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-44 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Payment: All</SelectItem>
                {paymentMethods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Offers — inside this same filter panel, right after the filter row. */}
          <div className="border-t border-border pt-3">
            {myListings.isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <ArrowLeftRight className="size-6 text-muted-foreground" />
                <p className="text-base font-semibold">No active offers</p>
                <p className="text-sm text-muted-foreground">
                  {all.length === 0
                    ? "Post an offer to start accepting trades."
                    : "No offers match this filter."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((l) => (
                  <Card key={l.id}>
                    <CardContent className="space-y-3 py-4">
                      <div className="flex items-center justify-between">
                        <span
                          className={`size-2.5 rounded-full ${l.status === "active" ? "bg-success" : "bg-muted-foreground"}`}
                          aria-hidden
                        />
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="icon" className="size-8" onClick={() => setEditing(l)} aria-label="Edit offer">
                            <Pencil className="size-3.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon" className="size-8" aria-label="More actions">
                                <MoreVertical className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => copyOfferLink(l.id)}>
                                <Link2 className="size-3.5" /> Copy link
                              </DropdownMenuItem>
                              {l.status === "active" ? (
                                <DropdownMenuItem onClick={() => setStatus(l.id, "paused")}>Pause offer</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setStatus(l.id, "active")}>Activate offer</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div>
                        <p className="flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline">
                          <PaymentRailIcon railKey={railKeyForMethod(l.accepted_payment_methods[0] ?? "")} className="size-4 shrink-0 text-muted-foreground" />
                          {l.accepted_payment_methods[0] ?? "No payment method"}
                          {l.accepted_payment_methods.length > 1 ? (
                            <span className="text-sm font-normal text-muted-foreground">
                              +{l.accepted_payment_methods.length - 1}
                            </span>
                          ) : null}
                        </p>
                        {l.tags.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {l.tags.map((t) => (
                              <Badge key={t} variant="secondary" className="font-normal">
                                {offerTagLabel(t)}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="min-w-0 rounded-md bg-muted/40 p-2.5">
                          <p className="text-xs text-muted-foreground">Market price:</p>
                          <p className="mono flex flex-wrap items-center gap-1.5 font-semibold">
                            <span className="flex min-w-0 items-center gap-1.5 truncate">
                              <CoinIcon code={l.crypto_type} className="size-4 shrink-0" />
                              <span className="truncate">
                                {Number(l.price).toLocaleString()} {l.fiat_currency}
                              </span>
                            </span>
                            {l.fixed_price == null && l.margin_percent !== 0 ? (
                              <Badge
                                className={
                                  l.margin_percent < 0
                                    ? "shrink-0 bg-green-600/15 font-normal text-green-600 hover:bg-green-600/15"
                                    : "shrink-0 bg-destructive/15 font-normal text-destructive hover:bg-destructive/15"
                                }
                              >
                                {l.margin_percent > 0 ? "+" : ""}
                                {l.margin_percent}%
                              </Badge>
                            ) : null}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-md bg-muted/40 p-2.5">
                          <p className="text-xs text-muted-foreground">Range:</p>
                          <p className="mono truncate font-semibold">
                            {l.min_amount != null && l.max_amount != null
                              ? `${Number(l.min_amount).toLocaleString()} - ${Number(l.max_amount).toLocaleString()} ${l.fiat_currency}`
                              : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <Badge variant={l.status === "active" ? "default" : "secondary"} className="font-normal">
                          {l.status === "active" ? "Active" : "Paused"}
                        </Badge>
                        {l.status === "active" ? (
                          <Button variant="outline" size="sm" onClick={() => setStatus(l.id, "paused")}>
                            Pause
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setStatus(l.id, "active")}>
                            Activate
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <EditOfferDialog
        listing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          invalidate();
        }}
      />
    </div>
  );
}

function EditOfferDialog({
  listing,
  onClose,
  onSaved,
}: {
  listing: Listing | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pricingMode, setPricingMode] = useState<"margin" | "fixed">("margin");
  const [margin, setMargin] = useState("0");
  const [fixedPrice, setFixedPrice] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("60");
  const timeLimitBelowMinimum = timeLimitMinutes !== "" && Number(timeLimitMinutes) < MIN_PAYMENT_WINDOW_MINUTES;
  const [minTradesEnabled, setMinTradesEnabled] = useState(false);
  const [minTradesRequired, setMinTradesRequired] = useState("3");
  const [blockedCountries, setBlockedCountries] = useState<string[]>([]);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [methods, setMethods] = useState<string[]>([]);
  const [methodPickerOpen, setMethodPickerOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [terms, setTerms] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!listing) return;
    setPricingMode(listing.fixed_price != null ? "fixed" : "margin");
    setMargin(String(listing.margin_percent ?? 0));
    setFixedPrice(listing.fixed_price != null ? String(listing.fixed_price) : "");
    setMinAmount(listing.min_amount != null ? String(listing.min_amount) : "");
    setMaxAmount(listing.max_amount != null ? String(listing.max_amount) : "");
    setTimeLimitEnabled(listing.payment_window_minutes != null);
    setTimeLimitMinutes(listing.payment_window_minutes != null ? String(listing.payment_window_minutes) : "60");
    setMinTradesEnabled(listing.min_trades_required != null);
    setMinTradesRequired(listing.min_trades_required != null ? String(listing.min_trades_required) : "3");
    setBlockedCountries(listing.blocked_countries ?? []);
    setMethods(listing.accepted_payment_methods ?? []);
    setTags(listing.tags ?? []);
    setTerms(listing.terms ?? "");
    setWelcomeMessage(listing.welcome_message ?? "");
  }, [listing]);

  const fetchPrices = useServerFn(getMarketPrices);
  const marketPrices = useQuery({
    queryKey: ["market-prices"],
    enabled: !!listing,
    queryFn: () => fetchPrices(),
    refetchInterval: 30_000,
  });

  const fetchFxRates = useServerFn(getFxRates);
  const fxRates = useQuery({
    queryKey: ["fx-rates"],
    enabled: !!listing,
    queryFn: () => fetchFxRates(),
    refetchInterval: 5 * 60_000,
  });

  const marketPrice = listing ? marketPrices.data?.[listing.crypto_type] : undefined;
  const fxRate = listing?.fiat_currency === "USD" ? 1 : listing ? fxRates.data?.[listing.fiat_currency] : undefined;
  const marginNum = Number(margin || 0);
  const effectivePrice =
    pricingMode === "fixed"
      ? Number(fixedPrice) || null
      : marketPrice && fxRate
        ? computeEffectivePrice(marketPrice, marginNum, fxRate)
        : null;
  const symbol = currencySymbol(listing?.fiat_currency ?? "USD");

  const toggleTag = (value: string, pairValue: string) =>
    setTags((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev.filter((t) => t !== pairValue), value],
    );

  const save = async () => {
    if (!listing) return;
    if (pricingMode === "margin" && (!Number.isFinite(marginNum) || marginNum < -50 || marginNum > 50)) {
      toast.error("Margin must be between -50% and 50%");
      return;
    }
    if (pricingMode === "fixed" && (!fixedPrice || Number(fixedPrice) <= 0)) {
      toast.error("Enter a fixed price greater than zero");
      return;
    }
    if (!effectivePrice) {
      toast.error("Live market price is still loading — try again in a moment");
      return;
    }
    if (!minAmount || Number(minAmount) <= 0) {
      toast.error("Enter a minimum trade size greater than zero");
      return;
    }
    if (!maxAmount || Number(maxAmount) < Number(minAmount)) {
      toast.error("Max trade size must be at least the minimum");
      return;
    }
    if (methods.length === 0) {
      toast.error("Select at least one payment method");
      return;
    }
    if (timeLimitEnabled && (!timeLimitMinutes || Number(timeLimitMinutes) < MIN_PAYMENT_WINDOW_MINUTES)) {
      toast.error(`Payment time limit must be at least ${MIN_PAYMENT_WINDOW_MINUTES} minutes, or turn it off`);
      return;
    }
    if (minTradesEnabled && (!minTradesRequired || Number(minTradesRequired) <= 0)) {
      toast.error("Enter a minimum trade count greater than zero, or turn it off");
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from("listings")
      .update({
        margin_percent: pricingMode === "margin" ? marginNum : 0,
        fixed_price: pricingMode === "fixed" ? Number(fixedPrice) : null,
        price: effectivePrice,
        min_amount: Number(minAmount),
        max_amount: Number(maxAmount),
        payment_window_minutes: timeLimitEnabled ? Number(timeLimitMinutes) : null,
        min_trades_required: minTradesEnabled ? Number(minTradesRequired) : null,
        blocked_countries: blockedCountries,
        accepted_payment_methods: methods,
        tags,
        terms: terms || null,
        welcome_message: welcomeMessage || null,
      })
      .eq("id", listing.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Offer updated");
    onSaved();
  };

  return (
    <Dialog open={!!listing} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {listing ? <CoinIcon code={listing.crypto_type} className="size-5" /> : null}
            Edit offer
          </DialogTitle>
          <DialogDescription>
            Crypto, currency, and buy/sell side can't change after publishing — everything else can.
          </DialogDescription>
        </DialogHeader>

        {listing ? (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={pricingMode === "margin" ? "e-margin" : "e-fixed-price"}>
                  {pricingMode === "margin"
                    ? "Margin vs market price (%)"
                    : `Fixed price per ${listing.crypto_type} (${listing.fiat_currency})`}
                </Label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setPricingMode(pricingMode === "margin" ? "fixed" : "margin")}
                >
                  {pricingMode === "margin" ? "Switch to fixed rate" : "Switch to margin rate"}
                </button>
              </div>
              {pricingMode === "margin" ? (
                <Input
                  id="e-margin"
                  inputMode="decimal"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  placeholder="-10"
                />
              ) : (
                <Input
                  id="e-fixed-price"
                  inputMode="decimal"
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(e.target.value)}
                  placeholder="64000"
                />
              )}
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                {marketPrice && (fxRate || listing.fiat_currency === "USD") ? (
                  <span>
                    <span className="text-muted-foreground">Live {listing.crypto_type}: </span>
                    <span className="mono text-foreground">${marketPrice.toLocaleString()}</span>
                    <span className="ml-3 text-muted-foreground">Your price: </span>
                    <span className="mono font-medium text-primary">
                      {symbol}
                      {effectivePrice?.toFixed(2)}
                    </span>
                  </span>
                ) : marketPrices.error ? (
                  <span className="text-destructive">Couldn't load the live market price.</span>
                ) : (
                  <span className="text-muted-foreground">Loading live market price…</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="e-min">Min trade size ({listing.fiat_currency})</Label>
                <Input id="e-min" inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-max">Max trade size ({listing.fiat_currency})</Label>
                <Input id="e-max" inputMode="decimal" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Accepted payment methods</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setMethodPickerOpen(true)}>
                  {methods.length === 0 ? "Select methods" : "Add more"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {methods.map((m) => (
                  <Badge key={m} variant="secondary" className="gap-1.5 font-normal">
                    <PaymentRailIcon railKey={railKeyForMethod(m)} className="size-3.5" />
                    {m}
                  </Badge>
                ))}
                {methods.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No payment methods selected.</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Blocked countries</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2 font-normal"
                onClick={() => setCountryPickerOpen(true)}
              >
                {blockedCountries.length === 0
                  ? "🌐 Open to every country"
                  : `${blockedCountries.length} ${blockedCountries.length === 1 ? "country" : "countries"} blocked`}
              </Button>
              {blockedCountries.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {blockedCountries.map((code) => (
                    <Badge key={code} variant="outline" className="font-normal">
                      {COUNTRIES.find((c) => c.code === code)?.name ?? code}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={timeLimitEnabled} onCheckedChange={(v) => setTimeLimitEnabled(!!v)} />
                Payment time limit
              </label>
              {timeLimitEnabled ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={MIN_PAYMENT_WINDOW_MINUTES}
                    className={timeLimitBelowMinimum ? "w-24 border-destructive focus-visible:ring-destructive" : "w-24"}
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              ) : null}
              {timeLimitEnabled ? (
                timeLimitBelowMinimum ? (
                  <p className="text-xs text-destructive">
                    Must be at least {MIN_PAYMENT_WINDOW_MINUTES} minutes — shorter windows don't give
                    buyers a realistic chance to pay.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Minimum {MIN_PAYMENT_WINDOW_MINUTES} minutes.</p>
                )
              ) : null}
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox checked={minTradesEnabled} onCheckedChange={(v) => setMinTradesEnabled(!!v)} />
                Require a minimum trade history
              </label>
              {minTradesEnabled ? (
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    className="w-24"
                    value={minTradesRequired}
                    onChange={(e) => setMinTradesRequired(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">completed trades</span>
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="e-terms">Trade terms (optional)</Label>
              <Textarea id="e-terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="e-welcome">Automatic trade message (optional)</Label>
              <Textarea
                id="e-welcome"
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Trade policies (optional)</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {OFFER_TAG_PAIRS.flat().map((opt) => {
                  const pair = OFFER_TAG_PAIRS.find((p) => p[0].value === opt.value || p[1].value === opt.value)!;
                  const other = pair[0].value === opt.value ? pair[1].value : pair[0].value;
                  return (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 text-sm"
                    >
                      <Checkbox
                        checked={tags.includes(opt.value)}
                        onCheckedChange={() => toggleTag(opt.value, other)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-medium">{opt.label}</span>
                        <span className="block text-xs text-muted-foreground">{opt.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {tags.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Currently: {tags.map((t) => offerTagLabel(t)).join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || (timeLimitEnabled && timeLimitBelowMinimum)} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <PaymentMethodPicker
        open={methodPickerOpen}
        onOpenChange={setMethodPickerOpen}
        selected={methods}
        onChange={setMethods}
      />
      <CountryBlockPicker
        open={countryPickerOpen}
        onOpenChange={setCountryPickerOpen}
        selected={blockedCountries}
        onChange={setBlockedCountries}
      />
    </Dialog>
  );
}
