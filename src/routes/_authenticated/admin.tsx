import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import {
  getAdminOverview,
  getDepositClaimLog,
  getDisputeThread,
  listAllTrades,
  listDepositClaims,
  listDisputes,
  listMasterWallets,
  rejectDepositClaim,
  resolveDispute,
  upsertMasterWallet,
} from "@/lib/admin.functions";
import { TRADE_STATUS_LABEL, type TradeStatus } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — FOMN" },
      {
        name: "description",
        content: "Monitor escrow holds, trades and disputes across the FOMN testnet marketplace.",
      },
      { property: "og:title", content: "Admin dashboard — FOMN" },
      {
        property: "og:description",
        content: "Monitor escrow holds, trades and disputes across the FOMN testnet marketplace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function statusVariant(status: string) {
  if (status === "released") return "default" as const;
  if (status === "disputed" || status === "cancelled") return "destructive" as const;
  return "secondary" as const;
}

function AdminPage() {
  const { isAdmin, loading } = useAuth();

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Checking access…</p>;

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-destructive" />
        <h1 className="text-xl font-semibold">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This dashboard is limited to platform administrators.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Back to marketplace</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Platform activity, escrow exposure and dispute resolution
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="trades">All trades</TabsTrigger>
          <TabsTrigger value="deposits">Deposits</TabsTrigger>
          <TabsTrigger value="wallets">Wallet addresses</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <Overview />
        </TabsContent>
        <TabsContent value="disputes" className="mt-4">
          <Disputes />
        </TabsContent>
        <TabsContent value="trades" className="mt-4">
          <AllTrades />
        </TabsContent>
        <TabsContent value="deposits" className="mt-4">
          <DepositClaims />
        </TabsContent>
        <TabsContent value="wallets" className="mt-4">
          <MasterWallets />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mono mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Overview() {
  const fetchOverview = useServerFn(getAdminOverview);
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: () => fetchOverview() });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading stats…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Users" value={String(d.users)} />
        <Stat label="Active offers" value={String(d.activeListings)} />
        <Stat label="Trades" value={String(d.totalTrades)} />
        <Stat label="Open disputes" value={String(d.openDisputes)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Trades by status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(d.byStatus).length === 0 ? (
              <p className="text-sm text-muted-foreground">No trades yet.</p>
            ) : (
              Object.entries(d.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <Badge variant={statusVariant(status)}>
                    {TRADE_STATUS_LABEL[status as TradeStatus] ?? status}
                  </Badge>
                  <span className="mono">{count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Escrow currently held</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(d.held).length === 0 ? (
              <p className="text-sm text-muted-foreground">No funds under hold.</p>
            ) : (
              Object.entries(d.held).map(([coin, amount]) => (
                <div key={coin} className="flex items-center justify-between text-sm">
                  <span>{coin}</span>
                  <span className="mono">{amount}</span>
                </div>
              ))
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              Settled volume: ${d.settledVolume.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Disputes() {
  const fetchDisputes = useServerFn(listDisputes);
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const q = useQuery({
    queryKey: ["admin", "disputes", status],
    queryFn: () => fetchDisputes({ data: { status } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-sm">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading disputes…</p>
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No disputes in this view.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((d) => (
            <DisputeCard key={d.id} dispute={d} />
          ))}
        </div>
      )}
    </div>
  );
}

type DisputeRow = Awaited<ReturnType<typeof listDisputes>>[number];

function DisputeCard({ dispute }: { dispute: DisputeRow }) {
  const queryClient = useQueryClient();
  const resolve = useServerFn(resolveDispute);
  const fetchThread = useServerFn(getDisputeThread);
  const [resolution, setResolution] = useState<"release_to_buyer" | "refund_to_seller">("release_to_buyer");
  const [notes, setNotes] = useState("");
  const [threadOpen, setThreadOpen] = useState(false);

  const trade = dispute.trade as unknown as {
    crypto_type: string;
    amount: number;
    price: number;
    fiat_currency: string;
    status: string;
    payment_method: string | null;
    buyer: { display_name: string } | null;
    seller: { display_name: string } | null;
  } | null;

  const thread = useQuery({
    queryKey: ["admin", "thread", dispute.trade_id],
    queryFn: () => fetchThread({ data: { tradeId: dispute.trade_id } }),
    enabled: threadOpen,
  });

  const mutation = useMutation({
    mutationFn: () => resolve({ data: { disputeId: dispute.id, resolution, notes } }),
    onSuccess: (res) => {
      toast.success(res.status === "released" ? "Escrow released to buyer" : "Escrow refunded to seller");
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={dispute.status === "open" ? "destructive" : "default"}>{dispute.status}</Badge>
          {trade ? (
            <>
              <span className="mono text-sm font-semibold">
                {Number(trade.amount)} {trade.crypto_type}
              </span>
              <span className="text-sm text-muted-foreground">
                ${(Number(trade.amount) * Number(trade.price)).toLocaleString()} ·{" "}
                {trade.payment_method ?? "—"}
              </span>
              <Badge variant={statusVariant(trade.status)}>
                {TRADE_STATUS_LABEL[trade.status as TradeStatus] ?? trade.status}
              </Badge>
            </>
          ) : null}
        </div>

        <div className="text-sm text-muted-foreground">
          {trade ? (
            <p>
              Buyer {trade.buyer?.display_name ?? "—"} · Seller {trade.seller?.display_name ?? "—"}
            </p>
          ) : null}
          <p className="text-xs">
            Raised by {(dispute.raiser as { display_name: string } | null)?.display_name ?? "—"} on{" "}
            {new Date(dispute.created_at).toLocaleString()}
          </p>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">{dispute.reason}</div>

        {dispute.admin_notes ? (
          <p className="text-xs text-muted-foreground">Resolution: {dispute.admin_notes}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/trades/$tradeId" params={{ tradeId: dispute.trade_id }}>
              Open trade room
            </Link>
          </Button>
          <Dialog open={threadOpen} onOpenChange={setThreadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                View chat evidence
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Chat evidence</DialogTitle>
                <DialogDescription>Full message history for this trade.</DialogDescription>
              </DialogHeader>
              {thread.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading messages…</p>
              ) : (thread.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages in this trade.</p>
              ) : (
                <div className="space-y-3">
                  {(thread.data ?? []).map((m) => (
                    <div key={m.id} className="rounded-md border border-border p-2 text-sm">
                      <p className="text-xs text-muted-foreground">
                        {(m.sender as { display_name: string } | null)?.display_name ?? "—"} ·{" "}
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                      {m.content ? <p className="mt-1">{m.content}</p> : null}
                      {m.attachment_url ? (
                        <p className="mono mt-1 text-xs text-muted-foreground">
                          Attachment: {m.attachment_url}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {dispute.status === "open" ? (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Resolution</Label>
                <Select value={resolution} onValueChange={(v) => setResolution(v as typeof resolution)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="release_to_buyer">Release escrow to buyer</SelectItem>
                    <SelectItem value="refund_to_seller">Refund escrow to seller</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Decision note</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Why this outcome (kept on the dispute record)"
                />
              </div>
            </div>
            <Button
              className="w-full sm:w-auto"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Resolving…" : "Resolve dispute"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AllTrades() {
  const fetchTrades = useServerFn(listAllTrades);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["admin", "trades", status, search],
    queryFn: () => fetchTrades({ data: { status, search } }),
  });

  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(TRADE_STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by trade id, name or email"
        />
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading trades…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No trades match this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono font-semibold">
                      {t.amount} {t.crypto_type}
                    </span>
                    <Badge variant={statusVariant(t.status)}>
                      {TRADE_STATUS_LABEL[t.status as TradeStatus] ?? t.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    ${(t.amount * t.price).toLocaleString()} · {t.payment_method ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.buyer?.display_name ?? "—"} (buyer) ↔ {t.seller?.display_name ?? "—"} (seller) ·{" "}
                    {new Date(t.created_at).toLocaleString()}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link to="/trades/$tradeId" params={{ tradeId: t.id }}>
                    Inspect
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function claimStatusVariant(status: string) {
  if (status === "verified") return "default" as const;
  if (status === "rejected") return "destructive" as const;
  return "secondary" as const;
}

type DepositClaimRow = Awaited<ReturnType<typeof listDepositClaims>>[number];

function DepositClaims() {
  const queryClient = useQueryClient();
  const fetchClaims = useServerFn(listDepositClaims);
  const [status, setStatus] = useState<"pending" | "verified" | "rejected" | "all">("pending");
  const q = useQuery({
    queryKey: ["admin", "deposit-claims", status],
    queryFn: () => fetchClaims({ data: { status } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-sm">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading deposit claims…</p>
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No deposit claims in this view.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((c) => (
            <DepositClaimCard key={c.id} claim={c} onChanged={() => void queryClient.invalidateQueries({ queryKey: ["admin", "deposit-claims"] })} />
          ))}
        </div>
      )}
    </div>
  );
}

function DepositClaimCard({ claim, onChanged }: { claim: DepositClaimRow; onChanged: () => void }) {
  const reject = useServerFn(rejectDepositClaim);
  const fetchLog = useServerFn(getDepositClaimLog);
  const [reason, setReason] = useState("");
  const [logOpen, setLogOpen] = useState(false);

  const user = claim.user as { display_name: string; email: string } | null;

  const log = useQuery({
    queryKey: ["admin", "deposit-claim-log", claim.id],
    queryFn: () => fetchLog({ data: { claimId: claim.id } }),
    enabled: logOpen,
  });

  const rejectMutation = useMutation({
    mutationFn: () => reject({ data: { claimId: claim.id, reason } }),
    onSuccess: () => {
      toast.success("Claim rejected");
      setReason("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={claimStatusVariant(claim.status)}>{claim.status}</Badge>
          <span className="mono text-sm font-semibold">
            {claim.claimed_amount} {claim.crypto_type} <span className="text-xs font-normal text-muted-foreground">via {claim.network}</span>
          </span>
          {claim.verified_amount != null ? (
            <span className="text-xs text-muted-foreground">verified: {claim.verified_amount}</span>
          ) : null}
        </div>

        <div className="text-sm text-muted-foreground">
          <p>{user?.display_name ?? "—"} ({user?.email ?? "—"})</p>
          <p className="mono text-xs">{claim.tx_hash}</p>
          <p className="text-xs">
            Submitted {new Date(claim.created_at).toLocaleString()} · {claim.attempt_count} check(s)
            {claim.last_checked_at ? ` · last checked ${new Date(claim.last_checked_at).toLocaleString()}` : ""}
          </p>
        </div>

        {claim.rejection_reason ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {claim.rejection_reason}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Dialog open={logOpen} onOpenChange={setLogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                View verification log
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Verification log</DialogTitle>
                <DialogDescription>Every automated check run against this claim.</DialogDescription>
              </DialogHeader>
              {log.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (log.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No log entries yet.</p>
              ) : (
                <div className="space-y-2">
                  {(log.data ?? []).map((entry) => (
                    <div key={entry.id} className="rounded-md border border-border p-2 text-xs">
                      <p className="font-medium">
                        {entry.result} <span className="font-normal text-muted-foreground">· {new Date(entry.attempt_at).toLocaleString()}</span>
                      </p>
                      <pre className="mono mt-1 whitespace-pre-wrap break-all text-muted-foreground">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>

        </div>

        {claim.status === "pending" ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm">Rejection reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why this claim is being rejected" />
            </div>
            <Button variant="destructive" size="sm" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate()}>
              Reject
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type MasterWalletRow = Awaited<ReturnType<typeof listMasterWallets>>[number];

function MasterWallets() {
  const queryClient = useQueryClient();
  const fetchWallets = useServerFn(listMasterWallets);
  const q = useQuery({ queryKey: ["admin", "master-wallets"], queryFn: () => fetchWallets() });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading wallet addresses…</p>;

  const onSaved = () => void queryClient.invalidateQueries({ queryKey: ["admin", "master-wallets"] });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The platform-owned addresses users deposit to. Add one row per coin/network pair before enabling deposits for it.
      </p>
      {(q.data ?? []).map((w) => (
        <MasterWalletCard key={w.id} wallet={w} onSaved={onSaved} />
      ))}
      <AddMasterWalletCard onSaved={onSaved} />
    </div>
  );
}

const EMPTY_WALLET_FORM = {
  cryptoType: "",
  network: "",
  label: "",
  address: "",
  tokenContractAddress: "",
  warningMessage: "",
  minConfirmations: 1,
  active: false,
};

function AddMasterWalletCard({ onSaved }: { onSaved: () => void }) {
  const save = useServerFn(upsertMasterWallet);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_WALLET_FORM);

  const mutation = useMutation({
    mutationFn: () => save({ data: { ...form, minConfirmations: Number(form.minConfirmations) } }),
    onSuccess: () => {
      toast.success("Wallet address added");
      setForm(EMPTY_WALLET_FORM);
      setOpen(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        + Add coin/network
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Coin (e.g. USDT)</Label>
            <Input value={form.cryptoType} onChange={(e) => setForm({ ...form, cryptoType: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Network code (e.g. USDT_TRC20)</Label>
            <Input value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Label (shown to users)</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Address</Label>
            <Input className="mono" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Adding…" : "Add"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MasterWalletCard({ wallet, onSaved }: { wallet: MasterWalletRow; onSaved: () => void }) {
  const save = useServerFn(upsertMasterWallet);
  const [form, setForm] = useState({
    cryptoType: wallet.crypto_type,
    network: wallet.network,
    label: wallet.label,
    address: wallet.address,
    tokenContractAddress: wallet.token_contract_address ?? "",
    warningMessage: wallet.warning_message,
    minConfirmations: wallet.min_confirmations,
    active: wallet.active,
  });

  const mutation = useMutation({
    mutationFn: () => save({ data: { id: wallet.id, ...form, minConfirmations: Number(form.minConfirmations) } }),
    onSuccess: () => {
      toast.success("Wallet address saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Coin</Label>
            <Input value={form.cryptoType} onChange={(e) => setForm({ ...form, cryptoType: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Network code</Label>
            <Input value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Label (shown to users)</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Address</Label>
            <Input className="mono" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Token contract address (leave blank for a native coin)</Label>
            <Input
              className="mono"
              value={form.tokenContractAddress}
              onChange={(e) => setForm({ ...form, tokenContractAddress: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Warning shown in the deposit dialog</Label>
            <Textarea rows={2} value={form.warningMessage} onChange={(e) => setForm({ ...form, warningMessage: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Min confirmations</Label>
            <Input
              type="number"
              min={0}
              value={form.minConfirmations}
              onChange={(e) => setForm({ ...form, minConfirmations: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            <Label className="text-sm">Active (visible to users)</Label>
          </div>
        </div>
        <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
