import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, Plus, Tag, User } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

// The logo already links to "/" (the marketplace), so there's no separate
// "Marketplace" nav item — everything below needs an account, so it's only
// added to the nav when signed in.
const AUTH_NAV = [
  { to: "/trades", label: "Trades" },
  { to: "/wallet", label: "Wallet" },
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
] as const;


export function SiteHeader() {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const nav = [
    ...(user ? AUTH_NAV : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin" } as const] : []),
  ];

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
        key={item.to}
        to={item.to}
        onClick={onClick}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        activeProps={{ className: "text-sm text-foreground font-medium" }}
      >
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
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center">
          <img src="/logo.svg" alt="CEMP" className="h-6 w-auto" />
        </Link>

        <nav className="ml-6 hidden items-center gap-6 md:flex">{links()}</nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/listings/new">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Create Offer</span>
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/offers">
                  <Tag className="size-4" />
                  <span className="hidden sm:inline">My Offers</span>
                </Link>
              </Button>

              <div className="h-6 w-px bg-border" />

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
                    <Link
                      to="/listings/new"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 text-sm font-medium text-foreground"
                    >
                      <Plus className="size-4" /> Create Offer
                    </Link>
                    <Link
                      to="/offers"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 text-sm font-medium text-foreground"
                    >
                      <Tag className="size-4" /> My Offers
                    </Link>
                    {links(() => setOpen(false))}
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
