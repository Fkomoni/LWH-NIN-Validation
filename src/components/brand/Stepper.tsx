import { cn } from "@/lib/cn";

export type StepKey = "authenticate" | "household" | "enter-nin" | "validate" | "done";

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "authenticate", label: "Authenticate" },
  { key: "household", label: "Review household" },
  { key: "enter-nin", label: "Enter NIN" },
  { key: "validate", label: "Validate" },
  { key: "done", label: "Done" },
];

export function Stepper({ current }: { current: StepKey }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex flex-wrap items-center gap-y-2">
        {STEPS.map((step, i) => {
          const state =
            i < currentIdx ? "complete" : i === currentIdx ? "current" : "upcoming";
          return (
            <li key={step.key} className="flex items-center">
              <div
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2",
                  state === "complete" && "text-primary",
                  state === "current" && "font-semibold text-foreground",
                  state === "upcoming" && "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-xs",
                    state === "complete" && "border-primary bg-primary text-primary-foreground",
                    state === "current" && "border-primary text-primary",
                    state === "upcoming" && "border-muted",
                  )}
                >
                  {i + 1}
                </span>
                <span className="text-sm">{step.label}</span>
              </div>
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-3 h-px w-8 sm:w-12",
                    state === "complete" ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
