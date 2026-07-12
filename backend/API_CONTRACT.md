# CourtVision AI — Backend API Contract

Base URL (local dev): `http://localhost:8787`
Run: `uvicorn app.main:app --port 8787` (from `backend/`, venv active).
The web frontend (`apps/web`) defaults to `http://localhost:8787`, so this server is a
drop-in replacement for the old `apps/server` Express stub.

Interactive docs: `http://localhost:8787/docs` (auto-generated, always current)

CORS is open for `http://localhost:*` dev servers (Vite/Next/CRA all work).

All timestamps in events are **seconds from the start of the game video** (float).
All IDs are short strings. All responses are JSON unless noted.

---

## 1. Games (upload → process → results)

### POST `/api/games`
Upload a game video for processing. `multipart/form-data`:

| field | type | required | notes |
|---|---|---|---|
| `video` | file | yes | mp4/mov/avi/mkv/webm |
| `title` | str | no | display name |
| `players` | str (JSON array) | no | `[{"name":"Vihan","jersey_hint":"red shirt"}]` |
| `target_score` | int | no | game ends at this score (default 21) |
| `scoring` | str | no | `"1s_and_2s"` (default) or `"2s_and_3s"` |

Response `201`:
```json
{ "game_id": "g_ab12cd", "status": "queued" }
```
Jobs run one at a time (FIFO). Progress is visible on GET `/api/games/{id}`
and streamed over the WebSocket.

### GET `/api/games`
List all games. Response: `[{ "game_id", "title", "status", "created_at", "duration_s", "final_score" }]`

### GET `/api/games/{game_id}`
```json
{
  "game_id": "g_ab12cd",
  "title": "Sat pickup run",
  "status": "queued | processing | done | error",
  "progress": 0.42,
  "error": null,
  "created_at": "2026-07-11T15:00:00Z",
  "duration_s": 612.5,
  "final_score": {"team_a": 21, "team_b": 17},
  "target_score": 21,
  "scoring": "1s_and_2s",
  "players": [{"player_id": "p_1", "name": "Vihan"}]
}
```

### GET `/api/games/{game_id}/events`
Every event the engine emitted, in order. Event shape:
```json
{
  "event_id": "e_0001",
  "t": 34.2,
  "type": "score | out_of_bounds | whistle | streak | commentary | game_start | game_end | possession_change | shot_attempt",
  "team": "a | b | null",
  "player_id": "p_1 | null",
  "points": 2,
  "score_after": {"team_a": 4, "team_b": 2},
  "text": "Bucket! Get that man some water. Team A — 4-2.",
  "audio_url": "/media/audio/g_ab12cd/e_0001.wav"
}
```
Fields not relevant to a given type are `null`. `text` is the commentary line;
`audio_url` is present when offline TTS audio was rendered. On events emitted by
CV processing, `player_id` follows the convention `p_{track_id}` of the CV player track.

### GET `/api/games/{game_id}/analytics`
```json
{
  "game_id": "g_ab12cd",
  "team_stats": {"team_a": {"points": 21, "fg_attempts": 30, "fg_made": 12}, "team_b": {}},
  "players": [
    {
      "player_id": "p_1",
      "name": "Vihan",
      "points": 9,
      "shot_attempts": 11,
      "shots_made": 5,
      "max_vertical_jump_cm": 48.2,
      "avg_shot_release_velocity_ms": 6.1,
      "top_speed_ms": 5.4,
      "distance_covered_m": 1240.0,
      "heatmap": {"grid_w": 30, "grid_h": 17, "cells": [[0,0,3], [4,2,11]]}
    }
  ],
  "ball_heatmap": {"grid_w": 30, "grid_h": 17, "cells": [[x, y, count]]}
}
```
Heatmap `cells` are sparse `[grid_x, grid_y, count]` triples over a court-space grid
(grid_w × grid_h, half-court length × width). Render however you like.
If the game has not finished processing this returns an empty-but-valid blob.

