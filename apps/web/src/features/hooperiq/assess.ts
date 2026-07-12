import type { CoachBreakdown, HooperPlay, Stroke } from "./types";

function normalize(text: string): string {
  return text
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

/** Heuristic diagram review — never throws. */
export function assessDrawing(play: HooperPlay, strokes: Stroke[]): string {
  try {
    const n = strokes.length;
    if (n === 0) {
      return `No diagram yet. ${play.drawInstruction} (Expected: ${play.drawExpect.join("; ")}.)`;
    }

    let totalLen = 0;
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (const s of strokes) {
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1];
        const b = s.points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        totalLen += Math.hypot(dx, dy);
      }
      for (const p of s.points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const parts: string[] = [];

    if (n === 1 && totalLen < 0.15) {
      parts.push("That mark is tiny — extend it into a real path or circle the key defenders.");
    } else if (n >= 1 && totalLen < 0.25) {
      parts.push("Light diagram — add the full action path, not just a tap.");
    } else if (n >= 2 || totalLen >= 0.4) {
      parts.push(`Solid effort (${n} stroke${n === 1 ? "" : "s"}).`);
    }

    if (spanX > 0.35 || spanY > 0.35) {
      parts.push("You used space across the floor — good for showing spacing/help.");
    } else if (n > 0) {
      parts.push("Diagram is bunched in one area — also mark help / weak-side if it matters here.");
    }

    // Concept-specific nudges
    const tags = play.conceptTags.join(" ");
    if (tags.includes("drop") && spanY < 0.2) {
      parts.push("For drop, show depth toward the paint and the midrange window.");
    }
    if (tags.includes("ice") && spanX < 0.2) {
      parts.push("For ice, show the sideline wall and the reject-middle escape.");
    }
    if (tags.includes("help") || tags.includes("kick")) {
      parts.push("Make sure the kick/skip to the open shooter is visible.");
    }
    if (tags.includes("switch") || tags.includes("mismatch")) {
      parts.push("Box the mismatch and show the clear-out.");
    }
    if (tags.includes("hedge") || tags.includes("blitz")) {
      parts.push("Show the early slip/short-roll throw before the trap closes.");
    }

    parts.push(`Target diagram: ${play.drawExpect.join(" · ")}.`);
    return parts.join(" ");
  } catch {
    return play.drawInstruction;
  }
}

/**
 * Intelligent local coach — scores description + diagram.
 * Never throws.
 */
export function assessDescription(
  play: HooperPlay,
  description: string,
  strokes: Stroke[] = [],
): CoachBreakdown {
  const drawingFeedback = assessDrawing(play, strokes);
  const drewStrokes = strokes.length;

  try {
    const text = normalize(description);
    const keywords = play.answerKeywords.map(normalize).filter(Boolean);
    const matched: string[] = [];

    if (text.length < 5 && drewStrokes === 0) {
      return {
        score: 12,
        verdict: "miss",
        whatYouGot: "Nothing to grade yet.",
        mistake: "Add a short written read and/or a diagram of the action.",
        consequence:
          "In a game you can’t shrug. No read means you play into whatever coverage the defense scripted.",
        correctRead: play.trueRead,
        coachingPoint: play.whyItMatters,
        drawingFeedback,
        keywordsMatched: [],
        source: "local",
      };
    }

    let hits = 0;
    for (const kw of keywords) {
      if (includesAny(text, [kw])) {
        hits += 1;
        matched.push(kw);
      }
    }
    const ratio = keywords.length ? hits / keywords.length : 0;

    const hitMistake = play.commonMistakes.find((m) => includesAny(text, m.triggers)) ?? null;

    const coverageHit = includesAny(text, [
      play.coverageLabel,
      ...play.conceptTags.map((t) => t.replace(/_/g, " ")),
      "drop",
      "ice",
      "switch",
      "hedge",
      "blitz",
      "help",
      "closeout",
    ]);

    let score = text.length >= 5 ? Math.round(20 + ratio * 60 + (coverageHit ? 10 : 0)) : 25;
    if (drewStrokes >= 1) score += 6;
    if (drewStrokes >= 2) score += 4;
    if (drewStrokes >= 3) score += 4;

    if (hitMistake && ratio < 0.45) score = Math.min(score, 42);
    else if (hitMistake && ratio >= 0.45) score = Math.min(score, 68);

    // Pure drawing, thin text — still gradeable
    if (text.length < 5 && drewStrokes >= 1) {
      score = Math.min(55, 28 + drewStrokes * 8);
    }

    score = Math.min(100, Math.max(0, score));

    let verdict: CoachBreakdown["verdict"];
    if (score >= 85) verdict = "elite";
    else if (score >= 70) verdict = "solid";
    else if (score >= 45) verdict = "partial";
    else verdict = "miss";

    const whatYouGot =
      matched.length > 0
        ? `You touched: ${matched.slice(0, 4).join(", ")}.`
        : text.length >= 5
          ? coverageHit
            ? "You named a coverage family, but missed the decisive action."
            : "Written read didn’t lock coverage + action yet."
          : "Mostly diagram — add coverage words next time for a higher score.";

    const mistake =
      hitMistake?.mistake ??
      (verdict === "elite" || verdict === "solid"
        ? null
        : "Incomplete read — name the coverage and the punishing action.");

    const consequence =
      hitMistake?.consequence ??
      (verdict === "elite"
        ? "Correct reads force the defense to rotate late — paint touches and open threes."
        : verdict === "solid"
          ? "You’re close. The leftover gap is what defenses live on."
          : play.commonMistakes[0]?.consequence ??
            "Wrong or late reads let the defense play on schedule.");

    return {
      score,
      verdict,
      whatYouGot,
      mistake,
      consequence,
      correctRead: play.trueRead,
      coachingPoint: play.whyItMatters,
      drawingFeedback,
      keywordsMatched: matched.slice(0, 8),
      source: "local",
    };
  } catch {
    return {
      score: 40,
      verdict: "partial",
      whatYouGot: "Grading hiccup — here’s the baseline coaching.",
      mistake: null,
      consequence: play.commonMistakes[0]?.consequence ?? "Review the true read carefully.",
      correctRead: play.trueRead,
      coachingPoint: play.whyItMatters,
      drawingFeedback,
      keywordsMatched: [],
      source: "local",
    };
  }
}

export async function assessWithOptionalApi(
  play: HooperPlay,
  description: string,
  strokes: Stroke[],
  apiBase?: string,
): Promise<CoachBreakdown> {
  const local = assessDescription(play, description, strokes);
  const base = apiBase?.replace(/\/$/, "");
  if (!base) return local;

  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 4500);
    const res = await fetch(`${base}/api/hooperiq/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        play_id: play.id,
        transcript: description,
        true_read: play.trueRead,
        answer_keywords: play.answerKeywords,
        common_mistakes: play.commonMistakes,
        coverage_label: play.coverageLabel,
        why_it_matters: play.whyItMatters,
        stroke_count: strokes.length,
      }),
    });
    window.clearTimeout(timer);
    if (!res.ok) return local;
    const data = (await res.json()) as Partial<CoachBreakdown> & {
      feedback?: string;
      keywords_matched?: string[];
    };

    const score =
      typeof data.score === "number" ? Math.min(100, Math.max(0, Math.round(data.score))) : local.score;

    return {
      ...local,
      score,
      whatYouGot:
        typeof data.whatYouGot === "string" && data.whatYouGot.trim()
          ? data.whatYouGot
          : local.whatYouGot,
      mistake:
        data.mistake === null
          ? null
          : typeof data.mistake === "string"
            ? data.mistake
            : local.mistake,
      consequence:
        typeof data.consequence === "string" && data.consequence.trim()
          ? data.consequence
          : typeof data.feedback === "string" && data.feedback.trim()
            ? data.feedback
            : local.consequence,
      drawingFeedback: local.drawingFeedback,
      keywordsMatched: Array.isArray(data.keywords_matched)
        ? data.keywords_matched.map(String)
        : Array.isArray(data.keywordsMatched)
          ? data.keywordsMatched.map(String)
          : local.keywordsMatched,
      source: "api",
      verdict: score >= 85 ? "elite" : score >= 70 ? "solid" : score >= 45 ? "partial" : "miss",
    };
  } catch {
    return local;
  }
}
