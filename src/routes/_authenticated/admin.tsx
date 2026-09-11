import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  ChevronDown,
  Gavel,
  Inbox,
  LayoutDashboard,
  Loader2,
  Lock,
  MessageSquareText,
  Plus,
  Search,
  ShieldAlert,
  Tag,
  Users,
  Wallet as WalletIcon,
  type LucideIcon,
} from "lucide-react";
import {
  getAdminOverview,
  getDepositClaimLog,
  getDisputeThread,
  listAllTrades,
  listDepositClaims,
  listDisputes,
  listFeedback,
  listMasterWallets,
  listVerificationRequests,
  rejectDepositClaim,
  resolveDispute,
  reviewVerificationRequest,
  upsertMasterWallet,
} from "@/lib/admin.functions";
import { TRADE_STATUS_LABEL, type TradeStatus } from "@/lib/constants";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { CoinIcon } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      { title: "Admin dashboard — CEMP" },
      {
        name: "description",
        content: "Monitor escrow holds, trades and disputes across the CEMP testnet marketplace.",
      },
      { property: "og:title", content: "Admin dashboard — CEMP" },
      {
        property: "og:description",
        content: "Monitor escrow holds, trades and disputes across the CEMP testnet marketplace.",
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

/** Left-border accent so an admin can triage a list by color before reading a single word. */
function accentBorder(variant: "default" | "destructive" | "secondary"): string {
  if (variant === "destructive") return "border-l-4 border-l-destructive";
  if (variant === "default") return "border-l-4 border-l-emerald-500";
  return "border-l-4 border-l-amber-500";
}

function SectionHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className="text-sm font-semibold leading-none">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <Icon className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

const ADMIN_TABS = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "disputes", label: "Disputes", icon: Gavel },
  { value: "trades", label: "All trades", icon: ArrowLeftRight },
  { value: "deposits", label: "Deposits", icon: ArrowDownToLine },
  { value: "verification", label: "Verification", icon: BadgeCheck },
  { value: "feedback", label: "Feedback", icon: MessageSquareText },
  { value: "wallets", label: "Wallet addresses", icon: WalletIcon },
] as const;

