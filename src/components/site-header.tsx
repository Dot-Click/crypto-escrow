import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/", label: "Marketplace" },
  { to: "/listings/new", label: "Create Offer" },
  { to: "/trades", label: "Trades" },
  { to: "/wallet", label: "Wallet" },
  { to: "/profile", label: "Profile" },
] as const;


export function SiteHeader() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const links = (onClick?: () => void) =>
    NAV.map((item) => (
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-primary" />
          <span>EscrowP2P</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-6 md:flex">{user ? links() : null}</nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {profile?.display_name ?? user.email}
              </span>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64">
                  <nav className="mt-10 flex flex-col gap-5">{links(() => setOpen(false))}</nav>
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
