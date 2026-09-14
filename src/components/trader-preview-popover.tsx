// A soft-click preview of a trader — click their avatar/name in a trade chat
// to see a brief summary (country, trades, feedback, join date, verification)
// without leaving the trade room. "View full profile" links out to the real page.
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MapPin, ThumbsDown, ThumbsUp } from "lucide-react";
import { getTraderProfile } from "@/lib/trader-profile.functions";
import { COUNTRIES } from "@/lib/countries";
import { TraderLevelBadge } from "@/components/trader-level-badge";
import { UserAvatar } from "@/components/user-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

function countryName(code: string | null) {
  if (!code) return null;
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
  const fetchProfile = useServerFn(getTraderProfile);
  const profile = useQuery({
    queryKey: ["trader-profile", userId],
    queryFn: () => fetchProfile({ data: { userId } }),
    retry: false,
    enabled: false,
  });

  return (
    <Popover onOpenChange={(open) => open && void profile.refetch()}>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer text-left" aria-label={`Preview ${displayName}'s profile`}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        {profile.isLoading || profile.isPending ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : profile.error || !profile.data ? (
          <p className="py-4 text-center text-sm text-destructive">Couldn't load this trader.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <UserAvatar userId={profile.data.id} displayName={profile.data.displayName} className="size-11 shrink-0" />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  {profile.data.displayName}
                  <TraderLevelBadge tradesCompleted={profile.data.tradesCompleted} />
                </p>
                {profile.data.country ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {countryName(profile.data.country)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className={profile.data.isEmailVerified ? "gap-1 border-primary/40 text-primary" : "gap-1 text-muted-foreground"}>
                <BadgeCheck className="size-3" /> Email {profile.data.isEmailVerified ? "verified" : "unverified"}
              </Badge>
              <Badge variant="outline" className={profile.data.isVerified ? "gap-1 border-primary/40 text-primary" : "gap-1 text-muted-foreground"}>
                <BadgeCheck className="size-3" /> ID {profile.data.isVerified ? "verified" : "unverified"}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-muted/30 p-2 text-center">
              <div>
                <p className="mono text-sm font-semibold">{profile.data.tradesCompleted}</p>
                <p className="text-[10px] text-muted-foreground">Trades</p>
              </div>
              <div>
                <p className="mono flex items-center justify-center gap-1 text-sm font-semibold text-emerald-600">
                  <ThumbsUp className="size-3" /> {profile.data.positiveFeedback}
                </p>
                <p className="text-[10px] text-muted-foreground">Positive</p>
              </div>
              <div>
                <p className="mono flex items-center justify-center gap-1 text-sm font-semibold text-destructive">
                  <ThumbsDown className="size-3" /> {profile.data.negativeFeedback}
                </p>
                <p className="text-[10px] text-muted-foreground">Negative</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Joined {formatDate(profile.data.memberSince)}</p>

            <Link
              to="/traders/$userId"
              params={{ userId: profile.data.id }}
              className="block text-center text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              View full profile
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
