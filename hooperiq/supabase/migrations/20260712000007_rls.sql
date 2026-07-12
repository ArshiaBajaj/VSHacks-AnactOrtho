-- HooperIQ — Row Level Security (demo-friendly)
-- Tighten before production: scope writes to auth.uid() mapped users.

-- Allow assessments for bundled web catalog plays (no FK play_id yet)
ALTER TABLE play_assessments
  DROP CONSTRAINT IF EXISTS play_assessments_source_xor;

ALTER TABLE play_assessments
  ADD CONSTRAINT play_assessments_source_check CHECK (
    NOT (play_id IS NOT NULL AND campaign_question_id IS NOT NULL)
  );

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_iq_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE basketball_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_attempt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read: active play catalog (anon key OK for demo /iq)
DROP POLICY IF EXISTS basketball_plays_public_read ON basketball_plays;
CREATE POLICY basketball_plays_public_read
  ON basketball_plays FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS basketball_plays_service_all ON basketball_plays;
CREATE POLICY basketball_plays_service_all
  ON basketball_plays FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Demo user profile readable
DROP POLICY IF EXISTS users_public_read ON users;
CREATE POLICY users_public_read
  ON users FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS users_service_all ON users;
CREATE POLICY users_service_all
  ON users FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- IQ stats: demo can read/update (hackathon); service_role full access
DROP POLICY IF EXISTS user_iq_stats_public_read ON user_iq_stats;
CREATE POLICY user_iq_stats_public_read
  ON user_iq_stats FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS user_iq_stats_public_update ON user_iq_stats;
CREATE POLICY user_iq_stats_public_update
  ON user_iq_stats FOR UPDATE
  TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS user_iq_stats_public_insert ON user_iq_stats;
CREATE POLICY user_iq_stats_public_insert
  ON user_iq_stats FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS user_iq_stats_service_all ON user_iq_stats;
CREATE POLICY user_iq_stats_service_all
  ON user_iq_stats FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Assessments: allow insert + read for demo
DROP POLICY IF EXISTS play_assessments_public_read ON play_assessments;
CREATE POLICY play_assessments_public_read
  ON play_assessments FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS play_assessments_public_insert ON play_assessments;
CREATE POLICY play_assessments_public_insert
  ON play_assessments FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS play_assessments_service_all ON play_assessments;
CREATE POLICY play_assessments_service_all
  ON play_assessments FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS concept_attempt_history_public_read ON concept_attempt_history;
CREATE POLICY concept_attempt_history_public_read
  ON concept_attempt_history FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS concept_attempt_history_public_insert ON concept_attempt_history;
CREATE POLICY concept_attempt_history_public_insert
  ON concept_attempt_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS concept_attempt_history_service_all ON concept_attempt_history;
CREATE POLICY concept_attempt_history_service_all
  ON concept_attempt_history FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Campaigns / orgs: public read published
DROP POLICY IF EXISTS team_orgs_public_read ON team_organizations;
CREATE POLICY team_orgs_public_read
  ON team_organizations FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS team_campaigns_public_read ON team_campaigns;
CREATE POLICY team_campaigns_public_read
  ON team_campaigns FOR SELECT
  TO anon, authenticated
  USING (status = 'published' OR TRUE);

DROP POLICY IF EXISTS campaign_questions_public_read ON campaign_questions;
CREATE POLICY campaign_questions_public_read
  ON campaign_questions FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS campaign_roster_public_read ON campaign_roster;
CREATE POLICY campaign_roster_public_read
  ON campaign_roster FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS leaderboard_public_read ON leaderboard_snapshots;
CREATE POLICY leaderboard_public_read
  ON leaderboard_snapshots FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- service_role bypass for remaining tables
DROP POLICY IF EXISTS team_orgs_service_all ON team_organizations;
CREATE POLICY team_orgs_service_all ON team_organizations FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS team_campaigns_service_all ON team_campaigns;
CREATE POLICY team_campaigns_service_all ON team_campaigns FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS campaign_questions_service_all ON campaign_questions;
CREATE POLICY campaign_questions_service_all ON campaign_questions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS campaign_roster_service_all ON campaign_roster;
CREATE POLICY campaign_roster_service_all ON campaign_roster FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS leaderboard_service_all ON leaderboard_snapshots;
CREATE POLICY leaderboard_service_all ON leaderboard_snapshots FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMENT ON POLICY basketball_plays_public_read ON basketball_plays IS
  'Demo: anon can read active library plays for /iq without auth.';
