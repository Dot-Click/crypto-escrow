import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CRYPTO_TYPES } from "@/lib/constants";
import { currencySymbol } from "@/lib/currencies";
import { CurrencyCombobox } from "@/components/currency-combobox";
import { COUNTRIES } from "@/lib/countries";
import { CountryBlockPicker } from "@/components/country-block-picker";
import { OFFER_TAG_PAIRS, offerTagLabel } from "@/lib/offer-tags";
import { computeEffectivePrice } from "@/lib/pricing";
import { getFxRates, getMarketPrices } from "@/lib/market.functions";
import { PaymentMethodPicker } from "@/components/payment-method-picker";
import { RAIL_DETAIL_FIELDS } from "@/lib/payment-method-fields";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { CoinIcon } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { Stepper, type StepDef } from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/listings/new")({
  head: () => ({
    meta: [
      { title: "Create an offer — CEMP" },
      {
        name: "description",
        content:
          "Publish a peer-to-peer crypto offer: choose the coin, price and payment methods you accept.",
      },
      { property: "og:title", content: "Create an offer — CEMP" },
      {
        property: "og:description",
        content: "Publish a peer-to-peer crypto offer with the payment methods you accept.",
      },
    ],
  }),
  component: NewListing,
});

const STEPS: StepDef[] = [
  { key: "basics", label: "Basics" },
  { key: "pricing", label: "Pricing & limits" },
  { key: "methods", label: "Payment methods" },
  { key: "review", label: "Review" },
];