### GET `/api/games/{game_id}/highlights`
```json
[
  {"highlight_id": "hl_000", "t_start": 30.1, "t_end": 38.4, "label": "Score (+2) by p_1",
   "video_url": "/media/highlights/g_ab12cd/hl_000.mp4", "thumb_url": "/media/highlights/g_ab12cd/hl_000.jpg"}
]
```

### GET `/api/games/{game_id}/boxscore`
```json
{
  "game_id": "g_ab12cd",
  "final_score": {"team_a": 21, "team_b": 14},
  "teams": {
    "a": {"points": 21, "fg_made": 18, "fg_attempts": 20, "best_streak": 6, "plus_minus": 7},
    "b": {"points": 14, "fg_made": 11, "fg_attempts": 13, "best_streak": 3, "plus_minus": -7}
  },
  "players": [{"player_id", "name", "points", "fg_made", "fg_attempts", "best_streak", "plus_minus"}]
}
```
Per-player `best_streak`/`plus_minus` are `null` when attribution is unavailable.

### DELETE `/api/games/{game_id}` — remove a game, its rows, and its media. → `{"deleted": true, "game_id": ...}`

---

## 2. Live event stream (WebSocket)

### WS `/ws/games/{game_id}`
Connect any time. Messages are JSON, one event per message (same shape as `/events`
above), plus status frames:
```json
{"type": "status", "status": "processing", "progress": 0.42}
```
- While a game is `queued`/`processing`: already-stored events are replayed first
  (catch-up), then new events stream live as the engine finds them.
- If the game is already `done` (and no simulation is running): all stored events are
  replayed instantly, then `{"type": "status", "status": "done"}` is sent and the
  socket closes.
- If a **simulation** is running for the game, the socket stays open and receives the
  time-scaled replay.
- Unknown game: one `{"type": "status", "status": "error", "error": "..."}` frame, then close.

### POST `/api/games/{game_id}/simulate`
**Demo mode for frontend dev.** Replays a finished game's stored events over the
WebSocket with real-time pacing. Body: `{"speed": 4.0}` (default 4.0; game-time seconds
per wall-clock second scale factor). Response:
```json
{"game_id": "g_sample", "status": "replaying", "speed": 4.0, "events": 100}
```
Call order: **POST simulate first, then open the WebSocket** — the replay waits ~1.5 s
before the first event so the socket can attach. `409` with code `already_simulating`
if a replay is active; `409` `not_replayable` if the game has no stored events.

A built-in sample game **`g_sample`** always exists (seeded at startup): a completed
10-minute pickup game to 21 with a ~100-event scripted timeline (scores, whistles,
streaks, commentary) and a plausible analytics blob. Build the whole live UI with
`POST /api/games/g_sample/simulate` + the WebSocket, no video needed.

---

## 3. Roster & scouting share links

> **Renamed:** our tracked-player CRUD lives under **`/api/roster`** (it was
> `/api/players` in an earlier draft). `GET /api/players` now serves the canned NBA
> dataset the frontend expects — see section 6.

### POST `/api/roster` — `{"name": "Vihan", "position": "PG", "height_cm": 180, "jersey_hint": "red shirt"}` → `201 {"player_id": "p_1"}`
### GET `/api/roster` — list of player profiles.
### GET `/api/roster/{player_id}` — profile + `career` (aggregated across processed games) + `games` (summaries).
### PATCH `/api/roster/{player_id}` — partial update of `name/position/height_cm/jersey_hint`.

### POST `/api/roster/{player_id}/share`
Create a public scouting link → `201 {"share_token": "s_9fk2", "share_url": "/api/share/s_9fk2"}`

### GET `/api/share/{share_token}` *(no auth — public)*
```json
{
  "share_token": "s_9fk2",
  "player": {"player_id", "name", "position", "height_cm", "jersey_hint"},
  "career": {"games_played", "points", "shot_attempts", "shots_made", "fg_pct",
             "max_vertical_jump_cm", "top_speed_ms", "distance_covered_m", "avg_points_per_game"},
  "games": [{ ...game summaries... }],
  "highlights": [ ...best 5 highlight objects... ]
}
```
This is the page recruiters see.

