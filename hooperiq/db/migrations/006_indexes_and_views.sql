-- HooperIQ Phase 1 — helper views & adaptive query support

-- Map Glicko rating → display IQ (60–140), clamped
CREATE OR REPLACE FUNCTION hooperiq_glicko_to_iq(rating NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(60, LEAST(140,
    ROUND(60 + ((rating - 1000) / 1000.0) * 80, 2)
  ));
$$;
-- 1000 → 60, 1500 → 100, 2000 → 140

-- Next-play candidate view: active library clips with difficulty + tags
CREATE OR REPLACE VIEW v_play_catalog AS
SELECT
  p.id,
  p.slug,
  p.title,
  p.video_url,
  p.thumbnail_url,
  p.pause_timestamp_ms,
  p.true_read,
  p.difficulty_rating,
  p.difficulty_band,
  p.difficulty_index,
  p.concept_tags,
  p.freeform_tags,
  p.avg_user_score,
  p.pass_rate,
  p.times_served
FROM basketball_plays p
WHERE p.is_active;

-- Rolling concept performance (last 20 attempts per concept)
CREATE OR REPLACE VIEW v_user_concept_trends AS
SELECT
  h.user_id,
  h.concept,
  COUNT(*)::INTEGER AS attempts,
  ROUND(AVG(h.score)::NUMERIC, 2) AS avg_score,
  ROUND(
    (
      AVG(h.score) FILTER (WHERE h.created_at >= NOW() - INTERVAL '7 days')
      - AVG(h.score) FILTER (WHERE h.created_at < NOW() - INTERVAL '7 days')
    )::NUMERIC,
    3
  ) AS week_over_week_delta,
  MAX(h.created_at) AS last_seen
FROM (
  SELECT
    user_id,
    concept,
    score,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY user_id, concept ORDER BY created_at DESC) AS rn
  FROM concept_attempt_history
) h
WHERE h.rn <= 20
GROUP BY h.user_id, h.concept;

-- Adaptive next-play picker (SQL helper; app layer may refine)
-- Returns plays near user's effective difficulty for a given concept, preferring weaker concepts.
CREATE OR REPLACE FUNCTION hooperiq_next_plays(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 5,
  p_concept tactical_concept DEFAULT NULL
)
RETURNS SETOF basketball_plays
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_rating NUMERIC;
  v_offsets JSONB;
BEGIN
  SELECT glicko_rating, difficulty_offsets
    INTO v_rating, v_offsets
  FROM user_iq_stats
  WHERE user_id = p_user_id;

  IF v_rating IS NULL THEN
    v_rating := 1500;
    v_offsets := '{}'::jsonb;
  END IF;

  RETURN QUERY
  SELECT p.*
  FROM basketball_plays p
  WHERE p.is_active
    AND (
      p_concept IS NULL
      OR p_concept = ANY (p.concept_tags)
    )
    AND ABS(
      p.difficulty_rating
      - (
          v_rating
          + COALESCE(
              (
                SELECT SUM((v_offsets ->> t)::NUMERIC) * 100
                FROM unnest(p.concept_tags) AS t
                WHERE v_offsets ? t::text
              ),
              0
            )
        )
    ) < 250
  ORDER BY
    -- Prefer concepts where user is weak (low avg in proficiency jsonb)
    (
      SELECT COALESCE(AVG((s.concept_proficiency -> t::text ->> 'avg_score')::NUMERIC), 50)
      FROM user_iq_stats s, unnest(p.concept_tags) AS t
      WHERE s.user_id = p_user_id
    ) ASC,
    ABS(p.difficulty_rating - v_rating) ASC,
    p.times_served ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION hooperiq_next_plays IS
  'Adaptive play fetcher: matches Glicko rating ± concept difficulty offsets, prioritizes weak concepts.';
