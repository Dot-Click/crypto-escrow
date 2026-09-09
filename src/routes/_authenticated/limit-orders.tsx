import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { getWalletOverview } from "@/lib/wallet.functions";
import { getMarketPrices } from "@/lib/market.functions";
import { createLimitOrderFn, cancelLimitOrderFn, listMyLimitOrdersFn } from "@/lib/limit-orders.functions";
import { CRYPTO_TYPES, SWAP_FEE_PERCENT } from "@/lib/constants";
import { CoinIcon } from "@/components/coin-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/limit-orders")({
  head: () => ({
    meta: [
      { title: "Limit orders — CEMP" },
      {
        name: "description",
        content: "Set a target rate and swap automatically once the market reaches it.",
      },
    ],
  }),
  component: LimitOrdersPage,
});

const STATUS_TONE: Record<string, string> = {
  open: "border-primary/30 bg-primary/10 text-primary",
  filled: "border-green-600/30 bg-green-600/10 text-green-600",
  cancelled: "border-border bg-muted text-muted-foreground",
};

function LimitOrdersPage() {
  const qc = useQueryClient();
  const [fromCrypto, setFromCrypto] = useState("BTC");
  const [toCrypto, setToCrypto] = useState("ETH");
  const [amount, setAmount] = useState("");
  const [targetRate, setTargetRate] = useState("");

  const fetchWallet = useServerFn(getWalletOverview);
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => fetchWallet() });
  const fromBalance = wallet.data?.wallets.find((w) => w.crypto_type === fromCrypto)?.balance ?? 0;

  const fetchPrices = useServerFn(getMarketPrices);
  const prices = useQuery({ queryKey: ["market-prices"], queryFn: () => fetchPrices(), refetchInterval: 30_000 });
  const fromPrice = prices.data?.[fromCrypto];
  const toPrice = prices.data?.[toCrypto];
  const currentRate = fromPrice && toPrice && fromCrypto !== toCrypto ? fromPrice / toPrice : null;

  const fetchOrders = useServerFn(listMyLimitOrdersFn);
  const orders = useQuery({ queryKey: ["limit-orders"], queryFn: () => fetchOrders() });

  const createFn = useServerFn(createLimitOrderFn);
  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: { fromCrypto, toCrypto, fromAmount: Number(amount), targetRate: Number(targetRate) },
      }),
    onSuccess: () => {
      toast.success("Limit order placed");
      setAmount("");
      setTargetRate("");
      void qc.invalidateQueries({ queryKey: ["limit-orders"] });
      void qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelFn = useServerFn(cancelLimitOrderFn);
  const cancel = useMutation({
    mutationFn: (orderId: string) => cancelFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Order cancelled — funds returned to your balance");
      void qc.invalidateQueries({ queryKey: ["limit-orders"] });
      void qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amountNum = Number(amount);
  const rateNum = Number(targetRate);
  const insufficientBalance = amountNum > 0 && amountNum > fromBalance;
  const canCreate =
    fromCrypto !== toCrypto &&
    amountNum > 0 &&
    rateNum > 0 &&
    !insufficientBalance;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Limit orders</h1>
        <p className="text-sm text-muted-foreground">
          Set a target rate — filled automatically once the market reaches it, minus a {SWAP_FEE_PERCENT}% fee.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">New order</CardTitle>
            <CardDescription>Funds are held from your balance until filled or cancelled.</CardDescription>
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
                  <SelectTrigger className="w-28 shrink-0">
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
                  placeholder="Amount"
                />
              </div>
              {insufficientBalance ? (
                <p className="text-xs text-destructive">Not enough {fromCrypto} available.</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={toCrypto} onValueChange={setToCrypto}>
                <SelectTrigger>
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
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="target-rate">Target rate ({toCrypto} per {fromCrypto})</Label>
                {currentRate ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setTargetRate(currentRate.toFixed(8))}
                  >
                    Use current
                  </button>
                ) : null}
              </div>
              <Input
                id="target-rate"
                inputMode="decimal"
                value={targetRate}
                onChange={(e) => setTargetRate(e.target.value)}
                placeholder={currentRate ? currentRate.toFixed(8) : "0.00"}
              />
              {currentRate ? (
                <p className="text-xs text-muted-foreground">
                  Current rate: 1 {fromCrypto} ≈ {currentRate.toFixed(8)} {toCrypto}
                </p>
              ) : null}
            </div>

            {fromCrypto === toCrypto ? (
              <p className="text-xs text-muted-foreground">Choose two different coins.</p>
            ) : null}

            <Button className="w-full" disabled={!canCreate || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Placing order…" : "Place limit order"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {orders.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading orders…</p>
          ) : (orders.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No limit orders yet.
              </CardContent>
            </Card>
          ) : (
            (orders.data ?? []).map((o) => (
              <Card key={o.id}>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <CoinIcon code={o.from_crypto} className="size-4" />
                        {o.from_amount} {o.from_crypto}
                        <span className="text-muted-foreground">→</span>
                        <CoinIcon code={o.to_crypto} className="size-4" />
                        {o.to_crypto}
                      </span>
                      <Badge variant="outline" className={STATUS_TONE[o.status]}>
                        {o.status}
                      </Badge>
                    </div>
                    <p className="mono text-xs text-muted-foreground">
                      Target: 1 {o.from_crypto} ≥ {o.target_rate} {o.to_crypto}
                      {o.status === "filled" && o.filled_amount != null
                        ? ` · Received ${o.filled_amount.toFixed(8)} ${o.to_crypto}`
                        : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()}
                    </p>
                  </div>
                  {o.status === "open" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(o.id)}
                    >
                      <X className="size-3.5" /> Cancel
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
