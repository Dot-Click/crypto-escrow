import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
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

/** Search + multi-select for the countries a seller wants to block from an
 * otherwise-global offer — the reverse of picking one country to target. */
export function CountryBlockPicker({
  open,
  onOpenChange,
  selected,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [search]);

  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };

  const close = () => {
    setSearch("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Block countries</DialogTitle>
        </DialogHeader>
        <Input placeholder="Search countries" value={search} onChange={(e) => setSearch(e.target.value)} />
        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((code) => {
              const c = COUNTRIES.find((x) => x.code === code);
              return (
                <Badge key={code} variant="secondary" className="gap-1 font-normal">
                  <span className={`fi fi-${code.toLowerCase()}`} aria-hidden />
                  {c?.name ?? code}
                  <button type="button" onClick={() => toggle(code)} aria-label={`Unblock ${c?.name ?? code}`}>
                    <X className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        ) : null}
        <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
          {filtered.map((c) => {
            const isSelected = selected.includes(c.code);
            return (
              <button
                key={c.code}
                type="button"
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                  isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
                onClick={() => toggle(c.code)}
              >
                <span className="flex items-center gap-2">
                  <span className={`fi fi-${c.code.toLowerCase()}`} aria-hidden />
                  {c.name}
                </span>
                {isSelected ? <Badge>Blocked</Badge> : null}
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No matches</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
