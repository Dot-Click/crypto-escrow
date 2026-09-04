import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepDef = { key: string; label: string };

export function Stepper({ steps, current }: { steps: StepDef[]; current: number }) {
  return (
    <div className="flex items-center" role="list" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-xs",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <div className={cn("mx-2 mb-5 h-px flex-1", done ? "bg-primary" : "bg-border")} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
