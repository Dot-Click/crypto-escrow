import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  BadgeCheck,
  Flag,
  History,
  Info,
  MessagesSquare,
  Pencil,
  Plus,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ThumbsDown,
  ThumbsUp,
  Users,
  UserPlus,
  UserX,
} from "lucide-react";
import { getTraderProfile } from "@/lib/trader-profile.functions";
import { getUserFeedback } from "@/lib/user-feedback.functions";
import { getViewerRelationship, setBlock, setTrust } from "@/lib/user-relationships.functions";
import { railKeyForMethod } from "@/lib/payment-taxonomy";
import { currencySymbol } from "@/lib/currencies";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { UserAvatar } from "@/components/user-avatar";
import { CoinIcon } from "@/components/coin-icon";
import { PaymentRailIcon } from "@/components/payment-rail-icon";
import { SendCryptoDialog } from "@/components/send-crypto-dialog";
import { ReportUserDialog } from "@/components/report-user-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BIO_MAX_LENGTH = 500;

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
  const [offersSort, setOffersSort] = useState<"price-asc" | "price-desc">("price-asc");
  const [sendOpen, setSendOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bioEditing, setBioEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState("");

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

  const setBlockFn = useServerFn(setBlock);
  const blockMutation = useMutation({
    mutationFn: (blocked: boolean) => setBlockFn({ data: { targetUserId: userId, blocked } }),
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

  const saveBio = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ bio: bioDraft.trim() || null })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      setBioEditing(false);
      void qc.invalidateQueries({ queryKey: ["trader-profile", userId] });
      toast.success("Bio updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
  const visibleOffers = [...(offersSide === "buy" ? buyOffers : sellOffers)].sort((a, b) =>
    offersSort === "price-asc" ? a.price - b.price : b.price - a.price,
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-10">
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
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
                <>
                  <Button variant="outline" className="gap-1.5" asChild>
                    <Link to="/account">
                      <Pencil className="size-4" /> Edit profile
                    </Link>
                  </Button>
                  <Button variant="outline" className="gap-1.5" onClick={shareProfile}>
                    <Share2 className="size-4" /> Share profile
                  </Button>
                </>
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

        <Card>
          {bioEditing ? (
            <CardContent className="space-y-2 py-5">
              <Textarea
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value.slice(0, BIO_MAX_LENGTH))}
                placeholder="Tell other traders a bit about yourself…"
                rows={4}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Maximum {BIO_MAX_LENGTH} characters · {bioDraft.length}/{BIO_MAX_LENGTH}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={saveBio.isPending}
                  onClick={() => saveBio.mutate()}
                >
                  {saveBio.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={saveBio.isPending}
                  onClick={() => setBioEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          ) : (
            <CardContent className="flex h-full flex-col items-center justify-center gap-2 py-5 text-center">
              <p className="text-sm font-medium">{p.bio || `${isSelf ? "You haven't" : "This user hasn't"} added a bio yet.`}</p>
              {isSelf ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setBioDraft(p.bio ?? "");
                    setBioEditing(true);
                  }}
                >
                  <Pencil className="size-3.5" /> Edit
                </Button>
              ) : null}
            </CardContent>
          )}
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  Positive feedback <ThumbsUp className="size-3.5 text-emerald-600" />
                </p>
                <p className="mono text-2xl font-semibold tabular-nums text-emerald-600">+{p.positiveFeedback}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  Negative feedback <ThumbsDown className="size-3.5 text-destructive" />
                </p>
                <p className="mono text-2xl font-semibold tabular-nums text-destructive">−{p.negativeFeedback}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Trades success (30d)</p>
                <p className="mono text-2xl font-semibold tabular-nums">
                  {p.tradeSuccessRate30d != null ? `${p.tradeSuccessRate30d}%` : "—"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 font-normal">
                <UserPlus className="size-3.5" /> Trusted by: {p.trustedByCount}
              </Badge>
              <Badge variant="secondary" className="gap-1 font-normal">
                <UserX className="size-3.5" /> Blocked by: {p.blockedByCount}
              </Badge>
              <Badge variant="secondary" className="gap-1 font-normal">
                <Users className="size-3.5" /> Has blocked: {p.hasBlockedCount}
              </Badge>
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
                  <Button
                    variant={relationship.data?.isBlocked ? "destructive" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    disabled={blockMutation.isPending || (!relationship.data?.canBlock && !relationship.data?.isBlocked)}
                    title={
                      !relationship.data?.canBlock && !relationship.data?.isBlocked
                        ? "You can only block someone you've traded with"
                        : undefined
                    }
                    onClick={() => blockMutation.mutate(!relationship.data?.isBlocked)}
                  >
                    <UserX className="size-4" />
                    {relationship.data?.isBlocked ? "Blocked" : "Block"}
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
            <span>
              Trades released <span className="mono font-medium text-foreground">{p.tradesCompleted}</span>
            </span>
            <span aria-hidden="true">|</span>
            <span>
              Trade partners <span className="mono font-medium text-foreground">{p.uniquePartners}</span>
            </span>
            <span aria-hidden="true">|</span>
            <span>
              Avg. payment (30d){" "}
              <span className="mono font-medium text-foreground">
                {p.avgPaymentMinutes30d != null ? `${p.avgPaymentMinutes30d} min` : "—"}
              </span>
            </span>
            <span aria-hidden="true">|</span>
            <span>
              Avg. release (30d){" "}
              <span className="mono font-medium text-foreground">
                {p.avgReleaseMinutes30d != null ? `${p.avgReleaseMinutes30d} min` : "—"}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="py-5">
          <Tabs defaultValue="offers">
            <TabsList className="mb-4 h-auto bg-transparent p-0">
              <TabsTrigger value="offers" className="gap-1.5 data-[state=active]:bg-muted">
                <ShoppingBag className="size-4" /> Offers
                <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center px-1 font-normal">
                  {p.activeListings.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="feedback" className="gap-1.5 data-[state=active]:bg-muted">
                <MessagesSquare className="size-4" /> Feedbacks
                <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center px-1 font-normal">
                  {p.positiveFeedback + p.negativeFeedback}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 data-[state=active]:bg-muted">
                <History className="size-4" /> History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="offers" className="mt-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    variant={offersSide === "buy" ? "default" : "outline"}
                    onClick={() => setOffersSide("buy")}
                  >
                    <ArrowDownCircle className="size-4" /> Buy
                    <Badge variant="destructive" className="ml-0.5 h-5 min-w-5 justify-center px-1 font-normal">
                      {buyOffers.length}
                    </Badge>
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    variant={offersSide === "sell" ? "default" : "outline"}
                    onClick={() => setOffersSide("sell")}
                  >
                    <ArrowUpCircle className="size-4" /> Sell
                    <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center px-1 font-normal">
                      {sellOffers.length}
                    </Badge>
                  </Button>
                </div>
                {visibleOffers.length > 0 ? (
                  <Select value={offersSort} onValueChange={(v) => setOffersSort(v as typeof offersSort)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="price-asc">Sort by price ↑</SelectItem>
                      <SelectItem value="price-desc">Sort by price ↓</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              {visibleOffers.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <ArrowLeftRight className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">No active {offersSide} offers</p>
                    <p className="text-sm text-muted-foreground">
                      {isSelf ? "Post an offer to start accepting trades." : "Check back later for new offers."}
                    </p>
                  </div>
                  {isSelf ? (
                    <Button className="gap-1.5" asChild>
                      <Link to="/listings/new">
                        <Plus className="size-4" /> Create offer
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleOffers.map((l) => (
                    <div
                      key={l.id}
                      className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        {l.acceptedPaymentMethods.map((m) => (
                          <Badge key={m} variant="secondary" className="gap-1 font-normal">
                            <PaymentRailIcon railKey={railKeyForMethod(m)} className="size-3.5" />
                            {m}
                            {railKeyForMethod(m) === "gift_card" ? (
                              <span className="text-[10px] text-muted-foreground">No KYC Required</span>
                            ) : null}
                          </Badge>
                        ))}
                        <Button variant="outline" size="icon" className="shrink-0" aria-label="Offer details" asChild>
                          <Link to="/listings/$id" params={{ id: l.id }}>
                            <Info className="size-4" />
                          </Link>
                        </Button>
                        <Button className="shrink-0 gap-1.5" asChild>
                          <Link to="/listings/$id" params={{ id: l.id }}>
                            <CoinIcon code={l.cryptoType} className="size-4" />
                            {l.side === "sell" ? "Buy" : "Sell"}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="feedback" className="mt-0">
              {feedback.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (feedback.data?.items.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <MessagesSquare className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">No feedback yet</p>
                    <p className="text-sm text-muted-foreground">Feedback appears here after a trade is released.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {feedback.data!.items.map((f) => (
                    <div key={f.id} className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
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

            <TabsContent value="history" className="mt-0">
              {p.volumeByCrypto.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <History className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">No trade history yet</p>
                    <p className="text-sm text-muted-foreground">Released trades will show up here.</p>
                  </div>
                </div>
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
        </CardContent>
      </Card>

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
