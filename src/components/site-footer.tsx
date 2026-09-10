import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

// Public, unauthenticated pages — grows as more of them ship (fees, FAQ, terms…).
const PUBLIC_PAGES = [
  { to: "/transparency", label: "Transparency" },
  { to: "/fees", label: "Fees" },
] as const;

export function SiteFooter() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The logged-out "/" route is a single-screen hero (see LandingHero) —
  // appending a footer there pushes it past one viewport, which the hero's
  // own layout deliberately avoids.
  if (!user && pathname === "/") return null;

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>CEMP (C) {new Date().getFullYear()} · testnet demo, no real funds</span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {PUBLIC_PAGES.map((p) => (
            <Link key={p.to} to={p.to} className="transition-colors hover:text-foreground">
              {p.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
