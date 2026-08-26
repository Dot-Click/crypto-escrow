import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Copy, Lock, RefreshCw } from "lucide-react";
import { getWalletOverview, requestWithdrawal } from "@/lib/wallet.functions";
import {
  getDepositNetworks,
  listMyDepositClaims,
  recheckDepositClaim,
  submitDepositClaim,
} from "@/lib/deposit-claims.functions";
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
      { title: "Wallet — deposits, withdrawals & escrow holds | FOMN" },
      {
        name: "description",
        content:
          "Fund your FOMN testnet wallet from an external blockchain address, withdraw free balance, and track every escrow hold in the ledger.",
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

const CLAIM_STATUS_LABEL: Record<string, string> = {
  pending: "Checking…",
  verified: "Credited",
  rejected: "Rejected",
};

function WalletPage() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getWalletOverview);
  const submitWithdrawal = useServerFn(requestWithdrawal);
  const fetchDepositNetworks = useServerFn(getDepositNetworks);
  const fetchMyClaims = useServerFn(listMyDepositClaims);
  const submitClaim = useServerFn(submitDepositClaim);
  const recheckClaim = useServerFn(recheckDepositClaim);

  const [depositCoin, setDepositCoin] = useState<string | null>(null);
  const [depositNetwork, setDepositNetwork] = useState<string | null>(null);
  const [claimAmount, setClaimAmount] = useState("");
  const [claimTxHash, setClaimTxHash] = useState("");
  const [withdrawCoin, setWithdrawCoin] = useState(CRYPTO_TYPES[0].code as string);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");

  const overview = useQuery({
    queryKey: ["wallet-overview"],
    queryFn: () => fetchOverview(),
  });

  const depositNetworks = useQuery({
    queryKey: ["deposit-networks"],
    queryFn: () => fetchDepositNetworks(),
  });

  const myClaims = useQuery({
    queryKey: ["deposit-claims"],
    queryFn: () => fetchMyClaims(),
    refetchInterval: (query) => (query.state.data?.some((c) => c.status === "pending") ? 15_000 : false),
  });

  const networksForCoin = (depositNetworks.data ?? []).filter((n) => n.crypto_type === depositCoin);
  const selectedMasterWallet = networksForCoin.find((n) => n.network === depositNetwork) ?? null;

  useEffect(() => {
    if (!depositCoin) {
      setDepositNetwork(null);
      return;
    }
    if (networksForCoin.length === 1 && networksForCoin[0]) {
      setDepositNetwork(networksForCoin[0].network);
    } else if (!networksForCoin.some((n) => n.network === depositNetwork)) {
      setDepositNetwork(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositCoin, depositNetworks.data]);

  const claimMutation = useMutation({
    mutationFn: () =>
      submitClaim({
        data: {
          cryptoType: depositCoin!,
          network: depositNetwork!,
          amount: Number(claimAmount),
          txHash: claimTxHash.trim(),
        },
      }),
    onSuccess: (res) => {
      setClaimAmount("");
      setClaimTxHash("");
      void qc.invalidateQueries({ queryKey: ["deposit-claims"] });
      void qc.invalidateQueries({ queryKey: ["wallet-overview"] });
      if (res.status === "verified") toast.success(`Deposit credited: ${res.verified_amount} ${res.crypto_type}`);
      else if (res.status === "rejected") toast.error(res.rejection_reason ?? "Deposit claim rejected");
      else toast.info("Claim submitted — checking the network for confirmation.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recheckMutation = useMutation({
    mutationFn: (claimId: string) => recheckClaim({ data: { claimId } }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["deposit-claims"] });
      void qc.invalidateQueries({ queryKey: ["wallet-overview"] });
      if (res.status === "verified") toast.success("Deposit credited");
      else if (res.status === "rejected") toast.error(res.rejection_reason ?? "Deposit claim rejected");
      else toast.info("Still waiting for on-chain confirmation.");
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
                        setClaimAmount("");
                        setClaimTxHash("");
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
              <CardTitle className="text-base">Deposit claims</CardTitle>
              <CardDescription>Every manual deposit you've submitted, and its verification status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(myClaims.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No deposit claims yet.</p>
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
                      </p>
                      {c.status === "rejected" && c.rejection_reason ? (
                        <p className="text-xs text-destructive">{c.rejection_reason}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={c.status === "verified" ? "secondary" : c.status === "rejected" ? "destructive" : "outline"}>
                        {CLAIM_STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                      {c.status === "pending" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={recheckMutation.isPending}
                          onClick={() => recheckMutation.mutate(c.id)}
                        >
                          <RefreshCw className="size-3.5" /> Check status
                        </Button>
                      ) : null}
                    </div>
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
              Send testnet {depositCoin} to our wallet, then submit the transaction hash below.
              Your balance updates once we verify it on-chain.
            </DialogDescription>
          </DialogHeader>

          {depositNetworks.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading deposit addresses…</p>
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

              {selectedMasterWallet ? (
                <>
                  {selectedMasterWallet.warning_message ? (
                    <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      {selectedMasterWallet.warning_message}
                    </p>
                  ) : null}

                  <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-muted/40 p-4">
                    <QRCodeSVG value={selectedMasterWallet.address} size={160} />
                    <p className="mono break-all text-center text-sm">{selectedMasterWallet.address}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(selectedMasterWallet.address);
                        toast.success("Address copied");
                      }}
                    >
                      <Copy className="size-4" /> Copy address
                    </Button>
                  </div>

                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      claimMutation.mutate();
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="claim-amount">Amount sent</Label>
                      <Input
                        id="claim-amount"
                        inputMode="decimal"
                        value={claimAmount}
                        onChange={(e) => setClaimAmount(e.target.value)}
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="claim-txhash">Transaction hash (TxID)</Label>
                      <Input
                        id="claim-txhash"
                        value={claimTxHash}
                        onChange={(e) => setClaimTxHash(e.target.value)}
                        placeholder="Paste the TxID from your wallet/exchange"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={claimMutation.isPending}>
                      {claimMutation.isPending ? "Verifying…" : "Submit deposit claim"}
                    </Button>
                  </form>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Choose a network above to see the deposit address.</p>
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
    </div>
  );
}
