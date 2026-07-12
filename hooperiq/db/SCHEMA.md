# HooperIQ Phase 1 — Schema Overview

Isolated under `hooperiq/db`. Does not migrate or alter the main monorepo database.

```
users 1──1 user_iq_stats
  │
  ├── basketball_plays (created_by)
  │         │
  │         └── play_assessments
  │
  ├── team_organizations (owner)
  │         │
  │         └── team_campaigns
  │                   │
  │                   ├── campaign_questions ── play_assessments
  │                   └── campaign_roster ── users
  │
  └── concept_attempt_history ← play_assessments
```

## Core tables

| Table | Purpose |
|-------|---------|
| `users` | Players, coaches, admins |
| `user_iq_stats` | IQ 60–140, Glicko-2 (μ, RD, σ), streaks, daily challenge, concept proficiency JSONB |
| `basketball_plays` | Library clips, pause ms, `true_read`, answer vectors, difficulty, concept tags, pgvector embedding |
| `team_organizations` | HS / club orgs |
| `team_campaigns` | Coach film + access codes |
| `campaign_questions` | Freeze-frame annotations (`timestamp_ms`, `true_read`, positions) |
| `campaign_roster` | Players who joined via access code |
| `play_assessments` | Voice/text submissions + LLM score JSON |
| `concept_attempt_history` | Per-tag attempt log for adaptive fetch |
| `leaderboard_snapshots` | Durable leaderboard (Redis is the hot cache) |

## Adaptive helpers

- `hooperiq_glicko_to_iq(rating)` — maps Glicko μ → display IQ
- `hooperiq_next_plays(user_id, limit, concept?)` — difficulty-matched clips biased toward weak concepts
- `v_user_concept_trends` — rolling 20-attempt concept averages

## IQ mapping

| Glicko μ | Display IQ |
|----------|------------|
| 1000 | 60 |
| 1500 | 100 |
| 2000 | 140 |
