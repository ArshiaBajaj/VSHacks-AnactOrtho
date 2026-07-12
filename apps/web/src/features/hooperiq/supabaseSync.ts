/**
 * HooperIQ ↔ Supabase persistence.
 * Falls back silently so /iq never breaks offline.
 */
import { DEMO_PLAYER_ID, getSupabase, supabaseConfigured } from "@/lib/supabase";
import type { HooperPlay, IqStats, TacticalConcept } from "./types";
import { defaultStats } from "./storage";

export { supabaseConfigured };

/** Concepts present in Postgres `tactical_concept` enum */
const DB_CONCEPTS = new Set([
  "pnr",
  "pnp",
  "horns",
  "floppy",
  "spain_pnr",
  "drop_coverage",
  "ice_defense",
  "switch_defense",
  "hedge_blitz",
  "zone_2_3",
  "zone_3_2",
  "box_and_one",
  "transition",
  "secondary_break",
  "post_split",
  "isolations",
  "motion_offense",
  "delay_offense",
  "ato",
  "bobb",
  "slob",
  "press_break",
  "help_rotation",
  "closeout",
  "rebounding",
]);

function dbConcepts(tags: TacticalConcept[]): string[] {
  return tags.filter((t) => DB_CONCEPTS.has(t));
}

type IqStatsRow = {
  user_id: string;
  iq_score: number;
  glicko_rating: number;
  glicko_rd: number;
  glicko_volatility: number;
  current_streak: number;
  longest_streak: number;
  last_play_date: string | null;
  total_plays: number;
  total_correctish: number;
  concept_proficiency: IqStats["conceptProficiency"];
  difficulty_offsets: IqStats["difficultyOffsets"];
};

function rowToStats(row: IqStatsRow): IqStats {
  return {
    iqScore: Number(row.iq_score) || 100,
    glickoRating: Number(row.glicko_rating) || 1500,
    glickoRd: Number(row.glicko_rd) || 350,
    glickoVolatility: Number(row.glicko_volatility) || 0.06,
    currentStreak: Number(row.current_streak) || 0,
    longestStreak: Number(row.longest_streak) || 0,
    lastPlayDate: row.last_play_date,
    totalPlays: Number(row.total_plays) || 0,
    totalCorrectish: Number(row.total_correctish) || 0,
    conceptProficiency: row.concept_proficiency ?? {},
    difficultyOffsets: row.difficulty_offsets ?? {},
  };
}

export async function fetchRemoteStats(userId = DEMO_PLAYER_ID): Promise<IqStats | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("user_iq_stats")
      .select(
        "user_id,iq_score,glicko_rating,glicko_rd,glicko_volatility,current_streak,longest_streak,last_play_date,total_plays,total_correctish,concept_proficiency,difficulty_offsets",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return rowToStats(data as IqStatsRow);
  } catch {
    return null;
  }
}

export async function pushRemoteStats(stats: IqStats, userId = DEMO_PLAYER_ID): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { error } = await sb.from("user_iq_stats").upsert(
      {
        user_id: userId,
        iq_score: stats.iqScore,
        glicko_rating: stats.glickoRating,
        glicko_rd: stats.glickoRd,
        glicko_volatility: stats.glickoVolatility,
        current_streak: stats.currentStreak,
        longest_streak: stats.longestStreak,
        last_play_date: stats.lastPlayDate,
        total_plays: stats.totalPlays,
        total_correctish: stats.totalCorrectish,
        concept_proficiency: stats.conceptProficiency,
        difficulty_offsets: stats.difficultyOffsets,
      },
      { onConflict: "user_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

export async function recordRemoteAssessment(opts: {
  play: HooperPlay;
  score: number;
  feedback: string;
  keywordsMatched: string[];
  transcript: string;
  iqBefore: number;
  iqAfter: number;
  glickoBefore: number;
  glickoAfter: number;
  userId?: string;
}): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const userId = opts.userId ?? DEMO_PLAYER_ID;
  try {
    const { data: assessment, error } = await sb
      .from("play_assessments")
      .insert({
        user_id: userId,
        play_id: null,
        // Library plays in the web catalog use string ids; store via freeform transcript meta
        modality: "text",
        transcript: opts.transcript,
        score: opts.score,
        feedback: opts.feedback,
        keywords_matched: opts.keywordsMatched,
        llm_raw: {
          play_id: opts.play.id,
          play_slug: opts.play.slug,
          concept_tags: opts.play.conceptTags,
          source: "web_iq",
        },
        iq_before: opts.iqBefore,
        iq_after: opts.iqAfter,
        glicko_rating_before: opts.glickoBefore,
        glicko_rating_after: opts.glickoAfter,
        concept_tags: dbConcepts(opts.play.conceptTags),
      })
      .select("id")
      .maybeSingle();

    if (error || !assessment?.id) return false;

    const tags = dbConcepts(opts.play.conceptTags);
    if (tags.length) {
      await sb.from("concept_attempt_history").insert(
        tags.map((concept) => ({
          user_id: userId,
          assessment_id: assessment.id,
          concept,
          score: opts.score,
          difficulty_index: opts.play.difficultyIndex,
        })),
      );
    }
    return true;
  } catch {
    return false;
  }
}

/** Prefer remote stats when Supabase is configured; else local defaults. */
export async function hydrateStats(local: IqStats): Promise<IqStats> {
  if (!supabaseConfigured) return local;
  const remote = await fetchRemoteStats();
  return remote ?? local ?? defaultStats();
}

export async function pingSupabase(): Promise<{ ok: boolean; detail: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, detail: "Supabase env not set" };
  try {
    const { error, count } = await sb
      .from("basketball_plays")
      .select("id", { count: "exact", head: true });
    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: `${count ?? 0} plays` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "ping failed" };
  }
}
