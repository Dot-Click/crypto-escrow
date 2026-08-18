import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Lock, ShieldAlert } from "lucide-react";
import {
  cancelTrade,
  getTrade,
  markPaymentSent,
  openDispute,
  releaseEscrow,
} from "@/lib/trades.functions";
import { TRADE_STATUS_LABEL, type TradeStatus } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_authenticated/trades/$tradeId")({
  head: () => ({
    meta: [
      { title: "Trade room — EscrowP2P" },
      { name: "description", content: "Escrow-protected trade room: fund, pay, release." },
      { property: "og:title", content: "Trade room — EscrowP2P" },
      { property: "og:description", content: "Escrow-protected trade room: fund, pay, release." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TradeRoom,
});

const STEPS: TradeStatus[] = ["escrow_funded", "payment_claimed", "released"];

function TradeRoom() {
  const { tradeId } = Route.useParams();
  const qc = useQueryClient();
  const fetchTrade = useServerFn(getTrade);
  const [reason, setReason] = useState("");

  const trade = useQuery({
    queryKey: ["trade", tradeId],
    queryFn: () => fetchTrade({ data: { tradeId } }),
    refetchInterval: 8000,
  });

  const onSettled = (success: string) => ({
    onSuccess: () => {
      toast.success(success);
      void qc.invalidateQueries({ queryKey: ["trade", tradeId] });
      void qc.invalidateQueries({ queryKey: ["trades"] });
      void qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paidFn = useServerFn(markPaymentSent);
  const releaseFn = useServerFn(releaseEscrow);
  const cancelFn = useServerFn(cancelTrade);

  const paid = useMutation({
    mutationFn: () => paidFn({ data: { tradeId } }),
    ...onSettled("Payment marked as sent"),
  });
  const release = useMutation({
    mutationFn: () => releaseFn({ data: { tradeId } }),
    ...onSettled("Escrow released to the buyer"),
  });
  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { tradeId } }),
    ...onSettled("Trade cancelled and escrow refunded"),
  });

  const disputeFn = useServerFn(openDispute);
  const dispute = useMutation({
    mutationFn: () => disputeFn({ data: { tradeId, reason } }),
    onSuccess: () => {
      toast.success("Dispute opened — an admin will review it");
      setReason("");
      void qc.invalidateQueries({ queryKey: ["trade", tradeId] });
      void qc.invalidateQueries({ queryKey: ["trades"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (trade.isLoading) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading trade room…</p>;
  }
  if (trade.error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-destructive">{(trade.error as Error).message}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/trades">Back to trades</Link>
        </Button>
      </div>
    );
  }

  const d = trade.data!;
  const t = d.trade;
  const isBuyer = d.role === "buyer";
  const counterparty = isBuyer ? t.seller : t.buyer;
  const stepIndex = STEPS.indexOf(t.status as TradeStatus);
  const active = t.status === "escrow_funded" || t.status === "payment_claimed";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/trades">
          <ArrowLeft className="mr-1 size-4" /> All trades
        </Link>
      </Button>

      <div className="mb-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">
            {t.amount} {t.crypto_type}
          </h1>
          <Badge variant={t.status === "released" ? "default" : active ? "secondary" : "destructive"}>
            {TRADE_STATUS_LABEL[t.status as TradeStatus] ?? t.status}
          </Badge>
          <Badge variant="outline">You are the {d.role}</Badge>
        </div>
        <p className="mono text-sm text-muted-foreground">
          ${Number(t.price).toLocaleString()} per {t.crypto_type} · total $
          {(t.amount * t.price).toLocaleString()} {t.fiat_currency} · {t.payment_method}
        </p>
        <p className="text-xs text-muted-foreground">
          Trading with {counterparty?.display_name ?? "Trader"} ·{" "}
          {counterparty?.trades_completed ?? 0} completed trades
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4 text-primary" /> Escrow status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="grid gap-2 sm:grid-cols-3">
            {[
              { label: "Crypto in escrow", hint: `${t.amount} ${t.crypto_type} held from the seller's wallet` },
              { label: "Buyer pays seller", hint: `Off-platform via ${t.payment_method}` },
              { label: "Escrow released", hint: "Balance moves to the buyer's wallet" },
            ].map((s, i) => {
              const done = stepIndex >= i && t.status !== "cancelled";
              return (
                <li
                  key={s.label}
                  className={`rounded-md border p-3 text-sm ${
                    done ? "border-primary/60 bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="font-medium">
                    {i + 1}. {s.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
                </li>
              );
            })}
          </ol>

          {d.terms ? (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium">Seller terms</p>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{d.terms}</p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {d.dispute ? (
        <Card className="mb-4 border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-destructive" /> Dispute {d.dispute.status}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {d.dispute.reason}
            <p className="mt-2 text-xs">
              Escrow stays held until an admin resolves this. No automated resolution.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {active ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              {isBuyer ? (
                <Button
                  className="w-full sm:w-auto"
                  disabled={t.status !== "escrow_funded" || paid.isPending}
                  onClick={() => paid.mutate()}
                >
                  {t.status === "escrow_funded" ? "I have paid the seller" : "Payment confirmed"}
                </Button>
              ) : (
                <Button
                  className="w-full sm:w-auto"
                  disabled={release.isPending}
                  onClick={() => release.mutate()}
                >
                  Release escrow to buyer
                </Button>
              )}
              {t.status === "escrow_funded" ? (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  Cancel trade
                </Button>
              ) : null}
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium">Something wrong? Open a dispute</p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe what happened (payment not received, wrong amount…)"
                rows={3}
              />
              <Button
                variant="destructive"
                size="sm"
                disabled={reason.trim().length < 10 || dispute.isPending}
                onClick={() => dispute.mutate()}
              >
                Open dispute
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            This trade is {TRADE_STATUS_LABEL[t.status as TradeStatus] ?? t.status}. No further actions.
          </CardContent>
        </Card>
      )}

      <p className="pt-4 text-center text-xs text-muted-foreground">
        Real-time chat with payment proof arrives in the next phase.
      </p>
    </div>
  );
}
