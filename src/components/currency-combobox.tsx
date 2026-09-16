import { useState } from "react";
import { Check, ChevronsUpDown, Wallet } from "lucide-react";
import { CURRENCIES } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// USD/EUR/GBP cover the large majority of listings — surfacing them above the
// full alphabetical list saves a search for the common case, same pattern as
// a country picker's "most popular" shortcut.
const POPULAR_CODES = ["USD", "EUR", "GBP"] as const;
const POPULAR_REGION: Record<string, string> = {
  USD: "Global",
  EUR: "European Union",
  GBP: "United Kingdom",
};

/** Currency <Select> replacement with search — scrolling a plain dropdown
 * through 100+ currencies to find one isn't workable. Pass `includeAny` to
 * also offer an "Any fiat" option (used by the marketplace's currency filter,
 * where no single currency is selected). */
export function CurrencyCombobox({
  value,
  onChange,
  includeAny = false,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  includeAny?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const isAny = includeAny && value === "all";
  const selected = CURRENCIES.find((c) => c.code === value);
  const popular = POPULAR_CODES.map((code) => CURRENCIES.find((c) => c.code === code)!).filter(Boolean);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          {isAny ? (
            <span className="flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" />
              Any Fiat
            </span>
          ) : selected ? (
            <span className="flex items-center gap-2">
              <span className={`fi fi-${selected.flagCode} text-base`} aria-hidden />
              {selected.code}
            </span>
          ) : (
            <span className="text-muted-foreground">Select currency…</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup heading="Most popular">
              {popular.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.code} ${c.label}`}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                >
                  <span className={`fi fi-${c.flagCode} text-base`} aria-hidden />
                  <span className="ml-2">
                    <span className="block font-medium">{c.code}</span>
                    <span className="block text-xs text-muted-foreground">{POPULAR_REGION[c.code]}</span>
                  </span>
                  <Check className={cn("ml-auto size-4", value === c.code ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="All currencies">
              {includeAny ? (
                <CommandItem
                  value="any fiat all currencies"
                  onSelect={() => {
                    onChange("all");
                    setOpen(false);
                  }}
                >
                  <Wallet className="size-4 text-muted-foreground" />
                  <span className="ml-2 font-medium">Any fiat</span>
                  <Check className={cn("ml-auto size-4", isAny ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ) : null}
              {CURRENCIES.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.code} ${c.label}`}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                >
                  <span className={`fi fi-${c.flagCode} text-base`} aria-hidden />
                  <span className="ml-2">
                    <span className="block font-medium">{c.code}</span>
                    <span className="block text-xs text-muted-foreground">{c.label}</span>
                  </span>
                  <Check className={cn("ml-auto size-4", value === c.code ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
