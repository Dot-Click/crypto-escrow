import { useEffect, useState } from "react";
import { avatarUrl } from "@/lib/avatar";
import { cn } from "@/lib/utils";

/**
 * Renders the user's uploaded avatar if one exists at the deterministic
 * storage path, falling back to an initial-letter circle otherwise —
 * `getPublicUrl` always returns a URL even when nothing's been uploaded, so
 * the fallback is driven by the <img> actually failing to load, not a flag.
 */
export function UserAvatar({
  userId,
  displayName,
  className,
  cacheBust,
}: {
  userId: string;
  displayName: string;
  className?: string;
  /** Bump this (e.g. Date.now()) after an upload so the browser re-fetches the fixed-path URL instead of showing a cached 404 or the old image. */
  cacheBust?: number;
}) {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [cacheBust]);

  if (errored) {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
          className,
        )}
      >
        {displayName.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  const src = cacheBust ? `${avatarUrl(userId)}?v=${cacheBust}` : avatarUrl(userId);

  return (
    <img
      src={src}
      alt={displayName}
      onError={() => setErrored(true)}
      className={cn("rounded-full object-cover", className)}
    />
  );
}
