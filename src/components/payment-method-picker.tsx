import { useMemo, useState } from "react";
import { ChevronRight, ArrowLeft, X } from "lucide-react";
import { PAYMENT_RAILS, methodString, railLabelForMethod, providerForMethod } from "@/lib/payment-taxonomy";
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

  const activeRail = PAYMENT_RAILS.find((r) => r.key === activeRailKey) ?? null;

  const filteredProviders = useMemo(() => {
    if (!activeRail) return [];
    const q = search.trim().toLowerCase();
    if (!q) return activeRail.providers;
    return activeRail.providers.filter((p) => p.toLowerCase().includes(q));
  }, [activeRail, search]);

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
                      {rail.label}
                      <span className="text-xs text-muted-foreground">{rail.providers.length}</span>
                      {count > 0 ? <Badge variant="secondary">{count} selected</Badge> : null}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
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
                <DialogTitle>{activeRail.label}</DialogTitle>
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
