-- HooperIQ Phase 1 — assessments (voice/text submissions powering adaptive IQ)

CREATE TABLE IF NOT EXISTS play_assessments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Exactly one of library play OR campaign question
  play_id             UUID REFERENCES basketball_plays(id) ON DELETE CASCADE,
  campaign_question_id UUID REFERENCES campaign_questions(id) ON DELETE CASCADE,

  modality            assessment_modality NOT NULL DEFAULT 'voice',
  audio_url           TEXT,                -- stored recording (voice)
  audio_storage_key   TEXT,
  transcript          TEXT,                -- Whisper output or typed answer
  transcript_confidence NUMERIC(5, 4),

  -- LLM assessor strict JSON payload
  score               INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  feedback            TEXT NOT NULL,
  keywords_matched    TEXT[] NOT NULL DEFAULT '{}',
  llm_raw             JSONB,               -- full model response for audit
  llm_model           TEXT,                -- e.g. gpt-4o-mini
  latency_ms          INTEGER,

  -- Rating deltas applied after this submission
  iq_before           NUMERIC(6, 2),
  iq_after            NUMERIC(6, 2),
  glicko_rating_before NUMERIC(10, 4),
  glicko_rating_after  NUMERIC(10, 4),
  glicko_rd_before    NUMERIC(10, 4),
  glicko_rd_after     NUMERIC(10, 4),

  concept_tags        tactical_concept[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT play_assessments_source_xor CHECK (
    (play_id IS NOT NULL AND campaign_question_id IS NULL)
    OR (play_id IS NULL AND campaign_question_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS play_assessments_user_created_idx
  ON play_assessments (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS play_assessments_play_idx
  ON play_assessments (play_id)
  WHERE play_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS play_assessments_campaign_q_idx
  ON play_assessments (campaign_question_id)
  WHERE campaign_question_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS play_assessments_concepts_gin
  ON play_assessments USING GIN (concept_tags);

-- Per-concept attempt log (denormalized for fast adaptive queries)
CREATE TABLE IF NOT EXISTS concept_attempt_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_id   UUID NOT NULL REFERENCES play_assessments(id) ON DELETE CASCADE,
  concept         tactical_concept NOT NULL,
  score           INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  difficulty_index NUMERIC(4, 2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS concept_attempt_history_user_concept_idx
  ON concept_attempt_history (user_id, concept, created_at DESC);

-- Leaderboard snapshots (Redis is primary cache; this is durable fallback)
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           TEXT NOT NULL DEFAULT 'global'
                    CHECK (scope IN ('global', 'org', 'campaign', 'daily')),
  scope_id        UUID,                    -- org or campaign id when applicable
  period          TEXT NOT NULL DEFAULT 'all_time'
                    CHECK (period IN ('daily', 'weekly', 'season', 'all_time')),
  payload         JSONB NOT NULL,          -- [{ "user_id", "iq_score", "rank", ... }]
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leaderboard_snapshots_scope_idx
  ON leaderboard_snapshots (scope, scope_id, period, generated_at DESC);
