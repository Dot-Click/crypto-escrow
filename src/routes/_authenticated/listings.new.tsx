import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CRYPTO_TYPES, PAYMENT_METHODS } from "@/lib/constants";
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
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (m: string) =>
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const submit = async () => {
    if (!user) return;
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    if (!price || Number(price) <= 0) {
      toast.error("Enter a price greater than zero");
      return;
    }
    if (methods.length === 0) {
      toast.error("Select at least one payment method");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("listings").insert({
      seller_id: user.id,
      side,
      crypto_type: cryptoType,
      amount: Number(amount),
      price: Number(price),
      accepted_payment_methods: methods,
      terms: terms || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
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
              <Label htmlFor="amount">Amount ({cryptoType})</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.05"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price per {cryptoType} (USD)</Label>
              <Input
                id="price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="64000"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Accepted payment methods</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
                >
                  <Checkbox checked={methods.includes(m)} onCheckedChange={() => toggle(m)} />
                  {m}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms">Trade terms (optional)</Label>
            <Textarea
              id="terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Payment within 30 minutes. Send proof in the trade chat."
            />
          </div>

          {amount && price ? (
            <p className="text-sm text-muted-foreground">
              Total value:{" "}
              <span className="mono text-foreground">
                ${(Number(amount) * Number(price)).toLocaleString()}
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
