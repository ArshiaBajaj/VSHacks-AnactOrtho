-- HooperIQ Phase 1 — basketball_plays (canonical clip library)

CREATE TABLE IF NOT EXISTS basketball_plays (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Catalog metadata
  slug                TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  source              TEXT NOT NULL DEFAULT 'library'
                        CHECK (source IN ('library', 'ncaa', 'nba', 'hs', 'club', 'generated')),

  -- Video asset
  video_url           TEXT NOT NULL,
  video_storage_key   TEXT,                -- S3 / R2 object key for local caching
  thumbnail_url       TEXT,
  duration_ms         INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
  mime_type           TEXT NOT NULL DEFAULT 'video/mp4',

  -- Freeze-frame / decision moment
  pause_timestamp_ms  INTEGER NOT NULL CHECK (pause_timestamp_ms >= 0),
  -- Optional secondary decision windows (ATO, late-clock reads)
  pause_windows       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Shape: [{ "start_ms": 4200, "end_ms": 4800, "label": "primary_read" }]

  -- Ground-truth evaluation criteria for the LLM assessor
  true_read           TEXT NOT NULL,       -- elite coach narrative of the correct read
  answer_keywords     TEXT[] NOT NULL DEFAULT '{}',  -- soft keyword bank
  -- Dense embedding of true_read + keywords for tactic matching (pgvector)
  answer_embedding    vector(1536),        -- OpenAI text-embedding-3-small dims

  -- Exact correct answer vector for structured scoring (optional multi-label)
  -- Shape: { "primary_action": "ice", "coverage": "drop", "ball_handler": "left", ... }
  correct_answer_vector JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Difficulty (Glicko expected opponent rating + UX band)
  difficulty_rating   NUMERIC(10, 4) NOT NULL DEFAULT 1500.0000,
  difficulty_band     difficulty_band NOT NULL DEFAULT 'developing',
  -- Display difficulty 1–10 for coach UI
  difficulty_index    NUMERIC(4, 2) NOT NULL DEFAULT 5.00
                        CHECK (difficulty_index BETWEEN 1 AND 10),

  -- Concept tags (enum array + free-form)
  concept_tags        tactical_concept[] NOT NULL DEFAULT '{}',
  freeform_tags       TEXT[] NOT NULL DEFAULT '{}',

  -- On-court spatial context (player positions at freeze frame)
  -- Shape: [{ "role": "ball_handler", "x": 0.42, "y": 0.71, "jersey": 3 }, ...]
  -- Coordinates normalized 0–1 half-court
  player_positions    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Adaptive / analytics counters
  times_served        INTEGER NOT NULL DEFAULT 0 CHECK (times_served >= 0),
  times_answered      INTEGER NOT NULL DEFAULT 0 CHECK (times_answered >= 0),
  avg_user_score      NUMERIC(5, 2),
  pass_rate           NUMERIC(5, 4),       -- fraction scoring >= 70

  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_daily_eligible   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT basketball_plays_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT basketball_plays_pause_in_duration CHECK (
    duration_ms IS NULL OR pause_timestamp_ms <= duration_ms
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS basketball_plays_slug_unique
  ON basketball_plays (slug);

CREATE INDEX IF NOT EXISTS basketball_plays_active_difficulty_idx
  ON basketball_plays (is_active, difficulty_rating)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS basketball_plays_concept_tags_gin
  ON basketball_plays USING GIN (concept_tags);

CREATE INDEX IF NOT EXISTS basketball_plays_freeform_tags_gin
  ON basketball_plays USING GIN (freeform_tags);

-- Prefer HNSW (works well on small catalogs); skip if pgvector build lacks it
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS basketball_plays_answer_embedding_hnsw
    ON basketball_plays
    USING hnsw (answer_embedding vector_cosine_ops);
EXCEPTION WHEN OTHERS THEN
  BEGIN
    CREATE INDEX IF NOT EXISTS basketball_plays_answer_embedding_ivfflat
      ON basketball_plays
      USING ivfflat (answer_embedding vector_cosine_ops)
      WITH (lists = 100);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping answer_embedding vector index: %', SQLERRM;
  END;
END $$;

DROP TRIGGER IF EXISTS trg_basketball_plays_touch ON basketball_plays;
CREATE TRIGGER trg_basketball_plays_touch
  BEFORE UPDATE ON basketball_plays
  FOR EACH ROW
  EXECUTE FUNCTION hooperiq_touch_updated_at();

-- Wire daily challenge FK now that plays exist
ALTER TABLE user_iq_stats
  DROP CONSTRAINT IF EXISTS user_iq_stats_daily_challenge_play_id_fkey;

ALTER TABLE user_iq_stats
  ADD CONSTRAINT user_iq_stats_daily_challenge_play_id_fkey
  FOREIGN KEY (daily_challenge_play_id)
  REFERENCES basketball_plays(id)
  ON DELETE SET NULL;
