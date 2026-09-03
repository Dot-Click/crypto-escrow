/**
 * Trader tier, derived purely from `profiles.trades_completed` — the one
 * trust signal this build actually tracks. Deliberately not calling any
 * tier "Verified": that implies KYC, which doesn't exist yet. Thresholds
 * are a starting point, not a finalized product decision.
 */
export type TraderLevel = {
  label: string;
  /** Tailwind classes for a small filled badge, tuned per tier so higher tiers read as more prestigious. */
  className: string;
};

const FALLBACK: TraderLevel = { label: "New trader", className: "border-transparent bg-muted text-muted-foreground" };

// Ordered highest → lowest; FALLBACK covers 0 so this list only needs the tiers above it.
const LEVELS: { min: number; label: string; className: string }[] = [
  { min: 100, label: "Platinum", className: "border-transparent bg-sky-500/15 text-sky-400" },
  { min: 25, label: "Veteran", className: "border-transparent bg-violet-500/15 text-violet-400" },
  { min: 3, label: "Trusted", className: "border-transparent bg-emerald-500/15 text-emerald-400" },
];

export function traderLevel(tradesCompleted: number): TraderLevel {
  const tier = LEVELS.find((l) => tradesCompleted >= l.min);
  return tier ? { label: tier.label, className: tier.className } : FALLBACK;
}