function NewListing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [cryptoType, setCryptoType] = useState<string>("BTC");
  const [currency, setCurrency] = useState<string>("USD");
  const [blockedCountries, setBlockedCountries] = useState<string[]>([]);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [pricingMode, setPricingMode] = useState<"margin" | "fixed">("margin");
  const [margin, setMargin] = useState("0");
  const [fixedPrice, setFixedPrice] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("60");
  const [minTradesEnabled, setMinTradesEnabled] = useState(false);
  const [minTradesRequired, setMinTradesRequired] = useState("3");
  const [tags, setTags] = useState<string[]>([]);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const [attachedDetails, setAttachedDetails] = useState<Record<string, string>>({});
  // New inline detail entry — keyed by method name. When populated, we
  // create a fresh payment_methods row on submit and attach it to the
  // listing (which also saves it for reuse later).
  const [newDetails, setNewDetails] = useState<
    Record<string, { label: string; values: Record<string, string> }>
  >({});
  // Which method's detail card is expanded, and whether that card is
  // showing its saved-details dropdown or the new-details form — never
  // both at once, which was the "nested and messy" part of the old layout.
  const [openMethod, setOpenMethod] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<Record<string, "saved" | "new">>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState(false);

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

  const savedMethods = useQuery({
    queryKey: ["payment-methods", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id, method, label, details")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const marketPrice = marketPrices.data?.[cryptoType];
  const fxRate = currency === "USD" ? 1 : fxRates.data?.[currency];
  const marginNum = Number(margin || 0);
  const effectivePrice =
    pricingMode === "fixed"
      ? Number(fixedPrice) || null
      : marketPrice && fxRate
        ? computeEffectivePrice(marketPrice, marginNum, fxRate)
        : null;
  const symbol = currencySymbol(currency);

  const savedMethodsFor = (m: string) => (savedMethods.data ?? []).filter((pm) => pm.method === m);

  const setMethodsAndPrune = (next: string[]) => {
    setMethods(next);
    setAttachedDetails((prev) => {
      const pruned: Record<string, string> = {};
      for (const m of next) if (prev[m]) pruned[m] = prev[m];
      return pruned;
    });
    setNewDetails((prev) => {
      const pruned: typeof prev = {};
      for (const m of next) if (prev[m]) pruned[m] = prev[m];
      return pruned;
    });
    if (openMethod && !next.includes(openMethod)) setOpenMethod(null);
  };

  const removeMethod = (m: string) => setMethodsAndPrune(methods.filter((x) => x !== m));

  // Toggling a tag unchecks its opposite in the pair — "No VPN" and "VPN
  // allowed" checked together wouldn't mean anything.
  const toggleTag = (value: string, pairValue: string) =>
    setTags((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev.filter((t) => t !== pairValue), value],
    );

  const hasInlineDetailsFor = (m: string) => {
    const rk = railKeyForMethod(m);
    const fields = rk ? RAIL_DETAIL_FIELDS[rk] ?? [] : [];
    const vals = newDetails[m]?.values ?? {};
    return fields.some((f) => (vals[f.key] ?? "").trim());
  };

  const setDetailField = (m: string, key: string, value: string) =>
    setNewDetails((prev) => ({
      ...prev,
      [m]: {
        label: prev[m]?.label ?? "",
        values: { ...(prev[m]?.values ?? {}), [key]: value },
      },
    }));

  const setDetailLabel = (m: string, label: string) =>
    setNewDetails((prev) => ({
      ...prev,
      [m]: {
        label,
        values: prev[m]?.values ?? {},
      },
    }));

  // Per-step validation — keeps "Next" from advancing on obviously broken
  // input, without repeating the full submit-time validation below.
  const stepError = (i: number): string | null => {
    if (i === 1) {
      if (pricingMode === "margin" && (!Number.isFinite(marginNum) || marginNum < -50 || marginNum > 50)) {
        return "Margin must be between -50% and 50%";
      }
      if (pricingMode === "fixed" && (!fixedPrice || Number(fixedPrice) <= 0)) {
        return "Enter a fixed price greater than zero";
      }
      if (!effectivePrice) return "Live market price is still loading — try again in a moment";
      if (!minAmount || Number(minAmount) <= 0) return "Enter a minimum trade size greater than zero";
      if (!maxAmount || Number(maxAmount) < Number(minAmount)) {
        return "Max trade size must be at least the minimum";
      }
      return null;
    }
    if (i === 2) {
      if (methods.length === 0) return "Select at least one payment method";
      for (const m of methods) {
        if (!hasInlineDetailsFor(m)) continue;
        const rk = railKeyForMethod(m);
        const fields = rk ? RAIL_DETAIL_FIELDS[rk] ?? [] : [];
        const vals = newDetails[m]?.values ?? {};
        const missing = fields.filter((f) => !f.optional && !(vals[f.key] ?? "").trim());
        if (missing.length > 0) return `Fill in ${missing.map((f) => f.label).join(", ")} for ${m}`;
      }
      return null;
    }
    return null;
  };

  const goNext = () => {
    const err = stepError(step);
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!user) return;
    if (timeLimitEnabled && (!timeLimitMinutes || Number(timeLimitMinutes) <= 0)) {
      toast.error("Enter a payment time limit greater than zero, or turn it off");
      return;
    }
    if (minTradesEnabled && (!minTradesRequired || Number(minTradesRequired) <= 0)) {
      toast.error("Enter a minimum trade count greater than zero, or turn it off");
      return;
    }
    for (let i = 0; i < 3; i++) {
      const err = stepError(i);
      if (err) {
        toast.error(err);
        setStep(i);
        return;
      }
    }
    if (!effectivePrice) return; // stepError(1) already guarantees this — narrows the type below

    setBusy(true);

    // Save any inline-entered payment details as reusable payment_methods rows
    // first, so we can attach their IDs to the listing below. These persist in
    // the seller's profile even if the listing insert later fails — that's
    // desirable, they can pick them up next time from the dropdown.
    const attachmentsById: Record<string, string> = { ...attachedDetails };
    for (const m of methods) {
      if (!hasInlineDetailsFor(m)) continue;
      const entry = newDetails[m]!;
      const { data: created, error: createErr } = await supabase
        .from("payment_methods")
        .insert({
          user_id: user.id,
          method: m,
          label: entry.label.trim() || null,
          details: entry.values,
        })
        .select("id")
        .single();
      if (createErr || !created) {
        setBusy(false);
        toast.error(`Couldn't save details for ${m}: ${createErr?.message ?? "unknown error"}`);
        return;
      }
      // Newly-entered details take precedence over any previously-picked
      // saved-method dropdown selection for that same method.
      attachmentsById[m] = created.id;
    }

    const { data: listing, error } = await supabase
      .from("listings")
      .insert({
        seller_id: user.id,
        side,
        crypto_type: cryptoType,
        fiat_currency: currency,
        blocked_countries: blockedCountries,
        price: effectivePrice,
        margin_percent: pricingMode === "margin" ? marginNum : 0,
        fixed_price: pricingMode === "fixed" ? Number(fixedPrice) : null,
        min_amount: Number(minAmount),
        max_amount: Number(maxAmount),
        payment_window_minutes: timeLimitEnabled ? Number(timeLimitMinutes) : null,
        min_trades_required: minTradesEnabled ? Number(minTradesRequired) : null,
        accepted_payment_methods: methods,
        terms: terms || null,
        tags,
        welcome_message: welcomeMessage || null,
      })
      .select("id")
      .single();
    if (error || !listing) {
      setBusy(false);
      toast.error(error?.message ?? "Could not publish offer");
      return;
    }

    const attachRows = methods
      .filter((m) => attachmentsById[m])
      .map((m) => ({ listing_id: listing.id, payment_method_id: attachmentsById[m]!, method: m }));
    if (attachRows.length > 0) {
      const { error: attachErr } = await supabase.from("listing_payment_methods").insert(attachRows);
      if (attachErr) {
        setBusy(false);
        toast.error(`Offer published, but couldn't attach payment details: ${attachErr.message}`);
        navigate({ to: "/" });
        return;
      }
    }

    setBusy(false);
    toast.success("Offer published");
    navigate({ to: "/" });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-8">
      <Card>
        <CardHeader>
          <CardTitle>Create an offer</CardTitle>
          <CardDescription>
            Escrow is funded from your platform wallet balance when a buyer starts a trade.
          </CardDescription>
          <div className="pt-4">
            <Stepper steps={STEPS} current={step} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Offer type</Label>
                <Select value={side} onValueChange={(v) => setSide(v as typeof side)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sell">I'm selling crypto</SelectItem>
                    <SelectItem value="buy">I'm buying crypto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Crypto</Label>
                <Select value={cryptoType} onValueChange={setCryptoType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRYPTO_TYPES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="flex items-center gap-2">
                          <CoinIcon code={c.code} className="size-4" />
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <CurrencyCombobox value={currency} onChange={setCurrency} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Blocked countries</Label>
                <div className="flex gap-2">
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
                </div>
                {blockedCountries.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {blockedCountries.map((code) => {
                      const c = COUNTRIES.find((x) => x.code === code);
                      return (
                        <Badge key={code} variant="secondary" className="gap-1.5 font-normal">
                          <span className={`fi fi-${code.toLowerCase()}`} aria-hidden />
                          {c?.name ?? code}
                          <button
                            type="button"
                            aria-label={`Unblock ${c?.name ?? code}`}
                            className="rounded-full p-0.5 hover:bg-foreground/10"
                            onClick={() => setBlockedCountries((prev) => prev.filter((x) => x !== code))}
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pricing
                  </h3>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setPricingMode(pricingMode === "margin" ? "fixed" : "margin")}
                  >
                    {pricingMode === "margin" ? "Switch to fixed rate" : "Switch to margin rate"}
                  </button>
                </div>
                <div className="group space-y-1.5">
                  <Label htmlFor={pricingMode === "margin" ? "margin" : "fixed-price"}>
                    {pricingMode === "margin"
                      ? "Margin vs market price (%)"
                      : `Fixed price per ${cryptoType} (${currency})`}
                  </Label>
                  {pricingMode === "margin" ? (
                    <>
                      <Input
                        id="margin"
                        inputMode="decimal"
                        value={margin}
                        onChange={(e) => setMargin(e.target.value)}
                        placeholder="-10"
                      />
                      <p className="hidden text-xs text-muted-foreground group-focus-within:block">
                        Negative = below market (common for gift cards), positive = above market. Your
                        price moves with the market.
                      </p>
                    </>
                  ) : (
                    <>
                      <Input
                        id="fixed-price"
                        inputMode="decimal"
                        value={fixedPrice}
                        onChange={(e) => setFixedPrice(e.target.value)}
                        placeholder="64000"
                      />
                      <p className="hidden text-xs text-muted-foreground group-focus-within:block">
                        Locked in — this price won't change even if the market moves.
                      </p>
                    </>
                  )}
                </div>

                {/* Live pricing callout — sits right under the pricing input so the
                    feedback is immediate. Accent-tinted so it reads as a highlight. */}
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                  {marketPrice && (fxRate || currency === "USD") ? (
                    pricingMode === "fixed" ? (
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="text-muted-foreground">Live {cryptoType} price</span>
                        <span className="mono font-medium text-foreground">
                          ${marketPrice.toLocaleString()}
                          {currency !== "USD" ? (
                            <span className="ml-1 text-muted-foreground">
                              ({symbol}
                              {(marketPrice * (fxRate ?? 1)).toLocaleString()})
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span>
                          <span className="text-muted-foreground">Live {cryptoType}: </span>
                          <span className="mono text-foreground">
                            ${marketPrice.toLocaleString()}
                          </span>
                        </span>
                        <span>
                          <span className="text-muted-foreground">Your price: </span>
                          <span className="mono font-medium text-primary">
                            {symbol}
                            {effectivePrice?.toFixed(2)}
                          </span>
                          <span className="ml-1 text-muted-foreground">per {cryptoType}</span>
                        </span>
                      </div>
                    )
                  ) : marketPrices.error ? (
                    <p className="text-destructive">
                      Couldn't load the live market price: {(marketPrices.error as Error).message}
                    </p>
                  ) : fxRates.error ? (
                    <p className="text-destructive">
                      Couldn't load FX rates: {(fxRates.error as Error).message}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Loading live market price…</p>
                  )}
                </div>
              </div>

              <div className="space-y-4 border-t border-border pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Trade limits
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="min-amount">Min trade size ({currency})</Label>
                    <Input
                      id="min-amount"
                      inputMode="decimal"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      placeholder="50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="max-amount">Max trade size ({currency})</Label>
                    <Input
                      id="max-amount"
                      inputMode="decimal"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      placeholder="100"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Payment methods
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pick from banks, mobile money, gift cards, wallets and more.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                  {methods.length === 0 ? "Select methods" : "Add more"}
                </Button>
              </div>

              {methods.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex w-full items-center justify-center rounded-md border border-dashed border-border py-8 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  No payment methods yet — click to add one
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {methods.map((m) => {
                    const rk = railKeyForMethod(m);
                    const active = openMethod === m;
                    const configured = attachedDetails[m] || hasInlineDetailsFor(m);
                    return (
                      <Badge
                        key={m}
                        variant={active ? "default" : "secondary"}
                        className="cursor-pointer gap-1.5 py-1.5 pl-2.5 pr-1.5 font-normal"
                        onClick={() => setOpenMethod(active ? null : m)}
                      >
                        <PaymentRailIcon railKey={rk} className="size-3.5" />
                        {m}
                        {configured ? <span className="text-[10px] opacity-70">· set up</span> : null}
                        <button
                          type="button"
                          aria-label={`Remove ${m}`}
                          className="rounded-full p-0.5 hover:bg-foreground/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMethod(m);
                          }}
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              {openMethod ? (
                <MethodDetailsCard
                  method={openMethod}
                  savedMatches={savedMethodsFor(openMethod)}
                  mode={detailMode[openMethod] ?? (savedMethodsFor(openMethod).length > 0 ? "saved" : "new")}
                  onModeChange={(mode) => setDetailMode((prev) => ({ ...prev, [openMethod]: mode }))}
                  attachedId={attachedDetails[openMethod] ?? ""}
                  onAttach={(id) => setAttachedDetails((prev) => ({ ...prev, [openMethod]: id }))}
                  label={newDetails[openMethod]?.label ?? ""}
                  values={newDetails[openMethod]?.values ?? {}}
                  onLabelChange={(v) => setDetailLabel(openMethod, v)}
                  onFieldChange={(k, v) => setDetailField(openMethod, k, v)}
                  onClose={() => setOpenMethod(null)}
                />
              ) : null}

              {methods.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Details you enter are shown to the buyer in the trade chat once escrow opens, and
                  saved to your profile for reuse. Adding details is optional — you can also just
                  coordinate via chat.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Advanced settings
                </h3>
                <div className="group space-y-2 rounded-md border border-border p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={timeLimitEnabled}
                      onCheckedChange={(v) => setTimeLimitEnabled(!!v)}
                    />
                    Payment time limit
                  </label>
                  {timeLimitEnabled ? (
                    <div className="flex items-center gap-2">
                      <Input
                        inputMode="numeric"
                        className="w-24"
                        value={timeLimitMinutes}
                        onChange={(e) => setTimeLimitMinutes(e.target.value)}
                        placeholder="60"
                      />
                      <span className="text-sm text-muted-foreground">minutes</span>
                    </div>
                  ) : null}
                  <p className="hidden text-xs text-muted-foreground group-focus-within:block">
                    {timeLimitEnabled
                      ? "The buyer must mark payment as sent within this window, or the trade auto-cancels and your escrow is refunded."
                      : "No time limit — escrow stays held until the buyer pays or you cancel manually."}
                  </p>
                </div>

                <div className="group space-y-2 rounded-md border border-border p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={minTradesEnabled}
                      onCheckedChange={(v) => setMinTradesEnabled(!!v)}
                    />
                    Require a minimum trade history
                  </label>
                  {minTradesEnabled ? (
                    <div className="flex items-center gap-2">
                      <Input
                        inputMode="numeric"
                        className="w-24"
                        value={minTradesRequired}
                        onChange={(e) => setMinTradesRequired(e.target.value)}
                        placeholder="3"
                      />
                      <span className="text-sm text-muted-foreground">completed trades</span>
                    </div>
                  ) : null}
                  <p className="hidden text-xs text-muted-foreground group-focus-within:block">
                    {minTradesEnabled
                      ? "Traders with fewer completed trades won't be able to start this trade — a lightweight trust filter, since this platform doesn't do KYC verification."
                      : "Open to any trader, regardless of trade history."}
                  </p>
                </div>

                <div className="group space-y-1.5">
                  <Label htmlFor="terms">Trade terms (optional)</Label>
                  <Textarea
                    id="terms"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Payment within 30 minutes. Send proof in the trade chat."
                  />
                </div>

                <div className="group space-y-1.5">
                  <Label htmlFor="welcome-message">Automatic trade message (optional)</Label>
                  <Textarea
                    id="welcome-message"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="Hi, thanks for opening this trade. Please follow the payment instructions."
                  />
                  <p className="hidden text-xs text-muted-foreground group-focus-within:block">
                    Sent automatically in the trade chat the moment escrow opens.
                  </p>
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
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Review
                </h3>
                <div className="grid gap-3 rounded-md border border-border p-4 text-sm sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <CoinIcon code={cryptoType} className="size-4" />
                    <span>
                      {side === "sell" ? "Selling" : "Buying"} {cryptoType}
                    </span>
                  </div>
                  <div>
                    {pricingMode === "fixed" ? (
                      <>
                        Fixed at {symbol}
                        {fixedPrice || "0"} per {cryptoType}
                      </>
                    ) : (
                      <>
                        {marginNum > 0 ? "+" : ""}
                        {marginNum}% vs market
                      </>
                    )}
                  </div>
                  <div>
                    Limits: {symbol}
                    {minAmount || "0"} – {symbol}
                    {maxAmount || "0"}
                  </div>
                  <div>
                    {timeLimitEnabled ? `${timeLimitMinutes || "0"} min payment window` : "No time limit"}
                  </div>
                  <div>
                    {minTradesEnabled
                      ? `Requires ${minTradesRequired || "0"}+ completed trades`
                      : "Open to any trader"}
                  </div>
                  <div>
                    {blockedCountries.length === 0
                      ? "🌐 Open to every country"
                      : `Blocks: ${blockedCountries.map((code) => COUNTRIES.find((c) => c.code === code)?.name ?? code).join(", ")}`}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">Payment methods: </span>
                    {methods.length === 0 ? (
                      <span className="text-destructive">none selected</span>
                    ) : (
                      methods.join(", ")
                    )}
                  </div>
                  {tags.length > 0 ? (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Policies: </span>
                      {tags.map((t) => offerTagLabel(t)).join(", ")}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <PaymentMethodPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            selected={methods}
            onChange={setMethodsAndPrune}
          />

          <CountryBlockPicker
            open={countryPickerOpen}
            onOpenChange={setCountryPickerOpen}
            selected={blockedCountries}
            onChange={setBlockedCountries}
          />
        </CardContent>
      </Card>

      {/* Sticky action bar — Trade range + step navigation anchored so they
          never get lost in the scroll flow. */}
      <div className="sticky bottom-0 z-10 mt-4 border-t border-border bg-background/95 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Trade range
            </p>
            <p className="mono text-lg font-semibold text-foreground">
              {minAmount && maxAmount ? (
                <>
                  {symbol}
                  {Number(minAmount).toLocaleString()} – {symbol}
                  {Number(maxAmount).toLocaleString()}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button variant="outline" size="lg" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button size="lg" className="rounded-full px-6" onClick={goNext}>
                Next
              </Button>
            ) : (
              <Button size="lg" className="rounded-full px-6" disabled={busy} onClick={submit}>
                {busy ? "Publishing…" : "Publish offer"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One payment method's setup — either attach previously-saved details, or
 * enter new ones, never both blocks stacked at once. */
function MethodDetailsCard({
  method,
  savedMatches,
  mode,
  onModeChange,
  attachedId,
  onAttach,
  label,
  values,
  onLabelChange,
  onFieldChange,
  onClose,
}: {
  method: string;
  savedMatches: { id: string; method: string; label: string | null }[];
  mode: "saved" | "new";
  onModeChange: (mode: "saved" | "new") => void;
  attachedId: string;
  onAttach: (id: string) => void;
  label: string;
  values: Record<string, string>;
  onLabelChange: (v: string) => void;
  onFieldChange: (key: string, v: string) => void;
  onClose: () => void;
}) {
  const rk = railKeyForMethod(method);
  const fields = rk ? RAIL_DETAIL_FIELDS[rk] ?? [] : [];

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <PaymentRailIcon railKey={rk} className="size-4 text-muted-foreground" />
          {method}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {savedMatches.length > 0 ? (
        <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs">
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 ${mode === "saved" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
            onClick={() => onModeChange("saved")}
          >
            Use saved details
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-2 py-1 ${mode === "new" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
            onClick={() => onModeChange("new")}
          >
            Enter new details
          </button>
        </div>
      ) : null}

      {mode === "saved" && savedMatches.length > 0 ? (
        <Select value={attachedId || "__none"} onValueChange={(v) => onAttach(v === "__none" ? "" : v)}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Attach saved details (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Don't attach — coordinate via chat</SelectItem>
            {savedMatches.map((pm) => (
              <SelectItem key={pm.id} value={pm.id}>
                {pm.label || pm.method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : fields.length > 0 ? (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor={`label-${method}`} className="text-[11px] text-muted-foreground">
              Label
            </Label>
            <Input
              id={`label-${method}`}
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="Main account"
              className="h-8 text-xs"
            />
          </div>
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`${method}-${f.key}`} className="text-[11px] text-muted-foreground">
                {f.label}
                {f.optional ? <span className="ml-1 opacity-60">(optional)</span> : null}
              </Label>
              <Input
                id={`${method}-${f.key}`}
                value={values[f.key] ?? ""}
                onChange={(e) => onFieldChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No extra details needed for this method — you can coordinate specifics in the trade chat.
        </p>
      )}
    </div>
  );
}
