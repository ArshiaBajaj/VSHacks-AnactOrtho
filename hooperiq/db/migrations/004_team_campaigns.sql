-- HooperIQ Phase 1 — team_campaigns (coach-uploaded custom film)

CREATE TABLE IF NOT EXISTS team_organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  short_name      TEXT,
  level           TEXT NOT NULL DEFAULT 'hs'
                    CHECK (level IN ('hs', 'club', 'aau', 'college', 'pro', 'other')),
  region          TEXT,
  logo_url        TEXT,
  owner_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_organizations_owner_idx
  ON team_organizations (owner_user_id);

DROP TRIGGER IF EXISTS trg_team_organizations_touch ON team_organizations;
CREATE TRIGGER trg_team_organizations_touch
  BEFORE UPDATE ON team_organizations
  FOR EACH ROW
  EXECUTE FUNCTION hooperiq_touch_updated_at();

-- Backfill coach_org FK on users
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_coach_org_id_fkey;

ALTER TABLE users
  ADD CONSTRAINT users_coach_org_id_fkey
  FOREIGN KEY (coach_org_id)
  REFERENCES team_organizations(id)
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- Campaigns
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES team_organizations(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  title               TEXT NOT NULL,
  description         TEXT,
  status              campaign_status NOT NULL DEFAULT 'draft',

  -- Roster access
  access_code         TEXT NOT NULL,
  access_code_expires_at TIMESTAMPTZ,
  max_roster_size     INTEGER CHECK (max_roster_size IS NULL OR max_roster_size > 0),

  -- Source film
  video_url           TEXT NOT NULL,
  video_storage_key   TEXT,
  thumbnail_url       TEXT,
  duration_ms         INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),

  -- Campaign-level defaults
  default_difficulty_index NUMERIC(4, 2) NOT NULL DEFAULT 5.00
                            CHECK (default_difficulty_index BETWEEN 1 AND 10),
  concept_tags        tactical_concept[] NOT NULL DEFAULT '{}',

  -- Aggregate config blob for coach dashboard (non-question settings)
  -- Shape: { "season": "2025-26", "opponent": "Westlake", "focus": ["ice_defense"] }
  config              JSONB NOT NULL DEFAULT '{}'::jsonb,

  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT team_campaigns_access_code_format
    CHECK (access_code ~ '^[A-Z0-9]{4,12}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS team_campaigns_access_code_unique
  ON team_campaigns (access_code)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS team_campaigns_org_status_idx
  ON team_campaigns (organization_id, status);

DROP TRIGGER IF EXISTS trg_team_campaigns_touch ON team_campaigns;
CREATE TRIGGER trg_team_campaigns_touch
  BEFORE UPDATE ON team_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION hooperiq_touch_updated_at();

-- ─────────────────────────────────────────────
-- Coach freeze-frame questions mapped to campaign film
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES team_campaigns(id) ON DELETE CASCADE,

  -- Freeze frame captured by coach annotation UI
  timestamp_ms        INTEGER NOT NULL CHECK (timestamp_ms >= 0),
  sort_order          INTEGER NOT NULL DEFAULT 0,

  prompt              TEXT,                -- optional player-facing prompt
  true_read           TEXT NOT NULL,
  answer_keywords     TEXT[] NOT NULL DEFAULT '{}',
  answer_embedding    vector(1536),
  correct_answer_vector JSONB NOT NULL DEFAULT '{}'::jsonb,

  concept_tags        tactical_concept[] NOT NULL DEFAULT '{}',
  freeform_tags       TEXT[] NOT NULL DEFAULT '{}',
  difficulty_index    NUMERIC(4, 2) NOT NULL DEFAULT 5.00
                        CHECK (difficulty_index BETWEEN 1 AND 10),
  difficulty_rating   NUMERIC(10, 4) NOT NULL DEFAULT 1500.0000,

  -- Target player positions at freeze (coach overlay)
  player_positions    JSONB NOT NULL DEFAULT '[]'::jsonb,

  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaign_questions_campaign_ts_idx
  ON campaign_questions (campaign_id, timestamp_ms);

CREATE INDEX IF NOT EXISTS campaign_questions_concept_gin
  ON campaign_questions USING GIN (concept_tags);

DROP TRIGGER IF EXISTS trg_campaign_questions_touch ON campaign_questions;
CREATE TRIGGER trg_campaign_questions_touch
  BEFORE UPDATE ON campaign_questions
  FOR EACH ROW
  EXECUTE FUNCTION hooperiq_touch_updated_at();

-- ─────────────────────────────────────────────
-- Roster membership via access code
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_roster (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES team_campaigns(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS campaign_roster_user_idx
  ON campaign_roster (user_id)
  WHERE is_active;