function AdminPage() {
  const { isAdmin, loading } = useAuth();

  if (loading) return <LoadingState label="Checking access…" />;

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="size-7 text-destructive" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Admin access required</h1>
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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LayoutDashboard className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Platform activity, escrow exposure and dispute resolution
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1.5">
          {ADMIN_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              <tab.icon className="size-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
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
        <TabsContent value="verification" className="mt-4">
          <VerificationRequests />
        </TabsContent>
        <TabsContent value="feedback" className="mt-4">
          <Feedback />
        </TabsContent>
        <TabsContent value="wallets" className="mt-4">
          <MasterWallets />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tone === "warning" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mono text-xl font-semibold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Overview() {
  const fetchOverview = useServerFn(getAdminOverview);
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: () => fetchOverview() });

  if (q.isLoading) return <LoadingState label="Loading stats…" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={LayoutDashboard}
        title="Overview"
        description="Platform-wide activity at a glance."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Users" value={String(d.users)} />
        <Stat icon={Tag} label="Active offers" value={String(d.activeListings)} />
        <Stat icon={ArrowLeftRight} label="Trades" value={String(d.totalTrades)} />
        <Stat
          icon={AlertTriangle}
          label="Open disputes"
          value={String(d.openDisputes)}
          tone={d.openDisputes > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-muted-foreground" /> Trades by status
            </CardTitle>
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="size-4 text-muted-foreground" /> Escrow currently held
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(d.held).length === 0 ? (
              <p className="text-sm text-muted-foreground">No funds under hold.</p>
            ) : (
              Object.entries(d.held).map(([coin, amount]) => (
                <div key={coin} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <CoinIcon code={coin} className="size-4" /> {coin}
                  </span>
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
      <SectionHeader icon={Gavel} title="Disputes" description="Review evidence, then release or refund escrow." />

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
        <LoadingState label="Loading disputes…" />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon={Gavel} message="No disputes in this view." />
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
    <Card className={accentBorder(dispute.status === "open" ? "destructive" : "default")}>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={dispute.status === "open" ? "destructive" : "default"}>{dispute.status}</Badge>
          {trade ? (
            <>
              <span className="mono flex items-center gap-1.5 text-sm font-semibold">
                <CoinIcon code={trade.crypto_type} className="size-4" />
                {Number(trade.amount)} {trade.crypto_type}
              </span>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                ${(Number(trade.amount) * Number(trade.price)).toLocaleString()} ·
                <PaymentRailIcon railKey={railKeyForMethod(trade.payment_method ?? "")} className="size-3.5" />
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
          <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
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
      <SectionHeader
        icon={ArrowLeftRight}
        title="All trades"
        description="Every trade on the platform, searchable by id, name or email."
      />

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
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by trade id, name or email"
          />
        </div>
      </div>

      {q.isLoading ? (
        <LoadingState label="Loading trades…" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} message="No trades match this filter." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Parties</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <span className="mono flex items-center gap-1.5 font-medium">
                        <CoinIcon code={t.crypto_type} className="size-4" />
                        {t.amount} {t.crypto_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(t.status)}>
                        {TRADE_STATUS_LABEL[t.status as TradeStatus] ?? t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        ${(t.amount * t.price).toLocaleString()}
                        <PaymentRailIcon railKey={railKeyForMethod(t.payment_method ?? "")} className="size-3.5" />
                      </span>
                      <span className="block text-xs text-muted-foreground">{t.payment_method ?? "—"}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {t.buyer?.display_name ?? "—"} ↔ {t.seller?.display_name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link to="/trades/$tradeId" params={{ tradeId: t.id }}>
                          Inspect
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
      <SectionHeader
        icon={ArrowDownToLine}
        title="Deposit claims"
        description="Manually-reported deposits pending automated or manual verification."
      />

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
        <LoadingState label="Loading deposit claims…" />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon={ArrowDownToLine} message="No deposit claims in this view." />
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
    <Card className={accentBorder(claimStatusVariant(claim.status))}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={claimStatusVariant(claim.status)}>{claim.status}</Badge>
          <span className="mono flex items-center gap-1.5 text-sm font-semibold">
            <CoinIcon code={claim.crypto_type} className="size-4" />
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
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3 sm:flex-row sm:items-end">
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

type VerificationRequestRow = Awaited<ReturnType<typeof listVerificationRequests>>[number];

function VerificationRequests() {
  const queryClient = useQueryClient();
  const fetchRequests = useServerFn(listVerificationRequests);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const q = useQuery({
    queryKey: ["admin", "verification-requests", status],
    queryFn: () => fetchRequests({ data: { status } }),
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={BadgeCheck}
        title="Verification requests"
        description="Manual ID review — approving sets the Verified badge on a trader's profile."
      />

      <div className="flex items-center gap-3">
        <Label className="text-sm">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <LoadingState label="Loading requests…" />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon={BadgeCheck} message="No verification requests in this view." />
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((r) => (
            <VerificationRequestCard
              key={r.id}
              request={r}
              onChanged={() => void queryClient.invalidateQueries({ queryKey: ["admin", "verification-requests"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VerificationRequestCard({ request, onChanged }: { request: VerificationRequestRow; onChanged: () => void }) {
  const review = useServerFn(reviewVerificationRequest);
  const [note, setNote] = useState("");
  const user = request.user as { display_name: string; email: string } | null;

  const reviewMutation = useMutation({
    mutationFn: (approve: boolean) => review({ data: { requestId: request.id, approve, note } }),
    onSuccess: (r) => {
      toast.success(r.status === "approved" ? "Trader verified" : "Request rejected");
      setNote("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const variant = request.status === "approved" ? "default" : request.status === "rejected" ? "destructive" : "secondary";

  return (
    <Card className={accentBorder(variant)}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={variant}>{request.status}</Badge>
          <span className="text-sm font-medium">{user?.display_name ?? "—"}</span>
          <span className="text-xs text-muted-foreground">{user?.email ?? "—"}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Submitted {new Date(request.created_at).toLocaleString()}
          {request.reviewed_at ? ` · reviewed ${new Date(request.reviewed_at).toLocaleString()}` : ""}
        </p>

        {request.documentUrl ? (
          <a
            href={request.documentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm text-primary underline-offset-2 hover:underline"
          >
            View submitted document
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">Document link expired — reopen this tab to refresh it.</p>
        )}

        {request.note ? (
          <p className="rounded-md border border-border bg-muted/30 p-2 text-xs">{request.note}</p>
        ) : null}

        {request.status === "pending" ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm">Note (shown to the user if rejected)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate(false)}
              >
                Reject
              </Button>
              <Button size="sm" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate(true)}>
                Approve
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Feedback() {
  const fetchFeedback = useServerFn(listFeedback);
  const q = useQuery({ queryKey: ["admin", "feedback"], queryFn: () => fetchFeedback() });

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={MessageSquareText}
        title="Feedback"
        description="Free-form messages users sent from their profile page."
      />

      {q.isLoading ? (
        <LoadingState label="Loading feedback…" />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon={MessageSquareText} message="No feedback submitted yet." />
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((f) => {
            const user = f.user as { display_name: string; email: string } | null;
            return (
              <Card key={f.id}>
                <CardContent className="space-y-1.5 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{user?.display_name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{user?.email ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      · {new Date(f.created_at).toLocaleString()}
                      {f.page_path ? ` · ${f.page_path}` : ""}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{f.message}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

type MasterWalletRow = Awaited<ReturnType<typeof listMasterWallets>>[number];

function MasterWallets() {
  const queryClient = useQueryClient();
  const fetchWallets = useServerFn(listMasterWallets);
  const q = useQuery({ queryKey: ["admin", "master-wallets"], queryFn: () => fetchWallets() });

  const onSaved = () => void queryClient.invalidateQueries({ queryKey: ["admin", "master-wallets"] });

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={WalletIcon}
        title="Wallet addresses"
        description="The platform-owned addresses users deposit to. Add one row per coin/network pair before enabling deposits for it."
      />

      {q.isLoading ? (
        <LoadingState label="Loading wallet addresses…" />
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((w) => (
            <MasterWalletCard key={w.id} wallet={w} onSaved={onSaved} />
          ))}
          <AddMasterWalletCard onSaved={onSaved} />
        </div>
      )}
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="size-4" /> Add coin/network
      </button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Plus className="size-4 text-muted-foreground" /> New coin/network
        </div>
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
  const [open, setOpen] = useState(false);
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
    <Card className={cn("border-l-4", form.active ? "border-l-emerald-500" : "border-l-border")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <CoinIcon code={form.cryptoType || "?"} className="size-5 shrink-0" />
        <span className="shrink-0 font-semibold">{form.cryptoType || "—"}</span>
        <span className="mono shrink-0 text-sm text-muted-foreground">{form.network || "—"}</span>
        <span className="mono hidden truncate text-xs text-muted-foreground sm:inline">{form.address}</span>
        <Badge variant={form.active ? "default" : "secondary"} className="ml-auto shrink-0">
          {form.active ? "Active" : "Inactive"}
        </Badge>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <CardContent className="space-y-3 border-t border-border pt-4">
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
      ) : null}
    </Card>
  );
}
