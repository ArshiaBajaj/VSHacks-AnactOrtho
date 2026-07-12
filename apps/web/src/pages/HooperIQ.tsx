import { useState } from "react";
import { HooperErrorBoundary, HooperSession } from "@/features/hooperiq";
import { CoachAnnotator } from "@/features/hooperiq/CoachAnnotator";

type Mode = "train" | "coach";

/** Independent HooperIQ training route — isolated from Live / Film / Recruit. */
export function HooperIQ() {
  const [mode, setMode] = useState<Mode>("train");

  return (
    <HooperErrorBoundary>
      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("train")}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider ${
            mode === "train" ? "bg-court-accent text-white" : "bg-white/10 text-court-muted"
          }`}
        >
          Train
        </button>
        <button
          type="button"
          onClick={() => setMode("coach")}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider ${
            mode === "coach" ? "bg-court-accent text-white" : "bg-white/10 text-court-muted"
          }`}
        >
          Coach annotate
        </button>
      </div>
      {mode === "train" ? <HooperSession /> : <CoachAnnotator />}
    </HooperErrorBoundary>
  );
}
