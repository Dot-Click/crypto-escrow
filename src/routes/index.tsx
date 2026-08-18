import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, ShieldCheck, Wallet, MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CRYPTO_TYPES, PAYMENT_METHODS } from "@/lib/constants";
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
      { title: "EscrowP2P — Peer-to-peer crypto trading with escrow" },
      {
        name: "description",
        content:
          "Browse buy and sell crypto offers, trade with any payment method, and settle safely with platform-held escrow. Testnet demo.",
      },
      { property: "og:title", content: "EscrowP2P — Peer-to-peer crypto trading with escrow" },
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
  const { user } = useAuth();
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [crypto, setCrypto] = useState("all");
  const [method, setMethod] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

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

  const rows = useMemo(() => {
    let out = (listings.data ?? []).filter((l) => l.side === side);
    if (crypto !== "all") out = out.filter((l) => l.crypto_type === crypto);
    if (method !== "all") out = out.filter((l) => l.accepted_payment_methods.includes(method));
    if (minPrice) out = out.filter((l) => Number(l.price) >= Number(minPrice));
    if (maxPrice) out = out.filter((l) => Number(l.price) <= Number(maxPrice));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (l) =>
          l.crypto_type.toLowerCase().includes(q) ||
          l.accepted_payment_methods.join(" ").toLowerCase().includes(q) ||
          (l.terms ?? "").toLowerCase().includes(q),
      );
    }
    if (sort === "price_asc") out = [...out].sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price_desc") out = [...out].sort((a, b) => Number(b.price) - Number(a.price));
    return out;
  }, [listings.data, side, crypto, method, minPrice, maxPrice, search, sort]);

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
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any method</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="min">Min price</Label>
                <Input
                  id="min"
                  inputMode="decimal"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max">Max price</Label>
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
              return (
                <Card key={l.id}>
                  <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">
                          {l.amount} {l.crypto_type}
                        </span>
                        <Badge variant="outline">{counterparty?.display_name ?? "Trader"}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {counterparty?.trades_completed ?? 0} trades
                        </span>
                      </div>
                      <p className="mono text-sm text-muted-foreground">
                        ${Number(l.price).toLocaleString()} per {l.crypto_type} · total $
                        {(Number(l.price) * Number(l.amount)).toLocaleString()}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {l.accepted_payment_methods.map((m) => (
                          <Badge key={m} variant="secondary" className="font-normal">
                            {m}
                          </Badge>
                        ))}
                      </div>
                      {l.terms ? (
                        <p className="max-w-prose text-xs text-muted-foreground">{l.terms}</p>
                      ) : null}
                    </div>
                    <Button className="w-full sm:w-auto" disabled>
                      Start trade
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
          <p className="pt-1 text-center text-xs text-muted-foreground">
            Trade rooms and escrow arrive in the next phase.
          </p>
        </div>
      </div>
    </div>
  );
}

function LandingHero() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <div className="text-center">
        <Badge variant="outline" className="mb-4">
          Testnet demo · no real funds
        </Badge>
        <h1 className="text-3xl font-semibold sm:text-5xl">
          Trade crypto peer-to-peer, protected by escrow
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Sellers fund their platform wallet once. Escrow holds the crypto while buyers pay by bank
          transfer, gift card or any method the seller accepts — then it releases in one click.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: ShieldCheck,
            title: "Escrow hold",
            body: "Trade amounts lock inside the seller's wallet balance — an internal ledger hold, not a new on-chain transfer.",
          },
          {
            icon: Wallet,
            title: "Platform wallet",
            body: "Deposit from any external blockchain wallet, withdraw whenever your balance is free.",
          },
          {
            icon: MessagesSquare,
            title: "Trade rooms",
            body: "Real-time chat with payment proof attachments, unlocked once escrow is funded.",
          },
        ].map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <f.icon className="size-5 text-primary" />
              <CardTitle className="text-base">{f.title}</CardTitle>
              <CardDescription>{f.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