---

## 4. Media

`GET /media/...` serves generated files (highlight mp4s, thumbs, commentary wavs).
Plain static files, no auth.

## 5. Health & meta

### GET `/api/health`
Union of the contract shape and the frontend-client shape:
```json
{
  "ok": true,
  "status": "ok",
  "service": "anact-ortho-server",
  "version": "0.1.0",
  "llm": "enabled | offline-fallback",
  "counts": {"players": 24, "teams": 19, "films": 5},
  "time": "2026-07-11T19:33:47.856Z",
  "features": {"pose_enabled": true, "tts_enabled": true}
}
```

### GET `/api/config`
Scoring rules, court grid dims, feature flags (`pose_enabled`, `tts_enabled`) so the
frontend can adapt.

---

## 6. Frontend-compat endpoints (canned NBA data + AI)

These mirror the old `apps/server` Express stub **exactly** (camelCase keys, same
wrapper objects) so `apps/web/src/lib/api.ts` works unchanged. Error payloads here are
flat strings, e.g. `404 {"error": "film_not_found"}` — not the nested shape below.

| endpoint | response |
|---|---|
| GET `/api/teams` | `{"teams": [{tricode, name, city, conference, primary, secondary}]}` |
| GET `/api/players?search=&team=` | `{"season": "2023-24", "count", "players": [NbaPlayer]}` |
| GET `/api/players/{id}` | `{"player": NbaPlayer}` / `404 {"error":"player_not_found"}` |
| GET `/api/leaders?category=ppg&limit=10` | `{"category", "leaders": [NbaPlayer]}` (categories: ppg/rpg/apg/spg/bpg, limit 1-24) |
| GET `/api/films` | `{"films": [FilmGame]}` — 5 real 2023-24 games |
| GET `/api/films/{id}` | `{"film": FilmGameDetail}` incl. deterministic replay `timeline` / `404 {"error":"film_not_found"}` |
| POST `/api/commentary` | `{"text", "source": "llm"\|"engine"}`; body `{event, team?, teamName?, value?, scoreA?, scoreB?, style?}`; `400 {"error":"event_required"}` |
| POST `/api/ai/scouting-report` | `{"text", "source"}`; body = ScoutCard; `400 {"error":"player_required"}` |
| POST `/api/ai/film` | Film coach: body `{action, id, title, teamA, teamB, ...}` where `action` is `line` \| `ask` \| `moment` \| `quiz` \| `chapters` \| `recap`. Returns coach text / moment / quiz / chapters / recap with `source`. Offline deterministic engine when no OpenAI key. |
| POST `/api/scout/profiles` | `201 {"card": {...saved card, id, createdAt}}` — auto-generates `report` if missing; `400 {"error":"invalid_card"}` |
| GET `/api/scout/profiles` | `{"count", "cards": [...]}` (newest first, persisted in SQLite) |
| GET `/api/scout/profiles/{id}` | `{"card"}` / `404 {"error":"card_not_found"}` |

`NbaPlayer` fields: `id, name, team, teamName, position, jersey, heightCm, ppg, rpg,
apg, spg, bpg, fgPct, tpPct, ftPct, gamesPlayed`.

