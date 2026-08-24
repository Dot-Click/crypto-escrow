import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CRYPTO_TYPES } from "@/lib/constants";
import { CURRENCIES, currencySymbol } from "@/lib/currencies";
import { computeEffectivePrice } from "@/lib/pricing";
import { getFxRates, getMarketPrices } from "@/lib/market.functions";
import { PaymentMethodPicker } from "@/components/payment-method-picker";
import { RAIL_DETAIL_FIELDS } from "@/lib/payment-method-fields";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      { title: "Create an offer — FOMN" },
      {
        name: "description",
        content:
          "Publish a peer-to-peer crypto offer: choose the coin, amount, price and payment methods you accept.",
      },
      { property: "og:title", content: "Create an offer — FOMN" },
      {
        property: "og:description",
        content: "Publish a peer-to-peer crypto offer with the payment methods you accept.",
      },
    ],
  }),
  component: NewListing,
});

function NewListing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [cryptoType, setCryptoType] = useState<string>("BTC");
  const [currency, setCurrency] = useState<string>("USD");
  const [amount, setAmount] = useState("");
  const [pricingMode, setPricingMode] = useState<"margin" | "fixed">("margin");
  const [margin, setMargin] = useState("0");
  const [fixedPrice, setFixedPrice] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("60");
  const [methods, setMethods] = useState<string[]>([]);
  const [attachedDetails, setAttachedDetails] = useState<Record<string, string>>({});
  // New inline detail entry — keyed by method name. When populated, we
  // create a fresh payment_methods row on submit and attach it to the
  // listing (which also saves it for reuse later).
  const [newDetails, setNewDetails] = useState<
    Record<string, { label: string; values: Record<string, string> }>
  >({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState(false);
  // Visual disclosure state — data below is unchanged. Payment methods are
  // collapsed by default (with a summary row) and Advanced starts closed
  // since not every offer needs a time limit or trade terms.
  const [methodsExpanded, setMethodsExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
  const totalValue = effectivePrice && amount ? effectivePrice * Number(amount) : null;
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
  };

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

  const submit = async () => {
    if (!user) return;
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    if (pricingMode === "margin" && (!Number.isFinite(marginNum) || marginNum < -50 || marginNum > 50)) {
      toast.error("Margin must be between -50% and 50%");
      return;
    }
    if (pricingMode === "fixed" && (!fixedPrice || Number(fixedPrice) <= 0)) {
      toast.error("Enter a fixed price greater than zero");
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
    if (!effectivePrice) {
      toast.error(
        pricingMode === "fixed"
          ? "Enter a fixed price"
          : "Live market price or FX rate is still loading — try again in a moment",
      );
      return;
    }
    if (Number(maxAmount) > effectivePrice * Number(amount)) {
      toast.error("Max trade size can't exceed the total value of this offer");
      return;
    }
    if (timeLimitEnabled && (!timeLimitMinutes || Number(timeLimitMinutes) <= 0)) {
      toast.error("Enter a payment time limit greater than zero, or turn it off");
      return;
    }

    // Validate any partially-filled inline payment details — if the user
    // started entering them for a method, they must fill in all required
    // fields (all fields except those marked optional).
    for (const m of methods) {
      if (!hasInlineDetailsFor(m)) continue;
      const rk = railKeyForMethod(m);
      const fields = rk ? RAIL_DETAIL_FIELDS[rk] ?? [] : [];
      const vals = newDetails[m]?.values ?? {};
      const missing = fields.filter((f) => !f.optional && !(vals[f.key] ?? "").trim());
      if (missing.length > 0) {
        toast.error(`Fill in ${missing.map((f) => f.label).join(", ")} for ${m}`);
        return;
      }
    }

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
        amount: Number(amount),
        price: effectivePrice,
        margin_percent: pricingMode === "margin" ? marginNum : 0,
        fixed_price: pricingMode === "fixed" ? Number(fixedPrice) : null,
        min_amount: Number(minAmount),
        max_amount: Number(maxAmount),
        payment_window_minutes: timeLimitEnabled ? Number(timeLimitMinutes) : null,
        accepted_payment_methods: methods,
        terms: terms || null,
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
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8">
      <Card>
        <CardHeader>
          <CardTitle>Create an offer</CardTitle>
          <CardDescription>
            Escrow is funded from your platform wallet balance when a buyer starts a trade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* — Section 1: Basics — */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Basics
            </h3>
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
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} — {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="group space-y-1.5">
                <Label htmlFor="amount">Amount ({cryptoType})</Label>
                <Input
                  id="amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.05"
                />
              </div>
            </div>
          </section>

          {/* — Section 2: Pricing — */}
          <section className="space-y-4">
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
          </section>

          {/* — Section 3: Trade limits — */}
          <section className="space-y-4">
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
          </section>

          {/* — Section 4: Payment methods — collapsed summary by default — */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Payment methods
            </h3>
            <div className="rounded-md border border-border">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm"
                onClick={() => setMethodsExpanded(!methodsExpanded)}
                aria-expanded={methodsExpanded}
              >
                <span className="flex items-center gap-2">
                  {methods.length === 0 ? (
                    <>
                      <Plus className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Add a payment method</span>
                    </>
                  ) : methods.length === 1 ? (
                    <span className="font-medium">{methods[0]}</span>
                  ) : (
                    <span className="font-medium">
                      {methods.length} payment methods selected
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`size-4 text-muted-foreground transition-transform ${
                    methodsExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>

              {methodsExpanded ? (
                <div className="space-y-3 border-t border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {methods.length === 0
                        ? "Pick from banks, mobile money, gift cards, wallets and more."
                        : "Attach or enter details for each method."}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPickerOpen(true)}
                    >
                      {methods.length === 0 ? "Select methods" : `${methods.length} selected`}
                    </Button>
                  </div>

                  {methods.length > 0 ? (
                    <div className="space-y-2">
                      {methods.map((m) => {
                        const matches = savedMethodsFor(m);
                        const rk = railKeyForMethod(m);
                        const fields = rk ? RAIL_DETAIL_FIELDS[rk] ?? [] : [];
                        const inlineActive = hasInlineDetailsFor(m);
                        return (
                          <div
                            key={m}
                            className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2.5"
                          >
                            <p className="text-sm font-medium">{m}</p>
                            {matches.length > 0 ? (
                              <Select
                                value={attachedDetails[m] ?? "__none"}
                                onValueChange={(v) =>
                                  setAttachedDetails((prev) => ({
                                    ...prev,
                                    [m]: v === "__none" ? "" : v,
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Attach saved details (optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none">
                                    Don't attach — coordinate via chat
                                  </SelectItem>
                                  {matches.map((pm) => (
                                    <SelectItem key={pm.id} value={pm.id}>
                                      {pm.label || pm.method}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}

                            {fields.length > 0 ? (
                              <div className="space-y-2 border-t border-border pt-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-medium">
                                    {matches.length > 0 ? "Or add new details" : "Payment details"}
                                  </p>
                                  {inlineActive ? (
                                    <span className="text-[10px] text-muted-foreground">
                                      Also saved to your profile
                                    </span>
                                  ) : null}
                                </div>
                                <div className="space-y-1.5">
                                  <Label
                                    htmlFor={`label-${m}`}
                                    className="text-[11px] text-muted-foreground"
                                  >
                                    Label
                                  </Label>
                                  <Input
                                    id={`label-${m}`}
                                    value={newDetails[m]?.label ?? ""}
                                    onChange={(e) => setDetailLabel(m, e.target.value)}
                                    placeholder="Main account"
                                    className="h-8 text-xs"
                                  />
                                </div>
                                {fields.map((f) => (
                                  <div key={f.key} className="space-y-1.5">
                                    <Label
                                      htmlFor={`${m}-${f.key}`}
                                      className="text-[11px] text-muted-foreground"
                                    >
                                      {f.label}
                                      {f.optional ? (
                                        <span className="ml-1 opacity-60">(optional)</span>
                                      ) : null}
                                    </Label>
                                    <Input
                                      id={`${m}-${f.key}`}
                                      value={newDetails[m]?.values[f.key] ?? ""}
                                      onChange={(e) => setDetailField(m, f.key, e.target.value)}
                                      placeholder={f.placeholder}
                                      className="h-8 text-xs"
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {methods.length > 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Details you enter are shown to the buyer in the trade chat once escrow opens,
                      and saved to your profile for reuse.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          {/* — Section 5: Advanced (collapsed) — */}
          <section>
            <button
              type="button"
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              aria-expanded={advancedOpen}
            >
              <span>Advanced settings</span>
              <ChevronDown
                className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              />
            </button>
            {advancedOpen ? (
              <div className="mt-4 space-y-4">
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

                <div className="group space-y-1.5">
                  <Label htmlFor="terms">Trade terms (optional)</Label>
                  <Textarea
                    id="terms"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Payment within 30 minutes. Send proof in the trade chat."
                  />
                </div>
              </div>
            ) : null}
          </section>

          <PaymentMethodPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            selected={methods}
            onChange={setMethodsAndPrune}
          />
        </CardContent>
      </Card>

      {/* Sticky action bar — Total value + Publish button anchored so they
          never get lost in the scroll flow. */}
      <div className="sticky bottom-0 z-10 mt-4 border-t border-border bg-background/95 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total value
            </p>
            <p className="mono text-lg font-semibold text-foreground">
              {totalValue ? (
                <>
                  {symbol}
                  {totalValue.toLocaleString()}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
          <Button size="lg" className="rounded-full px-6" disabled={busy} onClick={submit}>
            Publish offer
          </Button>
        </div>
      </div>
    </div>
  );
}
