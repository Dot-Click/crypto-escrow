import { Badge } from "@/components/ui/badge";
import { traderLevel } from "@/lib/trader-level";

export function TraderLevelBadge({
  tradesCompleted,
  className,
}: {
  tradesCompleted: number;
  className?: string;
}) {
  const level = traderLevel(tradesCompleted);
  return (
    <Badge variant="outline" className={`${level.className} font-medium ${className ?? ""}`}>
      {level.label}
    </Badge>
  );
}
