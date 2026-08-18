import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Copy, Lock } from "lucide-react";
import {
  getDepositAddress,
  getWalletOverview,
  requestWithdrawal,
} from "@/lib/wallet.functions";
import { CRYPTO_TYPES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — deposits, withdrawals & escrow holds | EscrowP2P" },
      {
        name: "description",
        content:
          "Fund your EscrowP2P testnet wallet from an external blockchain address, withdraw free balance, and track every escrow hold in the ledger.",
      },
      { property: "og:title", content: "Wallet — deposits, withdrawals & escrow holds" },
      {
        property: "og:description",
        content: "Fund your testnet wallet, withdraw free balance, and track escrow holds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

const TYPE_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  escrow_hold: "Escrow hold",
  escrow_release: "Escrow release",
  escrow_refund: "Escrow refund",
};

function WalletPage() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getWalletOverview);
  const fetchAddress = useServerFn(getDepositAddress);
  const submitWithdrawal = useServerFn(requestWithdrawal);

  const [depositCoin, setDepositCoin] = useState<string | null>(null);
  const [withdrawCoin, setWithdrawCoin] = useState(CRYPTO_TYPES[0].code as string);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");

  const overview = useQuery({
    queryKey: ["wallet-overview"],
    queryFn: () => fetchOverview(),
  });

  const depositMutation = useMutation({
    mutationFn: (cryptoType: string) => fetchAddress({ data: { cryptoType } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wallet-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdrawMutation = useMutation({
    mutationFn: () =>
      submitWithdrawal({
        data: { cryptoType: withdrawCoin, amount: Number(amount), address: address.trim() },
      }),
    onSuccess: (res) => {
      setAmount("");
      setAddress("");
      void qc.invalidateQueries({ queryKey: ["wallet-overview"] });
      toast.success(
        res.pendingManualReview
          ? "Withdrawal queued — it will settle once payouts are enabled."
          : "Withdrawal submitted to the network.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wallets = overview.data?.wallets ?? [];
  const activeWallet = wallets.find((w) => w.crypto_type === depositCoin);
  const withdrawWallet = wallets.find((w) => w.crypto_type === withdrawCoin);
  const availableToWithdraw = withdrawWallet
    ? withdrawWallet.balance - withdrawWallet.held_balance
    : 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Wallet</h1>
        <p className="text-sm text-muted-foreground">
          Testnet balances. Escrow holds lock part of your balance until a trade resolves.
        </p>
      </div>

      {overview.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading balances…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {wallets.map((w) => {
              const free = w.balance - w.held_balance;
              return (
                <Card key={w.id}>
                  <CardContent className="space-y-3 py-5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{w.crypto_type}</span>
                      {w.held_balance > 0 ? (
                        <Badge variant="secondary" className="gap-1 font-normal">
                          <Lock className="size-3" />
                          {w.held_balance} in escrow
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mono text-2xl">{free}</p>
                    <p className="text-xs text-muted-foreground">
                      Available of {w.balance} {w.crypto_type} total
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setDepositCoin(w.crypto_type);
                        if (!w.external_deposit_address) depositMutation.mutate(w.crypto_type);
                      }}
                    >
                      <ArrowDownToLine className="size-4" /> Deposit {w.crypto_type}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowUpFromLine className="size-4" /> Withdraw to an external wallet
              </CardTitle>
              <CardDescription>
                Only free balance can be withdrawn — escrow holds stay locked.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  withdrawMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>Coin</Label>
                  <Select value={withdrawCoin} onValueChange={setWithdrawCoin}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRYPTO_TYPES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wd-address">Destination address</Label>
                  <Input
                    id="wd-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="tb1q…"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wd-amount">Amount</Label>
                  <Input
                    id="wd-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Available: {availableToWithdraw} {withdrawCoin}
                </p>
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={withdrawMutation.isPending}
                >
                  {withdrawMutation.isPending ? "Submitting…" : "Withdraw"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Transaction ledger</CardTitle>
              <CardDescription>Every balance change is logged here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(overview.data?.transactions ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No transactions yet.
                </p>
              ) : (
                (overview.data?.transactions ?? []).map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-1 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {TYPE_LABEL[t.type] ?? t.type}{" "}
                        <span className="mono text-muted-foreground">
                          {t.amount} {t.crypto_type}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                        {t.external_address ? ` · ${t.external_address.slice(0, 16)}…` : ""}
                      </p>
                    </div>
                    <Badge variant={t.status === "completed" ? "secondary" : "outline"}>
                      {t.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!depositCoin} onOpenChange={(o) => !o && setDepositCoin(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deposit {depositCoin}</DialogTitle>
            <DialogDescription>
              Send testnet {depositCoin} to this address. Your balance updates automatically once
              the network confirms the transfer.
            </DialogDescription>
          </DialogHeader>
          {depositMutation.isPending ? (
            <p className="text-sm text-muted-foreground">Generating address…</p>
          ) : activeWallet?.external_deposit_address ? (
            <div className="space-y-3">
              <p className="mono break-all rounded-md border border-border bg-muted/40 p-3 text-sm">
                {activeWallet.external_deposit_address}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(activeWallet.external_deposit_address!);
                  toast.success("Address copied");
                }}
              >
                <Copy className="size-4" /> Copy address
              </Button>
              {activeWallet.external_deposit_address.startsWith("TESTNET-DEMO-") ? (
                <p className="text-xs text-muted-foreground">
                  Demo placeholder address — the testnet provider is unreachable right now, so
                  no live address could be issued. Deposit crediting still works via webhook.
                </p>
              ) : null}
            </div>
          ) : (
            <Button onClick={() => depositCoin && depositMutation.mutate(depositCoin)}>
              Generate deposit address
            </Button>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDepositCoin(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
