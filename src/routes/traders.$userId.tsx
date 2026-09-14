import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Flag,
  Send,
  Share2,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";
import { getTraderProfile } from "@/lib/trader-profile.functions";
import { getUserFeedback } from "@/lib/user-feedback.functions";
import { getViewerRelationship, setTrust } from "@/lib/user-relationships.functions";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { currencySymbol } from "@/lib/currencies";
import { useAuth } from "@/hooks/useAuth";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { UserAvatar } from "@/components/user-avatar";
import { CoinIcon } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { SendCryptoDialog } from "@/components/send-crypto-dialog";
import { ReportUserDialog } from "@/components/report-user-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/traders/$userId")({
  head: () => ({
    meta: [{ title: "Trader profile — CEMP" }],
  }),
  component: TraderProfilePage,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatRelative(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function TraderProfilePage() {
  const { userId } = Route.useParams();
  const { user: viewer } = useAuth();
  const qc = useQueryClient();
  const isSelf = viewer?.id === userId;

  const [offersSide, setOffersSide] = useState<"buy" | "sell">("buy");
  const [sendOpen, setSendOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const fetchProfile = useServerFn(getTraderProfile);
  const profile = useQuery({
    queryKey: ["trader-profile", userId],
    queryFn: () => fetchProfile({ data: { userId } }),
    retry: false,
  });

  const fetchRelationship = useServerFn(getViewerRelationship);
  const relationship = useQuery({
    queryKey: ["viewer-relationship", userId],
    queryFn: () => fetchRelationship({ data: { targetUserId: userId } }),
    enabled: !!viewer && !isSelf,
  });

  const fetchFeedback = useServerFn(getUserFeedback);
  const feedback = useQuery({
    queryKey: ["user-feedback", userId],
    queryFn: () => fetchFeedback({ data: { userId } }),
  });

  const setTrustFn = useServerFn(setTrust);
  const trustMutation = useMutation({
    mutationFn: (trusted: boolean) => setTrustFn({ data: { targetUserId: userId, trusted } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["viewer-relationship", userId] });
      void qc.invalidateQueries({ queryKey: ["trader-profile", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareProfile = () => {
    void navigator.clipboard.writeText(window.location.href);
    toast.success("Profile link copied");
  };

  if (profile.isLoading) {
    return <div className="mx-auto w-full max-w-[1400px] px-4 py-10 text-sm text-muted-foreground">Loading trader profile…</div>;
  }
  if (profile.error || !profile.data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 text-sm text-destructive">
        Couldn't find that trader.
      </div>
    );
  }

  const p = profile.data;
  const buyOffers = p.activeListings.filter((l) => l.side === "buy");
  const sellOffers = p.activeListings.filter((l) => l.side === "sell");
  const visibleOffers = offersSide === "buy" ? buyOffers : sellOffers;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-10">
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <UserAvatar userId={p.id} displayName={p.displayName} className="size-14 shrink-0 text-lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold">{p.displayName}</h1>
                <TraderLevelBadge tradesCompleted={p.tradesCompleted} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={p.isOnline ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-muted-foreground/40"} />
                  {p.isOnline ? "Active now" : `Last seen ${formatRelative(p.lastSeenAt)}`}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Joined {formatDate(p.memberSince)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className={p.isEmailVerified ? "gap-1 border-primary/40 text-primary" : "gap-1 text-muted-foreground"}>
                  <BadgeCheck className="size-3.5" /> Email {p.isEmailVerified ? "verified" : "unverified"}
                </Badge>
                <Badge variant="outline" className={p.isVerified ? "gap-1 border-primary/40 text-primary" : "gap-1 text-muted-foreground"}>
                  <BadgeCheck className="size-3.5" /> ID {p.isVerified ? "verified" : "unverified"}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSelf ? (
              <Button variant="outline" asChild>
                <Link to="/account">Edit profile</Link>
              </Button>
            ) : (
              <>
                <Button className="gap-1.5" onClick={() => setSendOpen(true)}>
                  <Send className="size-4" /> Send crypto
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={shareProfile}>
                  <Share2 className="size-4" /> Share profile
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="py-5">
          <p className="mb-1 text-sm font-medium">Bio</p>
          <p className="text-sm text-muted-foreground">
            {p.bio || `${isSelf ? "You haven't" : "This user hasn't"} added a bio yet.`}
          </p>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        <div className="bg-card p-4">
          <div className="mono flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-emerald-600">
            <ThumbsUp className="size-4" /> {p.positiveFeedback}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Positive feedback</div>
        </div>
        <div className="bg-card p-4">
          <div className="mono flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-destructive">
            <ThumbsDown className="size-4" /> {p.negativeFeedback}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Negative feedback</div>
        </div>
        <div className="col-span-2 bg-card p-4 sm:col-span-1">
          <div className="mono text-2xl font-semibold tabular-nums">
            {p.tradeSuccessRate30d != null ? `${p.tradeSuccessRate30d}%` : "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Trade success (30d)</div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">
            <Users className="size-3.5" /> Trusted by: {p.trustedByCount}
          </Badge>
          <Badge variant="secondary">Blocked by: {p.blockedByCount}</Badge>
          <Badge variant="secondary">Has blocked: {p.hasBlockedCount}</Badge>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowMore((v) => !v)}>
            {showMore ? "View less" : "View more"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {!isSelf && viewer ? (
            <>
              <Button
                variant={relationship.data?.isTrusted ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                disabled={trustMutation.isPending}
                onClick={() => trustMutation.mutate(!relationship.data?.isTrusted)}
              >
                <ShieldCheck className="size-4" />
                {relationship.data?.isTrusted ? "Trusted" : "Trust"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {showMore ? (
        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
          <div className="bg-card p-4">
            <div className="mono text-lg font-semibold tabular-nums">
              {p.avgPaymentMinutes30d != null ? `${p.avgPaymentMinutes30d} min` : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Avg payment (30d)</div>
          </div>
          <div className="bg-card p-4">
            <div className="mono text-lg font-semibold tabular-nums">
              {p.avgReleaseMinutes30d != null ? `${p.avgReleaseMinutes30d} min` : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Avg release (30d)</div>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="offers" className="mb-6">
        <TabsList>
          <TabsTrigger value="offers">Offers {p.activeListings.length}</TabsTrigger>
          <TabsTrigger value="feedback">Feedbacks {p.positiveFeedback + p.negativeFeedback}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="offers">
          <div className="mb-3 flex gap-2">
            <Button size="sm" variant={offersSide === "buy" ? "default" : "outline"} onClick={() => setOffersSide("buy")}>
              Buy {buyOffers.length}
            </Button>
            <Button size="sm" variant={offersSide === "sell" ? "default" : "outline"} onClick={() => setOffersSide("sell")}>
              Sell {sellOffers.length}
            </Button>
          </div>
          {visibleOffers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active offers right now.</p>
          ) : (
            <div className="space-y-2">
              {visibleOffers.map((l) => (
                <Link
                  key={l.id}
                  to="/listings/$id"
                  params={{ id: l.id }}
                  className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      <CoinIcon code={l.cryptoType} className="size-4" />
                      {l.side === "sell" ? "Selling" : "Buying"} {l.cryptoType}
                      <span className="mono text-xs font-normal text-muted-foreground">
                        {l.marginPercent > 0 ? "+" : ""}
                        {l.marginPercent}%
                      </span>
                    </span>
                    <p className="mono text-xs text-muted-foreground">
                      {currencySymbol(l.fiatCurrency)}
                      {l.price.toLocaleString()} / {l.cryptoType}
                      {l.minAmount != null && l.maxAmount != null
                        ? ` · ${currencySymbol(l.fiatCurrency)}${l.minAmount.toLocaleString()}–${currencySymbol(l.fiatCurrency)}${l.maxAmount.toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {l.acceptedPaymentMethods.map((m) => (
                      <Badge key={m} variant="secondary" className="gap-1 font-normal">
                        <PaymentRailIcon railKey={railKeyForMethod(m)} className="size-3.5" />
                        {m}
                        {railKeyForMethod(m) === "gift_card" ? (
                          <span className="text-[10px] text-muted-foreground">No KYC Required</span>
                        ) : null}
                      </Badge>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="feedback">
          {feedback.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (feedback.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback yet.</p>
          ) : (
            <div className="space-y-2">
              {feedback.data!.items.map((f) => (
                <div key={f.id} className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
                  {f.isPositive ? (
                    <ThumbsUp className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <ThumbsDown className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{f.raterDisplayName}</span>
                      {f.paymentMethod ? <span className="text-muted-foreground"> · {f.paymentMethod}</span> : null}
                    </p>
                    {f.comment ? <p className="text-sm text-muted-foreground">{f.comment}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">{formatRelative(f.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {p.volumeByCrypto.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed trades yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {p.volumeByCrypto.map((v) => (
                <Badge key={v.cryptoType} variant="secondary" className="gap-1.5 font-normal">
                  <CoinIcon code={v.cryptoType} className="size-4" />
                  {v.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {v.cryptoType} released
                </Badge>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Card className="mb-6">
        <CardContent className="p-5">
          <p className="mb-3 text-sm font-medium">By payment method</p>
          {p.methodBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed trades yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-normal">Payment method</th>
                    <th className="pb-2 font-normal">Trades</th>
                    <th className="pb-2 font-normal">Positive</th>
                    <th className="pb-2 font-normal">Negative</th>
                  </tr>
                </thead>
                <tbody>
                  {p.methodBreakdown.map((m) => (
                    <tr key={m.method} className="border-b border-border/60 last:border-0">
                      <td className="py-2">
                        <span className="flex items-center gap-1.5">
                          <PaymentRailIcon railKey={railKeyForMethod(m.method)} className="size-3.5" />
                          {m.method}
                        </span>
                      </td>
                      <td className="mono py-2">{m.trades}</td>
                      <td className="mono py-2 text-emerald-600">{m.positive > 0 ? `+${m.positive}` : "—"}</td>
                      <td className="mono py-2 text-destructive">{m.negative > 0 ? `−${m.negative}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!isSelf ? (
        <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setReportOpen(true)}>
          <Flag className="size-3.5" /> Report this user
        </Button>
      ) : null}

      {!isSelf ? (
        <>
          <SendCryptoDialog
            open={sendOpen}
            onOpenChange={setSendOpen}
            recipientUserId={p.id}
            recipientDisplayName={p.displayName}
          />
          <ReportUserDialog open={reportOpen} onOpenChange={setReportOpen} userId={p.id} displayName={p.displayName} />
        </>
      ) : null}
    </div>
  );
}
