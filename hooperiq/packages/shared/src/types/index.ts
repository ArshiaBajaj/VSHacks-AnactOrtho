/**
 * HooperIQ shared domain types (Phase 1 schema mirror).
 * Isolated from the main SummerHackathon apps — import only from `hooperiq/`.
 */

export type UserRole = "player" | "coach" | "admin";

export type DifficultyBand = "intro" | "developing" | "competitive" | "elite";

export type AssessmentModality = "voice" | "text";

export type CampaignStatus = "draft" | "published" | "archived";

export type DailyChallengeStatus =
  | "locked"
  | "available"
  | "completed"
  | "expired";

export type TacticalConcept =
  | "pnr"
  | "pnp"
  | "horns"
  | "floppy"
  | "spain_pnr"
  | "drop_coverage"
  | "ice_defense"
  | "switch_defense"
  | "hedge_blitz"
  | "zone_2_3"
  | "zone_3_2"
  | "box_and_one"
  | "transition"
  | "secondary_break"
  | "post_split"
  | "isolations"
  | "motion_offense"
  | "delay_offense"
  | "ato"
  | "bobb"
  | "slob"
  | "press_break"
  | "help_rotation"
  | "closeout"
  | "rebounding";

/** IQ display scale used across mobile + coach dashboard */
export const IQ_MIN = 60;
export const IQ_MAX = 140;
export const IQ_BASELINE = 100;
export const GLICKO_BASELINE = 1500;
export const GLICKO_RD_DEFAULT = 350;
export const GLICKO_VOLATILITY_DEFAULT = 0.06;

export interface ConceptProficiencyEntry {
  attempts: number;
  avg_score: number;
  last_seen?: string;
  confidence?: number;
}

/** JSONB matrix on user_iq_stats.concept_proficiency */
export type ConceptProficiencyMap = Partial<
  Record<TacticalConcept, ConceptProficiencyEntry>
>;

/** Soft per-concept difficulty offsets written by the adaptive engine */
export type DifficultyOffsetMap = Partial<Record<TacticalConcept, number>>;

export interface CourtPosition {
  role: string;
  x: number; // 0–1 half-court
  y: number;
  jersey?: number | null;
}

export interface PauseWindow {
  start_ms: number;
  end_ms: number;
  label?: string;
}

export interface User {
  id: string;
  email: string | null;
  username: string;
  display_name: string;
  role: UserRole;
  avatar_url: string | null;
  coach_org_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserIqStats {
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
  daily_challenge_date: string | null;
  daily_challenge_status: DailyChallengeStatus;
  daily_challenge_play_id: string | null;
  daily_challenge_score: number | null;
  recent_avg_score: number | null;
  recent_trend: number | null;
  concept_proficiency: ConceptProficiencyMap;
  difficulty_offsets: DifficultyOffsetMap;
  created_at: string;
  updated_at: string;
}

export interface BasketballPlay {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  source: "library" | "ncaa" | "nba" | "hs" | "club" | "generated";
  video_url: string;
  video_storage_key: string | null;
  thumbnail_url: string | null;
  duration_ms: number | null;
  mime_type: string;
  pause_timestamp_ms: number;
  pause_windows: PauseWindow[];
  true_read: string;
  answer_keywords: string[];
  correct_answer_vector: Record<string, unknown>;
  difficulty_rating: number;
  difficulty_band: DifficultyBand;
  difficulty_index: number;
  concept_tags: TacticalConcept[];
  freeform_tags: string[];
  player_positions: CourtPosition[];
  times_served: number;
  times_answered: number;
  avg_user_score: number | null;
  pass_rate: number | null;
  is_active: boolean;
  is_daily_eligible: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamCampaign {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  access_code: string;
  access_code_expires_at: string | null;
  max_roster_size: number | null;
  video_url: string;
  video_storage_key: string | null;
  thumbnail_url: string | null;
  duration_ms: number | null;
  default_difficulty_index: number;
  concept_tags: TacticalConcept[];
  config: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignQuestion {
  id: string;
  campaign_id: string;
  timestamp_ms: number;
  sort_order: number;
  prompt: string | null;
  true_read: string;
  answer_keywords: string[];
  correct_answer_vector: Record<string, unknown>;
  concept_tags: TacticalConcept[];
  freeform_tags: string[];
  difficulty_index: number;
  difficulty_rating: number;
  player_positions: CourtPosition[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Strict JSON contract returned by the Phase 2 LLM assessor */
export interface AssessmentLlmResult {
  score: number; // 0–100
  feedback: string;
  keywords_matched: string[];
}

export interface PlayAssessment {
  id: string;
  user_id: string;
  play_id: string | null;
  campaign_question_id: string | null;
  modality: AssessmentModality;
  audio_url: string | null;
  transcript: string | null;
  score: number;
  feedback: string;
  keywords_matched: string[];
  iq_before: number | null;
  iq_after: number | null;
  concept_tags: TacticalConcept[];
  created_at: string;
}

/** Coach annotation payload → campaign_questions upsert */
export interface FreezeFrameAnnotationInput {
  campaign_id: string;
  timestamp_ms: number;
  true_read: string;
  concept_tags: TacticalConcept[];
  freeform_tags?: string[];
  player_positions?: CourtPosition[];
  difficulty_index?: number;
  prompt?: string;
  answer_keywords?: string[];
}

export function glickoToIq(rating: number): number {
  const iq = 60 + ((rating - 1000) / 1000) * 80;
  return Math.min(IQ_MAX, Math.max(IQ_MIN, Math.round(iq * 100) / 100));
}
