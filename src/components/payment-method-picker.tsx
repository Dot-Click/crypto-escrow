import { useMemo, useState } from "react";
import { ChevronRight, ArrowLeft, X } from "lucide-react";
import { PAYMENT_RAILS, methodString, railLabelForMethod, providerForMethod } from "@/lib/payment-taxonomy";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * Category → provider picker, mirroring a "pick a payment rail, then pick a
 * specific provider" flow. `multiple` controls whether more than one method
 * can be selected at once.
 */
export function PaymentMethodPicker({
  open,
  onOpenChange,
  selected,
  onChange,
  multiple = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  onChange: (methods: string[]) => void;
  multiple?: boolean;
}) {
  const [activeRailKey, setActiveRailKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [railSearch, setRailSearch] = useState("");

  const activeRail = PAYMENT_RAILS.find((r) => r.key === activeRailKey) ?? null;

  const filteredProviders = useMemo(() => {
    if (!activeRail) return [];
    const q = search.trim().toLowerCase();
    if (!q) return activeRail.providers;
    return activeRail.providers.filter((p) => p.toLowerCase().includes(q));
  }, [activeRail, search]);

  // Top-level search: matches a provider anywhere across every rail, so
  // users can jump straight to e.g. "PayPal" without first tapping into
  // "Online wallets".
  const railSearchResults = useMemo(() => {
    const q = railSearch.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{ rail: (typeof PAYMENT_RAILS)[number]; provider: string }> = [];
    for (const rail of PAYMENT_RAILS) {
      for (const provider of rail.providers) {
        if (provider.toLowerCase().includes(q) || rail.label.toLowerCase().includes(q)) {
          results.push({ rail, provider });
        }
      }
    }
    return results;
  }, [railSearch]);

  const toggle = (method: string) => {
    if (selected.includes(method)) {
      onChange(selected.filter((m) => m !== method));
      return;
    }
    onChange(multiple ? [...selected, method] : [method]);
  };

  const close = () => {
    setActiveRailKey(null);
    setSearch("");
    setRailSearch("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        {!activeRail ? (
          <>
            <DialogHeader>
              <DialogTitle>Payment method</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Search all payment methods"
              value={railSearch}
              onChange={(e) => setRailSearch(e.target.value)}
            />
            {railSearch.trim() ? (
              <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
                {railSearchResults.map(({ rail, provider }) => {
                  const method = methodString(rail.label, provider);
                  const isSelected = selected.includes(method);
                  return (
                    <button
                      key={method}
                      type="button"
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => toggle(method)}
                    >
                      <span className="flex items-center gap-2">
                        <PaymentRailIcon railKey={rail.key} className="size-4 text-muted-foreground" />
                        {provider}
                        <span className="text-xs text-muted-foreground">{rail.label}</span>
                      </span>
                      {isSelected ? <Badge>Selected</Badge> : null}
                    </button>
                  );
                })}
                {railSearchResults.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No matches</p>
                ) : null}
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {PAYMENT_RAILS.map((rail) => {
                  const count = selected.filter((m) => railLabelForMethod(m) === rail.label).length;
                  return (
                    <button
                      key={rail.key}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2.5 text-left text-sm hover:bg-muted/50"
                      onClick={() => setActiveRailKey(rail.key)}
                    >
                      <span className="flex items-center gap-2">
                        <PaymentRailIcon railKey={rail.key} className="size-4 text-muted-foreground" />
                        {rail.label}
                        <span className="text-xs text-muted-foreground">{rail.providers.length}</span>
                        {count > 0 ? <Badge variant="secondary">{count} selected</Badge> : null}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            )}
            <DialogFooter>
              <Button className="w-full" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRailKey(null);
                    setSearch("");
                  }}
                  aria-label="Back"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <DialogTitle className="flex items-center gap-2">
                  <PaymentRailIcon railKey={activeRail.key} className="size-4" />
                  {activeRail.label}
                </DialogTitle>
              </div>
            </DialogHeader>
            <Input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {selected.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((m) => (
                  <Badge key={m} variant="secondary" className="gap-1 font-normal">
                    {providerForMethod(m)}
                    <button type="button" onClick={() => toggle(m)} aria-label={`Remove ${m}`}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
              {filteredProviders.map((provider) => {
                const method = methodString(activeRail.label, provider);
                const isSelected = selected.includes(method);
                return (
                  <button
                    key={provider}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => toggle(method)}
                  >
                    {provider}
                    {isSelected ? <Badge>Selected</Badge> : null}
                  </button>
                );
              })}
              {filteredProviders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No matches</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button className="w-full" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
