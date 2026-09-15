// Instant coin-to-coin swap, as a modal — not a page, so it can be opened
// from wherever a "Swap" action makes sense (nav bar, a specific wallet
// card) without navigating away from whatever the user was looking at.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDownUp } from "lucide-react";
import { getWalletOverview } from "@/lib/wallet.functions";
import { quoteSwap, swap } from "@/lib/swap.functions";
import { CRYPTO_TYPES, SWAP_FEE_PERCENT } from "@/lib/constants";
import { CoinIcon } from "@/components/coin-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SwapDialog({
  open,
  onOpenChange,
  defaultFrom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultFrom?: string;
}) {
  const qc = useQueryClient();
  const [fromCrypto, setFromCrypto] = useState(defaultFrom ?? "BTC");
  const [toCrypto, setToCrypto] = useState((defaultFrom ?? "BTC") === "ETH" ? "BTC" : "ETH");
  const [amount, setAmount] = useState("");

  // Re-seed the pair every time the dialog opens — it may be opened for a
  // different "from" coin than last time (a specific wallet card's button).
  useEffect(() => {
    if (!open) return;
    const initialFrom = defaultFrom && CRYPTO_TYPES.some((c) => c.code === defaultFrom) ? defaultFrom : "BTC";
    setFromCrypto(initialFrom);
    setToCrypto(initialFrom === "ETH" ? "BTC" : "ETH");
    setAmount("");
  }, [open, defaultFrom]);

  const fetchWallet = useServerFn(getWalletOverview);
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => fetchWallet(), enabled: open });
  const fromBalance = wallet.data?.wallets.find((w) => w.crypto_type === fromCrypto)?.balance ?? 0;

  const fetchQuote = useServerFn(quoteSwap);
  const amountNum = Number(amount);
  const quote = useQuery({
    queryKey: ["swap-quote", fromCrypto, toCrypto, amount],
    queryFn: () => fetchQuote({ data: { fromCrypto, toCrypto, fromAmount: amountNum } }),
    enabled: open && fromCrypto !== toCrypto && Number.isFinite(amountNum) && amountNum > 0,
    refetchInterval: 15_000,
  });

  const swapFn = useServerFn(swap);
  const doSwap = useMutation({
    mutationFn: () => swapFn({ data: { fromCrypto, toCrypto, fromAmount: amountNum } }),
    onSuccess: (res) => {
      toast.success(`Swapped for ${res.toAmount.toFixed(8)} ${toCrypto}`);
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      void qc.invalidateQueries({ queryKey: ["wallet-overview"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flip = () => {
    setFromCrypto(toCrypto);
    setToCrypto(fromCrypto);
    setAmount("");
  };

  // Currency select changed underneath the amount the user typed — clear a
  // now-stale quote rather than show a receive amount for a different pair.
  useEffect(() => {
    setAmount("");
  }, [fromCrypto, toCrypto]);

  const insufficientBalance = amountNum > 0 && amountNum > fromBalance;
  const canSwap = fromCrypto !== toCrypto && amountNum > 0 && !insufficientBalance && !!quote.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Swap</DialogTitle>
          <DialogDescription>
            Instantly convert between coins in your wallet at the live market rate —{" "}
            {SWAP_FEE_PERCENT > 0 ? `${SWAP_FEE_PERCENT}% fee` : "free"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            Just a quick note regarding your swapped balance: you can use it for trades on our
            platform, but it cannot be withdrawn or sent to other users because we are not a
            crypto exchange. If you wish to withdraw, please convert the amount back to the
            original cryptocurrency first.
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>From</Label>
              <span className="text-xs text-muted-foreground">
                Balance: {fromBalance.toFixed(8)} {fromCrypto}
              </span>
            </div>
            <div className="flex gap-2">
              <Select value={fromCrypto} onValueChange={setFromCrypto}>
                <SelectTrigger className="w-32 shrink-0">
                  <span className="flex items-center gap-2">
                    <CoinIcon code={fromCrypto} className="size-4" />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {CRYPTO_TYPES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <CoinIcon code={c.code} className="size-4" />
                        {c.code}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-xs"
                onClick={() => setAmount(String(fromBalance))}
              >
                MAX
              </Button>
            </div>
            {insufficientBalance ? (
              <p className="text-xs text-destructive">Not enough {fromCrypto} available.</p>
            ) : null}
          </div>

          <div className="flex justify-center">
            <Button type="button" variant="outline" size="icon" onClick={flip} aria-label="Flip coins">
              <ArrowDownUp className="size-4" />
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>To</Label>
            <div className="flex gap-2">
              <Select value={toCrypto} onValueChange={setToCrypto}>
                <SelectTrigger className="w-32 shrink-0">
                  <span className="flex items-center gap-2">
                    <CoinIcon code={toCrypto} className="size-4" />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {CRYPTO_TYPES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <CoinIcon code={c.code} className="size-4" />
                        {c.code}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mono flex flex-1 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                {quote.data ? quote.data.toAmount.toFixed(8) : "0.00"}
              </div>
            </div>
          </div>

          {fromCrypto === toCrypto ? (
            <p className="text-xs text-muted-foreground">Choose two different coins.</p>
          ) : quote.data ? (
            <p className="text-xs text-muted-foreground">
              1 {fromCrypto} ≈ {quote.data.rate.toFixed(8)} {toCrypto} ·{" "}
              {SWAP_FEE_PERCENT > 0 ? `${SWAP_FEE_PERCENT}% fee included` : "no fee"}
            </p>
          ) : quote.isError ? (
            <p className="text-xs text-destructive">{(quote.error as Error).message}</p>
          ) : null}

          <Button className="w-full" disabled={!canSwap || doSwap.isPending} onClick={() => doSwap.mutate()}>
            {doSwap.isPending ? "Swapping…" : "Swap"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
