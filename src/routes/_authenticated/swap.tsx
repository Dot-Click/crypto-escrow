import { createFileRoute } from "@tanstack/react-router";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/swap")({
  head: () => ({
    meta: [
      { title: "Swap — CEMP" },
      { name: "description", content: "Instantly convert between coins in your CEMP wallet." },
    ],
  }),
  component: SwapPage,
});

function SwapPage() {
  const qc = useQueryClient();
  const [fromCrypto, setFromCrypto] = useState("BTC");
  const [toCrypto, setToCrypto] = useState("ETH");
  const [amount, setAmount] = useState("");

  const fetchWallet = useServerFn(getWalletOverview);
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => fetchWallet() });
  const fromBalance = wallet.data?.wallets.find((w) => w.crypto_type === fromCrypto)?.balance ?? 0;

  const fetchQuote = useServerFn(quoteSwap);
  const amountNum = Number(amount);
  const quote = useQuery({
    queryKey: ["swap-quote", fromCrypto, toCrypto, amount],
    queryFn: () => fetchQuote({ data: { fromCrypto, toCrypto, fromAmount: amountNum } }),
    enabled: fromCrypto !== toCrypto && Number.isFinite(amountNum) && amountNum > 0,
    refetchInterval: 15_000,
  });

  const swapFn = useServerFn(swap);
  const doSwap = useMutation({
    mutationFn: () => swapFn({ data: { fromCrypto, toCrypto, fromAmount: amountNum } }),
    onSuccess: (res) => {
      toast.success(`Swapped for ${res.toAmount.toFixed(8)} ${toCrypto}`);
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["wallet"] });
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
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Swap</CardTitle>
          <CardDescription>
            Instantly convert between coins in your wallet at the live market rate —{" "}
            {SWAP_FEE_PERCENT > 0 ? `${SWAP_FEE_PERCENT}% fee` : "free"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
