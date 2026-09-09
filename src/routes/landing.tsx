// Marketing landing page — kept but not wired into the active nav; the
// marketplace is the "/" homepage now. Still reachable directly at /landing
// in case it's needed again.
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, MessagesSquare, Users, ArrowRight, ArrowUpRight, Lock } from "lucide-react";
import { CoinIcon, COIN_FULL_NAME } from "@/components/coin-icon";
import { CRYPTO_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "CEMP — Peer-to-peer crypto trading with escrow" },
      {
        name: "description",
        content:
          "Browse buy and sell crypto offers, trade with any payment method, and settle safely with platform-held escrow. Testnet demo.",
      },
      { property: "og:title", content: "CEMP — Peer-to-peer crypto trading with escrow" },
      {
        property: "og:description",
        content:
          "Browse buy and sell crypto offers and settle safely with platform-held escrow. Testnet demo.",
      },
    ],
  }),
  component: LandingHero,
});

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

        <div className="relative mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 pb-4">
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
                <Link to="/">
                  Browse the Marketplace <ArrowRight className="size-4" />
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
