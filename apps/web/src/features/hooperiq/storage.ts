import {
  GLICKO_BASELINE,
  GLICKO_RD_DEFAULT,
  GLICKO_VOL_DEFAULT,
  IQ_BASELINE,
  type IqStats,
  type TacticalConcept,
} from "./types";
import { assessmentToGlickoScore, glickoToIq, updateGlicko2 } from "./glicko2";
import type { HooperPlay } from "./types";

const STORAGE_KEY = "hooperiq.iq_stats.v1";

export function defaultStats(): IqStats {
  return {
    iqScore: IQ_BASELINE,
    glickoRating: GLICKO_BASELINE,
    glickoRd: GLICKO_RD_DEFAULT,
    glickoVolatility: GLICKO_VOL_DEFAULT,
    currentStreak: 0,
    longestStreak: 0,
    totalPlays: 0,
    totalCorrectish: 0,
    lastPlayDate: null,
    conceptProficiency: {},
    difficultyOffsets: {},
  };
}

export function loadStats(): IqStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStats();
    const parsed = JSON.parse(raw) as Partial<IqStats>;
    const base = defaultStats();
    return {
      ...base,
      ...parsed,
      conceptProficiency: parsed.conceptProficiency ?? {},
      difficultyOffsets: parsed.difficultyOffsets ?? {},
      iqScore: clamp(Number(parsed.iqScore ?? base.iqScore), 60, 140),
      glickoRating: Number(parsed.glickoRating ?? base.glickoRating) || base.glickoRating,
      glickoRd: Number(parsed.glickoRd ?? base.glickoRd) || base.glickoRd,
      glickoVolatility:
        Number(parsed.glickoVolatility ?? base.glickoVolatility) || base.glickoVolatility,
    };
  } catch {
    return defaultStats();
  }
}

export function saveStats(stats: IqStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    /* quota / private mode — ignore */
  }
  // Fire-and-forget remote sync when Supabase is configured
  void import("./supabaseSync")
    .then((m) => m.pushRemoteStats(stats))
    .catch(() => undefined);
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function applyAssessment(stats: IqStats, play: HooperPlay, score: number): IqStats {
  const outcome = assessmentToGlickoScore(score);
  const nextG = updateGlicko2(
    {
      rating: stats.glickoRating,
      rd: stats.glickoRd,
      volatility: stats.glickoVolatility,
    },
    play.difficultyRating,
    outcome,
  );

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let streak = stats.currentStreak;
  if (score >= 70) {
    if (stats.lastPlayDate === today) {
      /* same day — keep streak */
    } else if (stats.lastPlayDate === yesterday || stats.lastPlayDate === null) {
      streak = stats.currentStreak + 1;
    } else {
      streak = 1;
    }
  } else if (stats.lastPlayDate !== today) {
    streak = 0;
  }

  const proficiency = { ...stats.conceptProficiency };
  const offsets = { ...stats.difficultyOffsets };
  for (const tag of play.conceptTags) {
    const prev = proficiency[tag] ?? { attempts: 0, avgScore: 0 };
    const attempts = prev.attempts + 1;
    const avgScore = (prev.avgScore * prev.attempts + score) / attempts;
    proficiency[tag] = { attempts, avgScore };
    // Soft difficulty offset: weak concepts → easier incoming clips
    if (avgScore < 55 && attempts >= 2) offsets[tag] = -0.2;
    else if (avgScore > 80 && attempts >= 2) offsets[tag] = 0.1;
    else offsets[tag] = 0;
  }

  const next: IqStats = {
    ...stats,
    glickoRating: nextG.rating,
    glickoRd: nextG.rd,
    glickoVolatility: nextG.volatility,
    iqScore: glickoToIq(nextG.rating),
    currentStreak: streak,
    longestStreak: Math.max(stats.longestStreak, streak),
    totalPlays: stats.totalPlays + 1,
    totalCorrectish: stats.totalCorrectish + (score >= 70 ? 1 : 0),
    lastPlayDate: today,
    conceptProficiency: proficiency,
    difficultyOffsets: offsets,
  };
  saveStats(next);
  return next;
}

/** Pick next plays near rating, biased toward weak concepts. */
export function selectSessionPlays(
  catalog: HooperPlay[],
  stats: IqStats,
  count = 4,
): HooperPlay[] {
  try {
    if (!catalog.length) return [];
    const rating = stats.glickoRating;
    const scored = catalog.map((p) => {
      let weakBias = 0;
      for (const t of p.conceptTags) {
        const avg = stats.conceptProficiency[t]?.avgScore;
        if (typeof avg === "number" && avg < 60) weakBias += 30;
        const off = stats.difficultyOffsets[t] ?? 0;
        weakBias += off * -20;
      }
      const dist = Math.abs(p.difficultyRating - rating);
      return { play: p, rank: dist - weakBias };
    });
    scored.sort((a, b) => a.rank - b.rank);
    const picked = scored.slice(0, Math.min(count, scored.length)).map((s) => s.play);
    // Shuffle lightly so sessions aren't identical
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    return picked;
  } catch {
    return catalog.slice(0, count);
  }
}

export function weakestConcept(stats: IqStats): TacticalConcept | null {
  const entries = Object.entries(stats.conceptProficiency) as [
    TacticalConcept,
    { attempts: number; avgScore: number },
  ][];
  if (!entries.length) return null;
  entries.sort((a, b) => a[1].avgScore - b[1].avgScore);
  return entries[0]?.[0] ?? null;
}
