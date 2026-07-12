-- HooperIQ Phase 1 — Extensions & shared enums
-- Isolated schema; does not touch the main SummerHackathon backend.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('player', 'coach', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE difficulty_band AS ENUM ('intro', 'developing', 'competitive', 'elite');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assessment_modality AS ENUM ('voice', 'text');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE daily_challenge_status AS ENUM ('locked', 'available', 'completed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Canonical tactical concept vocabulary (extensible via free-form tags elsewhere)
DO $$ BEGIN
  CREATE TYPE tactical_concept AS ENUM (
    'pnr',              -- Pick & Roll
    'pnp',              -- Pick & Pop
    'horns',
    'floppy',
    'spain_pnr',
    'drop_coverage',
    'ice_defense',
    'switch_defense',
    'hedge_blitz',
    'zone_2_3',
    'zone_3_2',
    'box_and_one',
    'transition',
    'secondary_break',
    'post_split',
    'isolations',
    'motion_offense',
    'delay_offense',
    'ato',              -- After timeout
    'bobb',             -- Baseline out of bounds
    'slob',             -- Sideline out of bounds
    'press_break',
    'help_rotation',
    'closeout',
    'rebounding'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
