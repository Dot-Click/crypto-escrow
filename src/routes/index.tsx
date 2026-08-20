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
} from "lucide-react";
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
  const [activeListing, setActive] = useState<ListingRow | null>(null);

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

      <StartTradeDialog listing={activeListing} onClose={() => setActive(null)} />
    </div>
  );
}

type ListingRow = {
  id: string;
  side: string;
  crypto_type: string;
  amount: number | string;
  price: number | string;
  accepted_payment_methods: string[];
};

function StartTradeDialog({
  listing,
  onClose,
}: {
  listing: ListingRow | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createTrade);
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState("");

  const max = Number(listing?.amount ?? 0);
  const price = Number(listing?.price ?? 0);
  const parsed = Number(amount);
  const valid = listing && payment && parsed > 0 && parsed <= max;

  const start = useMutation({
    mutationFn: async () => {
      if (!listing) throw new Error("No offer selected");
      return create({
        data: { listingId: listing.id, amount: parsed, paymentMethod: payment },
      });
    },
    onSuccess: (res) => {
      toast.success("Trade opened — crypto is now held in escrow");
      void qc.invalidateQueries({ queryKey: ["trades"] });
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      onClose();
      setAmount("");
      setPayment("");
      navigate({ to: "/trades/$tradeId", params: { tradeId: res.tradeId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!listing} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Start trade · {listing?.crypto_type}
          </DialogTitle>
          <DialogDescription>
            {listing?.side === "sell"
              ? "You buy crypto. Escrow holds the seller's balance until you pay and they release."
              : "You sell crypto. Escrow holds your wallet balance until the buyer pays."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trade-amount">
              Amount ({listing?.crypto_type}) · max {max}
            </Label>
            <Input
              id="trade-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(max)}
            />
            {parsed > 0 ? (
              <p className="mono text-xs text-muted-foreground">
                ≈ ${(parsed * price).toLocaleString()} total
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a method" />
              </SelectTrigger>
              <SelectContent>
                {(listing?.accepted_payment_methods ?? []).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
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

const COIN_GLYPH: Record<string, string> = { BTC: "B", ETH: "Ξ", LTC: "Ł", USDT: "T" };
const COIN_FULL_NAME: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  LTC: "Litecoin",
  USDT: "Tether",
};

function CoinIcon({ code, className }: { code: string; className?: string }) {
  if (code === "ETH") {
    // Ethereum's diamond silhouette — geometric, no font-glyph risk.
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M12 2.5 L18.5 12.5 L12 16.2 L5.5 12.5 Z" strokeLinejoin="round" />
        <path d="M12 16.2 L18.5 12.5 L12 21.5 L5.5 12.5 Z" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="currentColor"
        fontFamily="var(--font-monospace)"
      >
        {COIN_GLYPH[code] ?? code[0]}
      </text>
    </svg>
  );
}

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
                  <span className="flex size-16 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground backdrop-blur lg:size-20">
                    <CoinIcon code={c.code} className="size-7 lg:size-9" />
                  </span>
                  <span className="text-xs text-muted-foreground/40">{COIN_FULL_NAME[c.code] ?? c.code}</span>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute right-2 top-1/3 hidden flex-col gap-6 md:flex lg:-right-16 xl:-right-36">
              {CRYPTO_TYPES.slice(2, 4).map((c) => (
                <div key={c.code} className="flex flex-col items-center gap-1.5">
                  <span className="flex size-16 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground backdrop-blur lg:size-20">
                    <CoinIcon code={c.code} className="size-7 lg:size-9" />
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
