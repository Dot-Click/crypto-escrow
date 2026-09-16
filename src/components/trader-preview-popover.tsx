// A soft-click preview of a trader — click their avatar/name in a trade chat
// to see a brief history (country, trades, feedback, join date, trust/block)
// without leaving the trade room. "View full profile" links out to the real page.
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, ExternalLink, ShieldCheck, ShieldX, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import { getTraderProfile } from "@/lib/trader-profile.functions";
import { getViewerRelationship, setBlock, setTrust } from "@/lib/user-relationships.functions";
import { useAuth } from "@/hooks/useAuth";
import { countryFlagEmoji, countryName } from "@/lib/countries";
import { CoinIcon } from "@/components/coin-icon";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { UserAvatar } from "@/components/user-avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function TraderPreviewPopover({
  userId,
  displayName,
  children,
}: {
  userId: string;
  displayName: string;
  children: React.ReactNode;
}) {
  const { user: viewer } = useAuth();
  const qc = useQueryClient();
  const isSelf = viewer?.id === userId;

  const fetchProfile = useServerFn(getTraderProfile);
  const profile = useQuery({
    queryKey: ["trader-profile", userId],
    queryFn: () => fetchProfile({ data: { userId } }),
    retry: false,
    enabled: false,
  });

  const fetchRelationship = useServerFn(getViewerRelationship);
  const relationship = useQuery({
    queryKey: ["viewer-relationship", userId],
    queryFn: () => fetchRelationship({ data: { targetUserId: userId } }),
    enabled: false,
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

  const handleOpenChange = (o: boolean) => {
    if (o) {
      void profile.refetch();
      if (!isSelf && viewer) void relationship.refetch();
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button type="button" className="cursor-pointer text-left" aria-label={`Preview ${displayName}'s profile`}>
          {children}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Profile info</DialogTitle>
        </DialogHeader>
        {profile.isLoading || profile.isPending ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : profile.error || !profile.data ? (
          <p className="py-4 text-center text-sm text-destructive">Couldn't load this trader.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <UserAvatar userId={profile.data.id} displayName={profile.data.displayName} className="size-11 shrink-0" />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {profile.data.country ? <span>{countryFlagEmoji(profile.data.country)}</span> : null}
                    {profile.data.displayName}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TraderLevelBadge tradesCompleted={profile.data.tradesCompleted} />
                    {profile.data.country ? countryName(profile.data.country) : "Country not set"}
                  </p>
                </div>
              </div>
              <Link
                to="/traders/$userId"
                params={{ userId: profile.data.id }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Open full profile"
              >
                <ExternalLink className="size-4" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="mono font-medium">{profile.data.tradesCompleted} Trades</span>
              <span className="mono flex items-center gap-1 text-emerald-600">
                <ThumbsUp className="size-3.5" /> {profile.data.positiveFeedback}
              </span>
              <span className="mono flex items-center gap-1 text-destructive">
                <ThumbsDown className="size-3.5" /> {profile.data.negativeFeedback}
              </span>
            </div>

            {!isSelf && viewer ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={relationship.data?.isTrusted ? "default" : "outline"}
                  className="flex-1 gap-1.5"
                  disabled={trustMutation.isPending}
                  onClick={() => trustMutation.mutate(!relationship.data?.isTrusted)}
                >
                  <ShieldCheck className="size-4" />
                  {relationship.data?.isTrusted ? "Trusted" : "Trust"}
                </Button>
                <Button
                  size="sm"
                  variant={relationship.data?.isBlocked ? "destructive" : "outline"}
                  className="flex-1 gap-1.5"
                  disabled={blockMutation.isPending || (!relationship.data?.canBlock && !relationship.data?.isBlocked)}
                  title={!relationship.data?.canBlock && !relationship.data?.isBlocked ? "You can only block someone you've traded with" : undefined}
                  onClick={() => blockMutation.mutate(!relationship.data?.isBlocked)}
                >
                  <ShieldX className="size-4" />
                  {relationship.data?.isBlocked ? "Blocked" : "Block"}
                </Button>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="font-medium">{formatDate(profile.data.memberSince)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Partners</p>
                <p className="mono font-medium">{profile.data.uniquePartners}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trusted by</p>
                <p className="mono flex items-center gap-1 font-medium">
                  <Users className="size-3.5 text-muted-foreground" /> {profile.data.trustedByCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Blocked by</p>
                <p className="mono font-medium">{profile.data.blockedByCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Has blocked</p>
                <p className="mono font-medium">{profile.data.hasBlockedCount}</p>
              </div>
            </div>

            {profile.data.volumeByCrypto.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Volume traded</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.data.volumeByCrypto.map((v) => (
                    <Badge key={v.cryptoType} variant="secondary" className="gap-1.5 font-normal">
                      <CoinIcon code={v.cryptoType} className="size-3.5" />
                      {v.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {v.cryptoType}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
              <p className="mr-1 text-xs text-muted-foreground">Account status:</p>
              <Badge variant="outline" className={profile.data.isVerified ? "gap-1 border-primary/40 text-primary" : "gap-1 text-muted-foreground"}>
                <BadgeCheck className="size-3" /> {profile.data.isVerified ? "Verified" : "Unverified"}
              </Badge>
              <Badge variant="outline" className={profile.data.isEmailVerified ? "gap-1 border-primary/40 text-primary" : "gap-1 text-muted-foreground"}>
                <BadgeCheck className="size-3" /> Email {profile.data.isEmailVerified ? "verified" : "unverified"}
              </Badge>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
