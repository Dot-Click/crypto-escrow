import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, Flag, Lock, ShieldAlert } from "lucide-react";
import {
  cancelTrade,
  getTrade,
  markPaymentSent,
  openDispute,
  releaseEscrow,
} from "@/lib/trades.functions";
import { listMessages } from "@/lib/messages.functions";
import { getTradePaymentDetails } from "@/lib/payment-methods.functions";
import { currencySymbol } from "@/lib/currencies";
import { TRADE_STATUS_LABEL, type TradeStatus } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { TradeChat } from "@/components/trade-chat";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { UserAvatar } from "@/components/user-avatar";

export const Route = createFileRoute("/_authenticated/trades/$tradeId")({
  head: () => ({
    meta: [
      { title: "Trade room — FOMN" },
      { name: "description", content: "Escrow-protected trade room: fund, pay, release." },
      { property: "og:title", content: "Trade room — FOMN" },
      { property: "og:description", content: "Escrow-protected trade room: fund, pay, release." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TradeRoom,
});

function useTicking() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Small mm:ss badge — e.g. embedded inside the "Mark as Paid" button. */
function CountdownBadge({ expiresAt }: { expiresAt: string }) {
  const now = useTicking();
  const msLeft = new Date(expiresAt).getTime() - now;
  if (msLeft <= 0) return null;
  const minutes = Math.floor(msLeft / 60_000);
  const seconds = Math.floor((msLeft % 60_000) / 1000);
  return (
    <span className="mono rounded-full bg-black/15 px-2 py-0.5 text-xs">
      {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

/** Live elapsed hh:mm:ss (or mm:ss) since a timestamp — for the "Trade time" row. */
function ElapsedTime({ since }: { since: string }) {
  const now = useTicking();
  const totalSeconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="mono">
      {h > 0 ? `${pad(h)}:` : ""}
      {pad(m)}:{pad(s)}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  pending: "border-border bg-muted/60 text-muted-foreground",
  escrow_funded: "border-primary/30 bg-primary/10 text-primary",
  payment_claimed: "border-warning/30 bg-warning/10 text-warning",
  released: "border-success/30 bg-success/10 text-success",
  disputed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted/60 text-muted-foreground",
};

function TradeRoom() {
  const { tradeId } = Route.useParams();
  const qc = useQueryClient();
  const fetchTrade = useServerFn(getTrade);
  const [reason, setReason] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const trade = useQuery({
    queryKey: ["trade", tradeId],
    queryFn: () => fetchTrade({ data: { tradeId } }),
    refetchInterval: 8000,
  });

  const fetchPaymentDetails = useServerFn(getTradePaymentDetails);
  const paymentDetails = useQuery({
    queryKey: ["trade-payment-details", tradeId],
    queryFn: () => fetchPaymentDetails({ data: { tradeId } }),
  });

  // Shares TradeChat's own query cache (same key) — no extra request. Used to
  // require the buyer attach proof of payment before "Mark as Paid" unlocks.
  const fetchMessages = useServerFn(listMessages);
  const messages = useQuery({
    queryKey: ["messages", tradeId],
    queryFn: () => fetchMessages({ data: { tradeId } }),
  });
  const hasPaymentProof = (messages.data ?? []).some((m) => m.mine && m.attachment_url);

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
  const counterpartyId = isBuyer ? t.seller_id : t.buyer_id;
  const active = t.status === "escrow_funded" || t.status === "payment_claimed";
  const total = t.amount * t.price;
  const symbol = currencySymbol(t.fiat_currency);
  const copyTradeId = () => {
    void navigator.clipboard.writeText(t.id);
    toast.success("Trade ID copied");
  };

  // Dispute rules: only once the buyer has marked payment as sent. The seller
  // can dispute immediately at that point; the buyer must wait 30 minutes
  // from when they claimed payment, giving the seller time to confirm.
  const canOpenDispute = t.status === "payment_claimed";
  const buyerWaitMs =
    canOpenDispute && isBuyer
      ? 30 * 60 * 1000 - (Date.now() - new Date(t.updated_at).getTime())
      : 0;
  const buyerMustWait = isBuyer && buyerWaitMs > 0;
  const buyerWaitMinutes = Math.ceil(buyerWaitMs / 60_000);

  const statusLabel = TRADE_STATUS_LABEL[t.status as TradeStatus] ?? t.status;
  const statusTone = STATUS_TONE[t.status] ?? STATUS_TONE["pending"];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6 lg:h-[calc(100dvh-3.5rem)]">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 shrink-0">
        <Link to="/trades">
          <ArrowLeft className="mr-1 size-4" /> All trades
        </Link>
      </Button>

      {/* Left sidebar (compact stacked panels) + right chat-first panel.
          Stacks to a single column below lg so mobile stays readable; on
          desktop the whole row is pinned to the viewport height and each
          column scrolls independently instead of the page itself scrolling. */}
      <div className="grid flex-1 gap-4 lg:min-h-0 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-stretch">
        {/* — Left sidebar — */}
        <div className="space-y-4 lg:overflow-y-auto lg:pr-1">
          {/* Trade status + timer */}
          <Card>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-primary" />
                <p className="text-sm font-semibold">{statusLabel}</p>
                <Badge variant="outline" className="ml-auto font-normal">
                  You are the {d.role}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Trade time</span>
                <ElapsedTime since={t.created_at} />
              </div>
            </CardContent>
          </Card>

          {/* Offer terms */}
          {d.terms ? (
            <Card>
              <CardContent className="space-y-1.5 py-4">
                <p className="text-sm font-medium">Offer terms</p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{d.terms}</p>
              </CardContent>
            </Card>
          ) : null}

          {/* Payment action */}
          {active ? (
            <Card>
              <CardContent className="space-y-3 py-4">
                {isBuyer ? (
                  <>
                    <p className="text-sm">
                      {t.status === "escrow_funded" ? (
                        <>
                          Make a payment of{" "}
                          <span className="font-semibold text-foreground">
                            {symbol}
                            {total.toLocaleString()} ({t.fiat_currency})
                          </span>{" "}
                          using <span className="font-semibold text-foreground">{t.payment_method}</span>{" "}
                          and press Mark as Paid below.
                        </>
                      ) : (
                        "You've marked this payment as sent. Waiting for the seller to confirm and release escrow."
                      )}
                    </p>
                    <Button
                      className="w-full justify-center gap-2"
                      disabled={
                        t.status !== "escrow_funded" ||
                        paid.isPending ||
                        !hasPaymentProof
                      }
                      onClick={() => paid.mutate()}
                    >
                      {t.status === "escrow_funded" ? "Mark as Paid" : "Payment confirmed"}
                      {t.status === "escrow_funded" && t.expires_at ? (
                        <CountdownBadge expiresAt={t.expires_at} />
                      ) : null}
                    </Button>
                    {t.status === "escrow_funded" ? (
                      <p className={`text-xs ${hasPaymentProof ? "text-muted-foreground" : "text-warning"}`}>
                        {hasPaymentProof
                          ? "Proof of payment attached — you can mark this trade as paid."
                          : "Attach your proof of payment (receipt or screenshot) in the chat first — you can't mark the trade as paid until you do."}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-sm">
                      {t.status === "escrow_funded" ? (
                        <>
                          Waiting for the buyer to send{" "}
                          <span className="font-semibold text-foreground">
                            {symbol}
                            {total.toLocaleString()}
                          </span>{" "}
                          via <span className="font-semibold text-foreground">{t.payment_method}</span>.
                        </>
                      ) : (
                        "The buyer says they've paid. Confirm receipt off-platform, then release escrow."
                      )}
                    </p>
                    <Button
                      className="w-full"
                      disabled={release.isPending}
                      onClick={() => release.mutate()}
                    >
                      Release escrow to buyer
                    </Button>
                  </>
                )}

                {isBuyer && t.status === "escrow_funded" ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate()}
                  >
                    Cancel trade
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4 text-sm text-muted-foreground">
                This trade is {statusLabel}. No further actions.
              </CardContent>
            </Card>
          )}

          {/* Dispute status, if one exists */}
          {d.dispute ? (
            <Card className="border-destructive/50">
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

          {/* Other actions — Report a problem opens the real dispute flow */}
          {active ? (
            <Card>
              <CardContent className="space-y-1 py-2">
                <p className="px-1 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                  Other actions
                </p>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-muted/50"
                  onClick={() => setReportOpen(!reportOpen)}
                  aria-expanded={reportOpen}
                >
                  <Flag className="size-4 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-medium">Report a problem</span>
                    <span className="block text-xs text-muted-foreground">
                      Open a dispute for an admin to review
                    </span>
                  </span>
                </button>

                {reportOpen ? (
                  <div className="space-y-2 border-t border-border p-2 pt-3">
                    {!canOpenDispute ? (
                      <p className="text-xs text-muted-foreground">
                        Disputes open once the buyer has marked payment as sent.
                      </p>
                    ) : buyerMustWait ? (
                      <p className="text-xs text-muted-foreground">
                        You can open a dispute in {buyerWaitMinutes} more minute
                        {buyerWaitMinutes === 1 ? "" : "s"} — this gives the seller time to confirm
                        your payment.
                      </p>
                    ) : null}
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Describe what happened (payment not received, wrong amount…)"
                      rows={3}
                      disabled={!canOpenDispute || buyerMustWait}
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      disabled={
                        !canOpenDispute ||
                        buyerMustWait ||
                        reason.trim().length < 10 ||
                        dispute.isPending
                      }
                      onClick={() => dispute.mutate()}
                    >
                      Open dispute
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Trade information */}
          <Card>
            <CardContent className="space-y-3 py-4 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Trade information</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Trade ID</p>
                  <button
                    type="button"
                    onClick={copyTradeId}
                    className="mono flex items-center gap-1 text-xs hover:text-primary"
                    title="Copy full trade ID"
                  >
                    {t.id.slice(0, 8)}…{t.id.slice(-4)}
                    <Copy className="size-3" />
                  </button>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trade started</p>
                  <p>{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Trade completed</p>
                  <p>
                    {t.status === "released" || t.status === "cancelled"
                      ? new Date(t.updated_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rate</p>
                  <p className="mono">
                    {t.amount} {t.crypto_type} ≈ {symbol}
                    {total.toLocaleString()}
                  </p>
                </div>
                {t.fee_amount > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Platform fee</p>
                    <p className="mono">
                      {t.fee_amount.toFixed(8)} {t.crypto_type}
                      <span className="ml-1 text-xs text-muted-foreground">
                        deducted from escrow at release
                      </span>
                    </p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* — Right panel: chat, header, and status banner. On desktop this
            column is a fixed-height flex layout — the chat card fills the
            remaining space and scrolls its own messages; it never grows the
            page. */}
        <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
          <div className="flex shrink-0 items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <UserAvatar
                userId={counterpartyId}
                displayName={counterparty?.display_name ?? "Trader"}
                className="size-9 shrink-0 text-sm"
              />
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/traders/$userId"
                    params={{ userId: counterpartyId }}
                    className="text-sm font-medium hover:underline"
                  >
                    {counterparty?.display_name ?? "Trader"}
                  </Link>
                  <TraderLevelBadge tradesCompleted={counterparty?.trades_completed ?? 0} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {counterparty?.trades_completed ?? 0} completed trades
                </p>
              </div>
            </div>
            <Badge variant="outline" className={statusTone}>
              {statusLabel}
            </Badge>
          </div>

          <TradeChat
            tradeId={t.id}
            counterpartyName={counterparty?.display_name ?? "Trader"}
            sellerName={t.seller?.display_name ?? "Seller"}
            paymentDetails={paymentDetails.data ?? null}
            disabled={!active && t.status !== "disputed"}
            hideHeader
            className="flex h-[32rem] flex-col lg:h-full lg:min-h-0 lg:flex-1"
            banner={
              <div className={`shrink-0 px-4 py-2.5 text-sm font-medium ${statusTone}`}>
                <span className="uppercase">{isBuyer ? "Buying" : "Selling"}</span> {t.amount}{" "}
                {t.crypto_type} for {symbol}
                {total.toLocaleString()} ({t.fiat_currency}) via {t.payment_method}
              </div>
            }
          />

          <p className="shrink-0 pt-1 text-center text-xs text-muted-foreground">
            Messages and attachments are kept as evidence for admin dispute review.
          </p>
        </div>
      </div>
    </div>
  );
}
