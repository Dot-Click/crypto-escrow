import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Copy, Loader2, Lock, Zap } from "lucide-react";
import { getWalletOverview, requestWithdrawal } from "@/lib/wallet.functions";
import { getMyDepositAddresses, listMyDepositClaims } from "@/lib/deposit-claims.functions";
import { createLightningDeposit, recheckLightningDeposit } from "@/lib/lightning-deposit.functions";
import { CRYPTO_TYPES } from "@/lib/constants";
import { CoinIcon } from "@/components/coin-icon";
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
      { title: "Wallet — deposits, withdrawals & escrow holds | FOMN" },
      {
        name: "description",
        content:
          "Fund your FOMN wallet from an external blockchain address, withdraw free balance, and track every escrow hold in the ledger.",
      },
      { property: "og:title", content: "Wallet — deposits, withdrawals & escrow holds" },
      {
        property: "og:description",
        content: "Fund your wallet, withdraw free balance, and track escrow holds.",
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

const CLAIM_STATUS_LABEL: Record<string, string> = {
  pending: "Confirming…",
  verified: "Credited",
  rejected: "Rejected",
};

function WalletPage() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getWalletOverview);
  const submitWithdrawal = useServerFn(requestWithdrawal);
  const fetchDepositAddresses = useServerFn(getMyDepositAddresses);
  const fetchMyClaims = useServerFn(listMyDepositClaims);
  const startLightningDeposit = useServerFn(createLightningDeposit);
  const recheckLightning = useServerFn(recheckLightningDeposit);

  const [depositCoin, setDepositCoin] = useState<string | null>(null);
  const [depositNetwork, setDepositNetwork] = useState<string | null>(null);
  const [withdrawCoin, setWithdrawCoin] = useState(CRYPTO_TYPES[0].code as string);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");

  const [lightningOpen, setLightningOpen] = useState(false);
  const [lnAmountSats, setLnAmountSats] = useState("");
  const [lnInvoice, setLnInvoice] = useState<{
    id: string;
    bolt11: string;
    amount_btc: number;
    status: string;
    expires_at: string;
  } | null>(null);

  const overview = useQuery({
    queryKey: ["wallet-overview"],
    queryFn: () => fetchOverview(),
  });

  const depositAddresses = useQuery({
    queryKey: ["deposit-addresses"],
    queryFn: () => fetchDepositAddresses(),
    enabled: !!depositCoin,
    staleTime: 5 * 60_000,
  });

  const myClaims = useQuery({
    queryKey: ["deposit-claims"],
    queryFn: () => fetchMyClaims(),
    refetchInterval: (query) => (query.state.data?.some((c) => c.status === "pending") ? 15_000 : false),
  });

  const networksForCoin = (depositAddresses.data ?? []).filter((n) => n.crypto_type === depositCoin);
  const selectedAddress = networksForCoin.find((n) => n.network === depositNetwork) ?? null;

  const withdrawMutation = useMutation({
    mutationFn: () =>
      submitWithdrawal({
        data: { cryptoType: withdrawCoin, amount: Number(amount), address: address.trim() },
      }),
    onSuccess: () => {
      setAmount("");
      setAddress("");
      void qc.invalidateQueries({ queryKey: ["wallet-overview"] });
      toast.success("Withdrawal queued — it will broadcast within a few minutes.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lightningMutation = useMutation({
    mutationFn: () => startLightningDeposit({ data: { amountSats: Number(lnAmountSats) } }),
    onSuccess: (row) => setLnInvoice(row),
    onError: (e: Error) => toast.error(e.message),
  });

  useQuery({
    queryKey: ["lightning-deposit-status", lnInvoice?.id],
    queryFn: async () => {
      const row = await recheckLightning({ data: { id: lnInvoice!.id } });
      setLnInvoice(row);
      if (row.status === "settled") {
        toast.success(`Lightning payment received — ${row.amount_btc} BTC credited.`);
        void qc.invalidateQueries({ queryKey: ["wallet-overview"] });
      } else if (row.status === "expired") {
        toast.error("This Lightning invoice expired before payment arrived.");
      }
      return row;
    },
    enabled: !!lnInvoice && lnInvoice.status === "pending",
    refetchInterval: 4_000,
  });

  const closeLightningDialog = () => {
    setLightningOpen(false);
    setLnAmountSats("");
    setLnInvoice(null);
  };

  const wallets = overview.data?.wallets ?? [];
  const withdrawWallet = wallets.find((w) => w.crypto_type === withdrawCoin);
  const availableToWithdraw = withdrawWallet
    ? withdrawWallet.balance - withdrawWallet.held_balance
    : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Wallet</h1>
        <p className="text-sm text-muted-foreground">
          Escrow holds lock part of your balance until a trade resolves.
        </p>
      </div>

      {overview.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading balances…</p>
      ) : overview.isError ? (
        <p className="text-sm text-destructive">
          Couldn't load your wallet balances: {overview.error.message}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {wallets.map((w) => {
              const free = w.balance - w.held_balance;
              return (
                <Card key={w.id}>
                  <CardContent className="space-y-3 py-5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-semibold">
                        <CoinIcon code={w.crypto_type} className="size-6" />
                        {w.crypto_type}
                      </span>
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
                      onClick={() => setDepositCoin(w.crypto_type)}
                    >
                      <ArrowDownToLine className="size-4" /> Deposit {w.crypto_type}
                    </Button>
                    {w.crypto_type === "BTC" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setLightningOpen(true)}
                      >
                        <Zap className="size-4" /> Deposit BTC via Lightning
                      </Button>
                    ) : null}
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
                          <span className="flex items-center gap-2">
                            <CoinIcon code={c.code} className="size-4" />
                            {c.code}
                          </span>
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
                    placeholder="bc1q…"
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
              <CardTitle className="text-base">Deposits</CardTitle>
              <CardDescription>
                Detected automatically once your transaction has enough confirmations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(myClaims.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No deposits yet.</p>
              ) : (
                (myClaims.data ?? []).map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-1 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {c.claimed_amount} {c.crypto_type}{" "}
                        <span className="text-xs font-normal text-muted-foreground">via {c.network}</span>
                      </p>
                      <p className="mono text-xs text-muted-foreground">
                        {c.tx_hash.slice(0, 18)}… · {new Date(c.created_at).toLocaleString()}
                        {c.confirmations != null ? ` · ${c.confirmations} conf` : ""}
                      </p>
                      {c.status === "rejected" && c.rejection_reason ? (
                        <p className="text-xs text-destructive">{c.rejection_reason}</p>
                      ) : null}
                    </div>
                    <Badge variant={c.status === "verified" ? "secondary" : c.status === "rejected" ? "destructive" : "outline"}>
                      {CLAIM_STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </div>
                ))
              )}
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
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <CoinIcon code={t.crypto_type} className="size-4" />
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

      <Dialog
        open={!!depositCoin}
        onOpenChange={(o) => {
          if (!o) {
            setDepositCoin(null);
            setDepositNetwork(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deposit {depositCoin}</DialogTitle>
            <DialogDescription>
              Send {depositCoin} to your unique address below. Your balance updates automatically
              once the transaction has enough confirmations on-chain.
            </DialogDescription>
          </DialogHeader>

          {depositAddresses.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your deposit address…</p>
          ) : depositAddresses.isError ? (
            <p className="text-sm text-destructive">
              Couldn't load your deposit address: {depositAddresses.error.message}
            </p>
          ) : networksForCoin.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Deposits for {depositCoin} aren't configured yet — check back later.
            </p>
          ) : (
            <div className="space-y-4">
              {networksForCoin.length > 1 ? (
                <div className="space-y-2">
                  <Label>Network</Label>
                  <Select value={depositNetwork ?? ""} onValueChange={(v) => setDepositNetwork(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose the network you're sending on" />
                    </SelectTrigger>
                    <SelectContent>
                      {networksForCoin.map((n) => (
                        <SelectItem key={n.network} value={n.network}>
                          {n.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {selectedAddress || networksForCoin.length === 1 ? (
                (() => {
                  const shown = selectedAddress ?? networksForCoin[0];
                  return (
                    <>
                      {shown.warning_message ? (
                        <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                          {shown.warning_message}
                        </p>
                      ) : null}

                      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-muted/40 p-4">
                        <QRCodeSVG value={shown.address} size={160} />
                        <p className="mono break-all text-center text-sm">{shown.address}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void navigator.clipboard.writeText(shown.address);
                            toast.success("Address copied");
                          }}
                        >
                          <Copy className="size-4" /> Copy address
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        This address is unique to you. Send only {shown.crypto_type} on the {shown.label} network —
                        anything else sent to this address will be lost. Deposits are credited automatically after{" "}
                        {shown.min_confirmations} confirmation
                        {shown.min_confirmations === 1 ? "" : "s"}.
                      </p>
                    </>
                  );
                })()
              ) : (
                <p className="text-sm text-muted-foreground">Choose a network above to see your deposit address.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDepositCoin(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lightningOpen} onOpenChange={(o) => (o ? setLightningOpen(true) : closeLightningDialog())}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="size-4" /> Deposit BTC via Lightning
            </DialogTitle>
            <DialogDescription>
              Instant BTC deposit over the Lightning Network. Pay the invoice from any Lightning
              wallet and your balance updates as soon as it settles.
            </DialogDescription>
          </DialogHeader>

          {!lnInvoice ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                lightningMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="ln-amount">Amount (sats)</Label>
                <Input
                  id="ln-amount"
                  inputMode="numeric"
                  value={lnAmountSats}
                  onChange={(e) => setLnAmountSats(e.target.value)}
                  placeholder="50000"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={lightningMutation.isPending}>
                {lightningMutation.isPending ? "Creating invoice…" : "Create Lightning invoice"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {lnInvoice.status === "pending" ? (
                <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-muted/40 p-4">
                  <QRCodeSVG value={lnInvoice.bolt11} size={200} />
                  <p className="mono max-h-24 w-full overflow-y-auto break-all text-center text-xs">
                    {lnInvoice.bolt11}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(lnInvoice.bolt11);
                      toast.success("Invoice copied");
                    }}
                  >
                    <Copy className="size-4" /> Copy invoice
                  </Button>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Waiting for payment — {lnInvoice.amount_btc} BTC
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(lnInvoice.expires_at).toLocaleTimeString()}
                  </p>
                </div>
              ) : lnInvoice.status === "settled" ? (
                <p className="rounded-md border border-border bg-muted/40 p-4 text-center text-sm">
                  Paid — {lnInvoice.amount_btc} BTC credited to your wallet.
                </p>
              ) : (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
                  This invoice expired before payment arrived. Close and create a new one.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={closeLightningDialog}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
