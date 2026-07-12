-- HooperIQ Phase 1 — users & user_iq_stats
-- IQ scale: 60–140 (Glicko-2 / ELO-style rating mapped to display IQ)

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT,                    -- stored lowercased by app / trigger
  username        TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'player',
  avatar_url      TEXT,
  password_hash   TEXT,                    -- null for OAuth / demo accounts
  coach_org_id    UUID,                    -- set when role = coach (FK added in 004)
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_username_len CHECK (char_length(username) BETWEEN 2 AND 40),
  CONSTRAINT users_username_format CHECK (username ~ '^[a-zA-Z0-9_\.]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email::text))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
  ON users (lower(username));

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role) WHERE is_active;

-- ─────────────────────────────────────────────
-- Per-user IQ / Glicko-2 state + concept matrix
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_iq_stats (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Display IQ (60–140). Derived from glicko_rating for UX parity with HooperIQ.
  iq_score              NUMERIC(6, 2) NOT NULL DEFAULT 100.00
                          CHECK (iq_score BETWEEN 60 AND 140),

  -- Raw Glicko-2 parameters (rating ~ μ on ~400–2000 scale; we use 1500 baseline)
  glicko_rating         NUMERIC(10, 4) NOT NULL DEFAULT 1500.0000,
  glicko_rd             NUMERIC(10, 4) NOT NULL DEFAULT 350.0000,   -- rating deviation
  glicko_volatility     NUMERIC(12, 8) NOT NULL DEFAULT 0.06000000,

  -- Streak & engagement
  current_streak        INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak        INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_play_date        DATE,
  total_plays           INTEGER NOT NULL DEFAULT 0 CHECK (total_plays >= 0),
  total_correctish      INTEGER NOT NULL DEFAULT 0 CHECK (total_correctish >= 0),
  -- "correctish" = assessment score >= 70

  -- Daily challenge state (reset via cron / app logic)
  daily_challenge_date  DATE,
  daily_challenge_status daily_challenge_status NOT NULL DEFAULT 'locked',
  daily_challenge_play_id UUID,            -- FK added after basketball_plays exists
  daily_challenge_score INTEGER CHECK (daily_challenge_score IS NULL OR daily_challenge_score BETWEEN 0 AND 100),

  -- Recent performance trend (rolling window summary for adaptive fetch)
  recent_avg_score      NUMERIC(5, 2),     -- last N assessments
  recent_trend          NUMERIC(6, 3),     -- negative = dipping

  -- Tactical concept proficiency matrix
  -- Shape: { "pnr": { "attempts": 12, "avg_score": 74.5, "last_seen": "...", "confidence": 0.62 }, ... }
  concept_proficiency   JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Soft difficulty preference offsets per concept tag (adaptive engine writes here)
  -- Shape: { "ice_defense": -0.15, "horns": 0.05 }
  difficulty_offsets    JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_iq_stats_iq_score_idx
  ON user_iq_stats (iq_score DESC);

CREATE INDEX IF NOT EXISTS user_iq_stats_glicko_idx
  ON user_iq_stats (glicko_rating DESC);

CREATE INDEX IF NOT EXISTS user_iq_stats_concept_gin
  ON user_iq_stats USING GIN (concept_proficiency);

-- Auto-create empty IQ stats row when a player registers
CREATE OR REPLACE FUNCTION hooperiq_init_user_iq_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IN ('player', 'coach') THEN
    INSERT INTO user_iq_stats (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_init_iq_stats ON users;
CREATE TRIGGER trg_users_init_iq_stats
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION hooperiq_init_user_iq_stats();

-- updated_at helper
CREATE OR REPLACE FUNCTION hooperiq_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_touch ON users;
CREATE TRIGGER trg_users_touch
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION hooperiq_touch_updated_at();

DROP TRIGGER IF EXISTS trg_user_iq_stats_touch ON user_iq_stats;
CREATE TRIGGER trg_user_iq_stats_touch
  BEFORE UPDATE ON user_iq_stats
  FOR EACH ROW
  EXECUTE FUNCTION hooperiq_touch_updated_at();
