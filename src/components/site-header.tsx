import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, LayoutGrid, LogOut, Menu, Repeat, Settings, Tag, User, Wallet } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ADMIN_TABS } from "@/lib/admin-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Marketplace and Swap are both top-level, one-click destinations — relying
// on the logo alone to reach the marketplace, or burying Swap inside the
// Wallet page, made both too easy to miss (client feedback).
const AUTH_NAV = [
  { to: "/", label: "Marketplace", icon: LayoutGrid, search: {}, strictActive: false },
  { to: "/trades", label: "My Trades", icon: ArrowLeftRight, search: {}, strictActive: false },
  { to: "/offers", label: "My Offers", icon: Tag, search: {}, strictActive: false },
  { to: "/wallet", label: "Wallet", icon: Wallet, search: {}, strictActive: false },
  { to: "/swap", label: "Swap", icon: Repeat, search: {}, strictActive: false },
] as const;

// Admins get their own dedicated nav — the admin dashboard's sections,
// not the trader-facing Marketplace/Wallet/Swap links (client feedback:
// the nav looked identical for admins and regular traders).
const ADMIN_NAV = ADMIN_TABS.map((tab) => ({
  to: "/admin" as const,
  label: tab.label,
  icon: tab.icon,
  // Overview is the default tab (no ?tab= in the URL), so its link points at
  // an empty search — that's what makes it (and only it) match "/admin" bare.
  search: tab.value === "overview" ? {} : { tab: tab.value },
  // Every admin link shares the same "/admin" pathname, so only an exact
  // search match tells them apart — unlike the trader nav below, which
  // still wants prefix matching (e.g. a trade detail page keeps "My Trades" lit).
  strictActive: true,
}));

export function SiteHeader() {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const nav = !user ? [] : isAdmin ? ADMIN_NAV : AUTH_NAV;

  // The marketing hero (now at "/landing", not the "/" homepage anymore)
  // has its own dark background and glow — the header floats transparently
  // over it there. Every other page, including the marketplace at "/", gets
  // the solid, sticky bar since they don't have hero art behind them.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/landing";

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const links = (onClick?: () => void) =>
    nav.map((item) => (
      <Link
        key={`${item.to}:${item.label}`}
        to={item.to}
        search={item.search}
        onClick={onClick}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        activeProps={{ className: "flex items-center gap-1.5 text-sm text-foreground font-medium" }}
        activeOptions={item.strictActive ? { exact: true, includeSearch: true } : { exact: false }}
      >
        <item.icon className="size-4" />
        {item.label}
      </Link>
    ));

  return (
    <header
      className={
        isHome
          ? "absolute inset-x-0 top-0 z-40 border-b border-transparent bg-transparent"
          : "sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur"
      }
    >
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-4 px-4">
        <Link to="/" className="flex items-center">
          <img src="/logo.png" alt="CEMP" className="h-10 w-auto" />
        </Link>

        <nav className="ml-6 hidden items-center gap-6 md:flex">{links()}</nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {profile?.display_name ?? "Trader"}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label="Account menu"
                  >
                    <UserAvatar
                      userId={user.id}
                      displayName={profile?.display_name ?? "Trader"}
                      className="size-8"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                    {profile?.display_name ?? "Trader"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="cursor-pointer">
                      <User className="size-4" /> Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">
                      <Settings className="size-4" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64">
                  <nav className="mt-10 flex flex-col gap-5">
                    {links(() => setOpen(false))}
                    <Link
                      to="/settings"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 text-sm font-medium text-foreground"
                    >
                      <Settings className="size-4" /> Settings
                    </Link>
                  </nav>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
