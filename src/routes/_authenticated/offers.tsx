import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
      { title: "Your offers — CEMP" },
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

  const setStatus = async (id: string, status: "active" | "paused") => {
    const { error } = await supabase.from("listings").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your offers</h1>
          <p className="text-sm text-muted-foreground">Pause, activate, or edit your published offers.</p>
        </div>
        <Button asChild size="sm">
          <Link to="/listings/new">New offer</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 py-5">
          {myListings.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (myListings.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven't published any offers yet.</p>
          ) : (
            (myListings.data ?? []).map((l) => (
              <div
                key={l.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      <CoinIcon code={l.crypto_type} className="size-4" />
                      {l.side === "sell" ? "Selling" : "Buying"} {l.crypto_type}
                    </span>
                    <Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge>
                  </div>
                  <p className="mono text-xs text-muted-foreground">
                    {currencySymbol(l.fiat_currency)}
                    {Number(l.price).toLocaleString()} / {l.crypto_type}
                    {l.min_amount != null && l.max_amount != null
                      ? ` · ${currencySymbol(l.fiat_currency)}${Number(l.min_amount).toLocaleString()}–${currencySymbol(l.fiat_currency)}${Number(l.max_amount).toLocaleString()}`
                      : ""}{" "}
                    · {l.accepted_payment_methods.join(", ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(l)}>
                    Edit
                  </Button>
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
              </div>
            ))
          )}
        </CardContent>
      </Card>

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
    if (timeLimitEnabled && (!timeLimitMinutes || Number(timeLimitMinutes) <= 0)) {
      toast.error("Enter a payment time limit greater than zero, or turn it off");
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
                    inputMode="numeric"
                    className="w-24"
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
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
          <Button disabled={busy} onClick={save}>
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
