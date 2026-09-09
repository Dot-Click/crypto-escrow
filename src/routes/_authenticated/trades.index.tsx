import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { listMyTrades } from "@/lib/trades.functions";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { TRADE_STATUS_LABEL, type TradeStatus } from "@/lib/constants";
import { CoinIcon } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/trades/")({
  head: () => ({
    meta: [
      { title: "My trades — CEMP" },
      { name: "description", content: "Track your escrow-protected P2P crypto trades." },
      { property: "og:title", content: "My trades — CEMP" },
      { property: "og:description", content: "Track your escrow-protected P2P crypto trades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TradesPage,
});

export function statusVariant(status: string) {
  if (status === "released") return "default" as const;
  if (status === "disputed" || status === "cancelled") return "destructive" as const;
  return "secondary" as const;
}

const ACTIVE_STATUSES = ["pending", "escrow_funded", "payment_claimed", "disputed"];

function TradesPage() {
  const fetchTrades = useServerFn(listMyTrades);
  const trades = useQuery({ queryKey: ["trades"], queryFn: () => fetchTrades() });
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [search, setSearch] = useState("");

  const all = trades.data ?? [];

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((t) => {
      if (status === "active" ? !ACTIVE_STATUSES.includes(t.status) : status !== "all" && t.status !== status) {
        return false;
      }
      if (role !== "all" && t.role !== role) return false;
      if (!term) return true;
      const counterparty = t.role === "buyer" ? t.seller?.display_name : t.buyer?.display_name;
      return [t.id, t.crypto_type, t.payment_method, counterparty]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [all, status, role, search]);

  const settled = all.filter((t) => t.status === "released");
  const volume = settled.reduce((sum, t) => sum + t.amount * t.price, 0);

  const exportCsv = () => {
    const header = [
      "trade_id",
      "date",
      "role",
      "counterparty",
      "crypto",
      "amount",
      "unit_price",
      "total",
      "currency",
      "payment_method",
      "status",
    ];
    const lines = rows.map((t) => {
      const counterparty = (t.role === "buyer" ? t.seller?.display_name : t.buyer?.display_name) ?? "";
      return [
        t.id,
        new Date(t.created_at).toISOString(),
        t.role,
        counterparty,
        t.crypto_type,
        t.amount,
        t.price,
        (t.amount * t.price).toFixed(2),
        t.fiat_currency,
        t.payment_method ?? "",
        t.status,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `escrowp2p-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trade history</h1>
          <p className="text-sm text-muted-foreground">Escrow holds, payment status and settlement</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Browse offers</Link>
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Trades</p>
            <p className="mono text-lg font-semibold">{all.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active</p>
            <p className="mono text-lg font-semibold">
              {all.filter((t) => ACTIVE_STATUSES.includes(t.status)).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed</p>
            <p className="mono text-lg font-semibold">{settled.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Settled volume</p>
            <p className="mono text-lg font-semibold">${volume.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-border bg-muted p-3 sm:grid-cols-[9rem_9rem_1fr]">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            {Object.entries(TRADE_STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any side</SelectItem>
            <SelectItem value="buyer">As buyer</SelectItem>
            <SelectItem value="seller">As seller</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search coin, counterparty, payment method"
        />
      </div>

      {trades.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading trades…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {all.length === 0
              ? "No trades yet — start one from the marketplace."
              : "No trades match these filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <CoinIcon code={t.crypto_type} className="size-4" />
                      {t.amount} {t.crypto_type}
                    </span>
                    <Badge variant={statusVariant(t.status)}>
                      {TRADE_STATUS_LABEL[t.status as TradeStatus] ?? t.status}
                    </Badge>
                    <Badge variant="outline">You are the {t.role}</Badge>
                  </div>
                  <p className="mono flex items-center gap-1.5 text-sm text-muted-foreground">
                    ${(t.amount * t.price).toLocaleString()} total ·
                    <PaymentRailIcon railKey={railKeyForMethod(t.payment_method ?? "")} className="size-3.5" />
                    {t.payment_method ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    With {t.role === "buyer" ? t.seller?.display_name : t.buyer?.display_name} ·{" "}
                    {new Date(t.created_at).toLocaleString()}
                  </p>
                </div>
                <Button asChild className="w-full sm:w-auto">
                  <Link to="/trades/$tradeId" params={{ tradeId: t.id }}>
                    Open trade room
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
