const STEPS = [
  { id: "setup", label: "Setup" },
  { id: "live", label: "Live" },
  { id: "report", label: "Report" },
] as const;

export type LiveStep = (typeof STEPS)[number]["id"];

export function LiveSteps({ current }: { current: LiveStep }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="mb-6 flex items-center gap-1 sm:gap-2">
      {STEPS.map((step, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-1 sm:gap-2">
            <div
              className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 sm:px-3 ${
                active
                  ? "border-court-accent/50 bg-court-accent/10"
                  : done
                    ? "border-white/10 bg-white/[0.04]"
                    : "border-white/5 bg-transparent"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold ${
                  active
                    ? "bg-court-accent text-white"
                    : done
                      ? "bg-white/15 text-white"
                      : "bg-white/5 text-court-muted"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`truncate text-xs font-semibold uppercase tracking-wider ${
                  active ? "text-white" : done ? "text-white/70" : "text-white/35"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={`hidden h-px w-3 shrink-0 sm:block ${
                  done ? "bg-white/30" : "bg-white/10"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
