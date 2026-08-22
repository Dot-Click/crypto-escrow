import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CRYPTO_TYPES } from "@/lib/constants";
import { CURRENCIES, currencySymbol } from "@/lib/currencies";
import { computeEffectivePrice } from "@/lib/pricing";
import { getFxRates, getMarketPrices } from "@/lib/market.functions";
import { PaymentMethodPicker } from "@/components/payment-method-picker";
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
      { title: "Create an offer — EscrowP2P" },
      {
        name: "description",
        content:
          "Publish a peer-to-peer crypto offer: choose the coin, amount, price and payment methods you accept.",
      },
      { property: "og:title", content: "Create an offer — EscrowP2P" },
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
  };

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
    setBusy(true);
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
      .filter((m) => attachedDetails[m])
      .map((m) => ({ listing_id: listing.id, payment_method_id: attachedDetails[m]!, method: m }));
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
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create an offer</CardTitle>
          <CardDescription>
            Escrow is funded from your platform wallet balance when a buyer starts a trade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
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
            <div className="space-y-2">
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
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ({cryptoType})</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.05"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={pricingMode === "margin" ? "margin" : "fixed-price"}>
                  {pricingMode === "margin"
                    ? "Margin vs market price (%)"
                    : `Fixed price per ${cryptoType} (${currency})`}
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
                <>
                  <Input
                    id="margin"
                    inputMode="decimal"
                    value={margin}
                    onChange={(e) => setMargin(e.target.value)}
                    placeholder="-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Negative = below market (common for gift cards), positive = above market. Your price
                    moves with the market.
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
                  <p className="text-xs text-muted-foreground">
                    Locked in — this price won't change even if the market moves.
                  </p>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-amount">Min trade size ({currency})</Label>
              <Input
                id="min-amount"
                inputMode="decimal"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="50"
              />
            </div>
            <div className="space-y-2">
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
                  placeholder="60"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {timeLimitEnabled
                ? "The buyer must mark payment as sent within this window, or the trade auto-cancels and your escrow is refunded."
                : "No time limit — escrow stays held until the buyer pays or you cancel manually."}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            {marketPrice && (fxRate || currency === "USD") ? (
              pricingMode === "fixed" ? (
                <>
                  Live {cryptoType} price (for reference):{" "}
                  <span className="mono text-foreground">
                    ${marketPrice.toLocaleString()} ({symbol}
                    {(marketPrice * (fxRate ?? 1)).toLocaleString()})
                  </span>
                </>
              ) : (
                <>
                  Live {cryptoType} price:{" "}
                  <span className="mono text-foreground">${marketPrice.toLocaleString()}</span> · Your
                  price:{" "}
                  <span className="mono text-foreground">
                    {symbol}
                    {effectivePrice?.toFixed(2)}
                  </span>{" "}
                  per {cryptoType}
                </>
              )
            ) : marketPrices.error ? (
              <span className="text-destructive">
                Couldn't load the live market price: {(marketPrices.error as Error).message}
              </span>
            ) : fxRates.error ? (
              <span className="text-destructive">
                Couldn't load FX rates: {(fxRates.error as Error).message}
              </span>
            ) : (
              "Loading live market price…"
            )}
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Accepted payment methods</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                {methods.length === 0 ? "Select methods" : `${methods.length} selected`}
              </Button>
            </div>
            {methods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment methods selected yet.</p>
            ) : (
              <div className="space-y-2">
                {methods.map((m) => {
                  const matches = savedMethodsFor(m);
                  return (
                    <div key={m} className="space-y-1.5 rounded-md border border-border bg-muted/40 px-3 py-2">
                      <p className="text-sm font-medium">{m}</p>
                      {matches.length > 0 ? (
                        <Select
                          value={attachedDetails[m] ?? "__none"}
                          onValueChange={(v) =>
                            setAttachedDetails((prev) => ({ ...prev, [m]: v === "__none" ? "" : v }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Attach saved details (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Don't attach — coordinate via chat</SelectItem>
                            {matches.map((pm) => (
                              <SelectItem key={pm.id} value={pm.id}>
                                {pm.label || pm.method}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Attach a saved payment method to reveal its details to the buyer once escrow opens.{" "}
              <a href="/profile" className="text-primary hover:underline">
                Add one in your profile
              </a>
              .
            </p>
          </div>

          <PaymentMethodPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            selected={methods}
            onChange={setMethodsAndPrune}
          />

          <div className="space-y-2">
            <Label htmlFor="terms">Trade terms (optional)</Label>
            <Textarea
              id="terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Payment within 30 minutes. Send proof in the trade chat."
            />
          </div>

          {totalValue ? (
            <p className="text-sm text-muted-foreground">
              Total value:{" "}
              <span className="mono text-foreground">
                {symbol}
                {totalValue.toLocaleString()}
              </span>
            </p>
          ) : null}

          <Button className="w-full" disabled={busy} onClick={submit}>
            Publish offer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
