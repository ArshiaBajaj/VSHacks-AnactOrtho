-- HooperIQ demo seed (safe to re-run; uses fixed UUIDs)

INSERT INTO users (id, email, username, display_name, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'coach@hooperiq.local', 'coach_demo', 'Demo Coach', 'coach'),
  ('22222222-2222-2222-2222-222222222222', 'player@hooperiq.local', 'player_demo', 'Demo Player', 'player')
ON CONFLICT (id) DO NOTHING;

-- Trigger already created user_iq_stats for both; bump player baseline
UPDATE user_iq_stats
SET
  iq_score = 100,
  glicko_rating = 1500,
  concept_proficiency = '{
    "pnr": {"attempts": 4, "avg_score": 72, "confidence": 0.55},
    "ice_defense": {"attempts": 3, "avg_score": 48, "confidence": 0.35},
    "drop_coverage": {"attempts": 2, "avg_score": 61, "confidence": 0.4}
  }'::jsonb,
  difficulty_offsets = '{"ice_defense": -0.2}'::jsonb,
  daily_challenge_status = 'available',
  daily_challenge_date = CURRENT_DATE
WHERE user_id = '22222222-2222-2222-2222-222222222222';

INSERT INTO basketball_plays (
  id, slug, title, description, source,
  video_url, thumbnail_url, duration_ms, pause_timestamp_ms,
  true_read, answer_keywords, correct_answer_vector,
  difficulty_rating, difficulty_band, difficulty_index,
  concept_tags, freeform_tags, player_positions, created_by
) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'horns-entry-reject',
  'Horns Entry — Reject the Screen',
  'Ball handler at the top of horns; weak-side big lifts.',
  'library',
  'https://cdn.hooperiq.local/plays/horns-entry-reject.mp4',
  'https://cdn.hooperiq.local/plays/horns-entry-reject.jpg',
  12000,
  4800,
  'On horns, the ball handler should reject the on-ball screen and attack downhill to the open side while the weak-side big lifts to create a short roll / pop window. Do not force the reject if the nail defender is early — instead use the screen and read drop vs hedge.',
  ARRAY['reject', 'horns', 'attack downhill', 'weak-side lift', 'short roll'],
  '{"primary_action":"reject_screen","set":"horns","read":"attack_open_side"}'::jsonb,
  1480, 'developing', 4.5,
  ARRAY['horns','pnr']::tactical_concept[],
  ARRAY['half-court','early-offense'],
  '[
    {"role":"ball_handler","x":0.50,"y":0.78,"jersey":1},
    {"role":"screener","x":0.38,"y":0.62,"jersey":5},
    {"role":"weak_big","x":0.62,"y":0.62,"jersey":4},
    {"role":"wing","x":0.18,"y":0.55,"jersey":2},
    {"role":"corner","x":0.82,"y":0.35,"jersey":3}
  ]'::jsonb,
  '11111111-1111-1111-1111-111111111111'
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'sideline-ice-drop',
  'Sideline PnR — Ice into Drop',
  'Ball screened toward the sideline; big in drop.',
  'library',
  'https://cdn.hooperiq.local/plays/sideline-ice-drop.mp4',
  'https://cdn.hooperiq.local/plays/sideline-ice-drop.jpg',
  14000,
  6100,
  'Defense is icing the ball handler toward the sideline with the big in drop coverage. The correct offensive read is to reject back middle or throw an early pocket pass if the roller seals the drop big; do not turn the corner into the trap along the sideline.',
  ARRAY['ice', 'drop', 'reject middle', 'pocket pass', 'sideline'],
  '{"coverage":"ice_drop","correct_read":"reject_or_pocket","avoid":"turn_corner_sideline"}'::jsonb,
  1620, 'competitive', 6.5,
  ARRAY['ice_defense','drop_coverage','pnr']::tactical_concept[],
  ARRAY['sideline','coverage-recognition'],
  '[
    {"role":"ball_handler","x":0.22,"y":0.70,"jersey":1},
    {"role":"screener","x":0.30,"y":0.55,"jersey":5},
    {"role":"nail","x":0.45,"y":0.50,"jersey":null},
    {"role":"drop_big","x":0.40,"y":0.28,"jersey":null}
  ]'::jsonb,
  '11111111-1111-1111-1111-111111111111'
)
ON CONFLICT (id) DO NOTHING;

UPDATE user_iq_stats
SET daily_challenge_play_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
WHERE user_id = '22222222-2222-2222-2222-222222222222';

INSERT INTO team_organizations (id, name, short_name, level, owner_user_id)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'Northside High Basketball',
  'Northside',
  'hs',
  '11111111-1111-1111-1111-111111111111'
)
ON CONFLICT (id) DO NOTHING;

UPDATE users
SET coach_org_id = '33333333-3333-3333-3333-333333333333'
WHERE id = '11111111-1111-1111-1111-111111111111';

INSERT INTO team_campaigns (
  id, organization_id, created_by, title, description, status,
  access_code, video_url, duration_ms, concept_tags, config
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Week 3 — Ice Coverage Film',
  'Custom film vs Westlake focusing on sideline ice reads.',
  'published',
  'ICE7NS',
  'https://cdn.hooperiq.local/campaigns/northside-week3.mp4',
  185000,
  ARRAY['ice_defense','pnr']::tactical_concept[],
  '{"season":"2025-26","opponent":"Westlake","focus":["ice_defense"]}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO campaign_questions (
  id, campaign_id, timestamp_ms, sort_order, prompt, true_read,
  answer_keywords, concept_tags, difficulty_index, difficulty_rating, player_positions
) VALUES (
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  42350,
  1,
  'What is the coverage and the correct ball-handler read?',
  'Sideline ice with drop behind. Ball handler should reject middle or hit the early pocket; avoid turning the corner into the sideline trap.',
  ARRAY['ice','drop','reject','pocket'],
  ARRAY['ice_defense','drop_coverage']::tactical_concept[],
  6.0,
  1580,
  '[{"role":"ball_handler","x":0.2,"y":0.68,"jersey":11}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO campaign_roster (campaign_id, user_id)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222'
)
ON CONFLICT (campaign_id, user_id) DO NOTHING;