Commentary + scouting reports use a deterministic phrase engine offline; set
`OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) to upgrade both to LLM generation with
automatic fallback. `/api/health` reports which mode is active via `llm`.

## 7. Bonus endpoints (shot chart, reel, exports, ad-hoc TTS)

### GET `/api/games/{game_id}/shotchart`
Shot chart derived from the stored event stream (no reprocessing):
```json
{
  "game_id": "g_ab12cd",
  "shots": [
    {"t": 34.2, "player_id": "p_1", "team": "a", "made": true, "points": 2,
     "x": 5.91, "y": 8.4, "approx": true}
  ]
}
```
- `x`/`y` are court-space meters over the half court `[0, 14.325] x [0, 15.24]`
  (rim center at `(1.575, 7.62)`, 3-point arc at 6.75 m).
- Derivation: each `shot_attempt` event is a shot; it is `made` when a `score`
  event of a compatible team follows within 2.0 s (that score supplies
  team/player/points). Score events with no matching attempt (e.g. `g_sample`,
  which has no `shot_attempt` events) still become made shots.
- Events do not currently persist per-shot coordinates, so positions are
  synthesized deterministically from the shot value (inside vs beyond the arc,
  jitter seeded by `event_id`) and flagged `"approx": true`; if an event carries
  `x`/`y` (or `court_xy`) it is used verbatim with `"approx": false`.
- Empty `shots` list for games without shot activity; `404 game_not_found` envelope otherwise.

### POST `/api/games/{game_id}/reel`
Stitch the game's existing highlight clips into one `reel.mp4`
(first clip's size/fps, others resized; a 0.5 s black title card with the
highlight label precedes each clip). Built synchronously (highlights are
capped at 12 short clips). Idempotent: if the reel already exists it is
returned immediately with `"cached": true`.
```json
{"reel_url": "/media/highlights/g_ab12cd/reel.mp4", "clips": 6, "duration_s": 41.5, "cached": false}
```
`409 {"error": {"code": "no_highlights", ...}}` when the game has no highlight clip files
(e.g. `g_sample`, whose highlights have no video files).

### GET `/api/games/{game_id}/reel`
`{"reel_url": "/media/highlights/{game_id}/reel.mp4", "duration_s": 41.5}` once built;
`404 {"error": {"code": "reel_not_built", ...}}` before that.

### GET `/api/games/{game_id}/export.json`
Complete downloadable bundle (Content-Disposition attachment,
`courtvision_{game_id}.json`):
```json
{"game": {...}, "events": [...], "analytics": {...}, "highlights": [...], "shotchart": {...}}
```
`analytics` is the empty-but-valid blob when the game has not finished processing.

### GET `/api/games/{game_id}/export.csv`
Events as CSV, columns `t,type,team,player_id,points,score_a,score_b,text`.
Served UTF-8 **with BOM** (Excel-friendly) with a Content-Disposition
attachment header (`courtvision_{game_id}.csv`). Null fields are empty cells.

### Ad-hoc TTS on compat AI endpoints
`POST /api/commentary` and `POST /api/ai/scouting-report` accept an optional
`"tts": true` in the body. When set and TTS is available
(`/api/config` → `features.tts_enabled`), the generated text is rendered to
`media/audio/adhoc/{hash}.wav` (hash of the text, so repeats are cached) and the
response gains `"audio_url": "/media/audio/adhoc/{hash}.wav"`; when TTS is
unavailable or fails, `"audio_url": null`. Responses are unchanged when `tts`
is absent (backward compatible).

## 8. Live sessions (in-browser CV persistence + spectator mode)

The web Live page runs CV in the browser and used to lose everything on
refresh. Live sessions persist that stream and let spectators follow along.
Bodies deliberately accept the **frontend event shape** (camelCase kinds from
`packages/core` `EventKind`, `t` in **milliseconds** since session start):
`{"id"?, "t", "kind", "team"? "A"|"B", "playerId"?/"player"?, "value"?, "text"?, "scoreA"?, "scoreB"?}`
with kinds `score | out_of_bounds | whistle | jump | shot | steal | streak | highlight | commentary`.

### POST `/api/live/sessions`
Body (all optional): `{"title", "sport", "teamAName", "teamBName", "players": [{"name", "team"}]}`
→ `201 {"session_id": "ls_xxx", "started_at": "..."}`. Session starts in status `live`.

### POST `/api/live/sessions/{session_id}/events`
Body: `{"events": [{...frontend event}, ...]}`. Events are appended to the
session log and echoed to spectators on WS `/ws/live/{session_id}`.
→ `{"accepted": n, "total": m}` (`total` = cumulative stored events).
`404 session_not_found`; `409 {"error": {"code": "session_finished", ...}}` once finished;
`422 invalid_events` for malformed bodies.

### GET `/api/live/sessions` / GET `/api/live/sessions/{session_id}?limit=50`
List (newest first, with `event_count`) / detail. Detail includes `events`:
the **last** `limit` stored events in order (default 50, max 500). Fields:
`session_id, title, sport, team_a_name, team_b_name, status live|finished,
started_at, finished_at, duration_ms, game_id (once converted), players`.

### POST `/api/live/sessions/{session_id}/finish`
Body (all optional): `{"durationMs", "stats": {...free-form, "players": [frontend PlayerProfile]}, "publishScoutCard": {"playerName"}}`
→ `{"game_id": "g_xxx", "scout_card_id"?: "..."}`, and:
- marks the session `finished` (repeat finish → `409 session_finished`);
- **converts the session into a regular completed game row** (status `done`)
  so it shows up in `GET /api/games` with `/events` and `/boxscore` working.
  Translation: `t` ms → seconds; kinds `score/out_of_bounds/whistle/streak/commentary`
  map 1:1 to `EventType`, `shot` → `shot_attempt`, `jump/steal/highlight` →
  `commentary` events preserving `text`; `score_after` from `scoreA`/`scoreB`
  (or a running tally when absent); the timeline is bracketed with
  `game_start`/`game_end`. `stats.players` (camelCase PlayerProfile:
  `points/shots/makes/bestJumpCm/topReleaseMps/distanceM`) becomes the game's
  analytics `players` blob, so converted games feed leaderboards;
- with `publishScoutCard`, auto-creates a compat scout card (same shape and
  storage as `POST /api/scout/profiles`, report auto-generated) for that player;
- broadcasts a final `{"type": "status", "status": "finished", "game_id"}` frame
  to spectators and closes the live stream.

### WS `/ws/live/{session_id}`
Spectator stream. On connect: `{"type": "status", "status": "live"|"finished"}`,
then a replay of the **last 20** stored events, then live events as they are
ingested until the session finishes (final status frame, then close). A
finished session gets the tail replay and closes immediately. Unknown session:
one `{"type": "status", "status": "error", ...}` frame, then close.

## 9. Identity mapping

CV-processed games tag events with track ids (`p_{track_id}`) that don't match
roster ids (`p_{hex}`). Identify bridges the seam so career aggregation and the
share page pick the game up.

### POST `/api/games/{game_id}/identify`
Body: `{"mapping": {"p_3": "p_ab12cd34", ...}}` (source id → roster player id).
Rewrites `events.player_id` for that game, rewrites the analytics blob's
`players[].player_id` **and** `name` (name pulled from the roster), and links
the roster players to the game. → `{"events_updated": n, "analytics_updated": true|false}`.
`404 game_not_found` / `404 roster_player_not_found` (nothing applied);
`422 invalid_mapping` for an empty mapping.

## 10. Leaderboards

### GET `/api/leaderboards?category=points|vertical|speed|distance&limit=10`
Aggregated across every **done** game's analytics blob, joined to roster names
when the player id is in the roster. Career totals for `points`/`distance`;
single-game bests for `vertical` (max_vertical_jump_cm) / `speed` (top_speed_ms).
Invalid category deliberately falls back to `points` (mirrors `/api/leaders`);
`limit` clamped to 1-50.
```json
{"category": "points", "leaders": [{"player_id": "p_1", "name": "Vihan", "value": 42, "games": 3}]}
```
Lives at `/api/leaderboards` (NOT under `/api/roster`) to avoid colliding with
the `/api/roster/{player_id}` route.

## Error shape (contract endpoints)
```json
{ "error": {"code": "game_not_found", "message": "No game g_zzz"} }
```
HTTP status matches (404, 409, 422, 500...). Validation errors use FastAPI's standard
422 shape. Compat endpoints (section 6) use flat string errors as noted.
