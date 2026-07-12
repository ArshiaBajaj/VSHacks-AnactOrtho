import { Router } from "express";
import type { Request, Response } from "express";

/**
 * Isolated HooperIQ API — mount at /api/hooperiq.
 * Returns rich mistake / consequence coaching JSON.
 */

type Mistake = { triggers?: string[]; mistake?: string; consequence?: string };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => {
    const n = normalize(p);
    if (!n) return false;
    if (text.includes(n)) return true;
    const parts = n.split(" ").filter((w) => w.length > 2);
    return parts.length > 0 && parts.every((w) => text.includes(w));
  });
}

function assess(body: Record<string, unknown>) {
  const transcript = normalize(String(body.transcript ?? ""));
  const trueRead = String(body.true_read ?? "").trim();
  const why = String(body.why_it_matters ?? "").trim();
  const coverage = String(body.coverage_label ?? "").trim();
  const keywords = Array.isArray(body.answer_keywords)
    ? body.answer_keywords.map((k) => normalize(String(k))).filter(Boolean)
    : [];
  const mistakes = (Array.isArray(body.common_mistakes) ? body.common_mistakes : []) as Mistake[];

  if (transcript.length < 8) {
    return {
      score: 15,
      verdict: "miss",
      whatYouGot: "Answer too short to grade a real read.",
      mistake: "Empty description.",
      consequence: "No read means you play into the defense’s script.",
      feedback: "Describe coverage + action in your own words.",
      keywords_matched: [] as string[],
      source: "rules" as const,
    };
  }

  const matched: string[] = [];
  let hits = 0;
  for (const kw of keywords) {
    if (includesAny(transcript, [kw])) {
      hits += 1;
      matched.push(kw);
    }
  }
  const ratio = keywords.length ? hits / keywords.length : 0;
  const coverageHit = coverage ? includesAny(transcript, [coverage]) : false;

  let hitMistake: Mistake | null = null;
  for (const m of mistakes) {
    if (m.triggers && includesAny(transcript, m.triggers.map(String))) {
      hitMistake = m;
      break;
    }
  }

  let score = Math.round(20 + ratio * 65 + (coverageHit ? 10 : 0));
  if (hitMistake && ratio < 0.45) score = Math.min(score, 42);
  else if (hitMistake && ratio >= 0.45) score = Math.min(score, 68);
  score = Math.min(100, Math.max(0, score));

  const verdict = score >= 85 ? "elite" : score >= 70 ? "solid" : score >= 45 ? "partial" : "miss";

  return {
    score,
    verdict,
    whatYouGot:
      matched.length > 0
        ? `You touched: ${matched.slice(0, 4).join(", ")}.`
        : "Coverage/action keywords were thin — tighten the language.",
    mistake: hitMistake?.mistake ?? (verdict === "elite" || verdict === "solid" ? null : "Incomplete read."),
    consequence:
      hitMistake?.consequence ??
      (verdict === "elite"
        ? "Correct reads force late rotations — paint + open threes."
        : mistakes[0]?.consequence ?? "Wrong reads let the defense play on schedule."),
    feedback: trueRead.slice(0, 220) || "Review the true read.",
    correctRead: trueRead,
    coachingPoint: why,
    keywords_matched: matched.slice(0, 8),
    source: "rules" as const,
  };
}

export const hooperiqApi = Router();

hooperiqApi.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, feature: "hooperiq", mode: "film-coach" });
});

hooperiqApi.post("/assess", (req: Request, res: Response) => {
  try {
    res.json(assess((req.body ?? {}) as Record<string, unknown>));
  } catch (err) {
    console.error("[hooperiq/assess]", err);
    res.status(200).json({
      score: 40,
      verdict: "partial",
      whatYouGot: "Server soft-failed — use on-device grade.",
      mistake: null,
      consequence: "Retry the read; film IQ still works offline.",
      feedback: "Local coach fallback.",
      keywords_matched: [],
      source: "rules",
    });
  }
});
