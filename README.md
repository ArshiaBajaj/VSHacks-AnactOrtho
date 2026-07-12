# Anact Ortho

> **Democratizing elite sports tech with an on-device AI referee, commentator, and scout inside a single phone.**

Anact Ortho turns any smartphone mounted courtside into a real-time referee, playground commentator, and pro-grade scouting analyst — powered **entirely on-device**. No wearables. No smart balls. No cloud upload. No subscription.

This repository is an **npm-workspaces monorepo** hosting:

- `apps/mobile` — the production React Native + Expo dev-client app. Ships native C++ / Swift / Kotlin bridges, TFLite / CoreML models, and the 30 fps / 720p frame-processor pipeline.
- `apps/web` — the public web workspace (Vite + React 18) used as the shareable scout-card viewer, the marketing landing page, the **Film Room** (real NBA games replayed through the broadcast HUD — the play-by-play *timing* is a deterministic reconstruction, not raw box-score data; see "What's real" below), a **`/process`** page for the actual courtside-video pipeline (upload → CV officiating → highlights), and the "try in your browser" demo mode.
- `apps/server` — the Anact Ortho **backend** (Express + TypeScript). Serves real 2023-24 NBA data, film-room replay timelines, scout-card persistence, and optional LLM-powered commentary / scouting reports. Runs standalone; the app also works fully offline without it.
- `packages/core` — pure-TypeScript domain layer: types, sport profiles, scoring state machine, commentary engine, Zustand store. Used by both apps.
- `packages/vision` — platform-agnostic CV math: homography DLT solver, kinematic ball predictor, jump/release trackers, ball-color prior.
- `packages/tokens` — design system: slate-900 palette + `#ff5b1f` / `#22d3ee` brand accents (aligned with the web app), typography scale, spacing, shadows, motion. Shared between web (Tailwind preset) and mobile (RN theme).

## Repository layout

```
SummerHackathon/
├─ package.json                 # npm workspaces root
├─ tsconfig.base.json           # shared TS config + path aliases
├─ apps/
│   ├─ mobile/                  # React Native + Expo dev-client
│   │   ├─ app/                 # expo-router file-based routes
│   │   ├─ src/
│   │   │   ├─ audio/           # Whistle + score cue via expo-av
│   │   │   ├─ camera/          # 30fps/720p pipeline, frame processor, frame bus
│   │   │   ├─ components/      # Screen shell, header
│   │   │   ├─ design/          # Text, Button, Card, Chip, theme.ts
│   │   │   ├─ engine/          # SpatialEngine JS bridge (native + TS fallback)
│   │   │   └─ tts/             # expo-speech wrapper
│   │   └─ native/
│   │       ├─ cpp/             # SpatialEngine.hpp + Anact OrthoFramePlugin.cpp
│   │       ├─ ios/             # Anact OrthoFramePlugin.mm + SpatialEngineModule.swift
│   │       └─ android/         # SpatialEngineModule.kt (JNI stub)
│   └─ web/                     # Existing Vite PWA — landing + demo mode
└─ packages/
    ├─ core/
    ├─ vision/
    └─ tokens/
```

## Architecture — how the three pillars are implemented

### 1. Automated Officiating

- **Court calibration**: user taps the 4 corners of the playing surface on the camera preview. `packages/vision/homography.ts` solves an 8×8 DLT system to produce the image→world homography H. That H is pushed into the native `SpatialEngine` so every subsequent ball observation is grounded in meters, not pixels.
- **Ball tracking**: `native/cpp/Anact OrthoFramePlugin.cpp` runs a sport-specific color prior (Gaussian in RGB centered on `SportProfile.ballPrior.rgb`) against a GPU-downsampled 160-wide analysis buffer. Result: `BallObservation` with confidence in [0,1].
- **Occlusion recovery**: when confidence drops, `packages/vision/kinematic-predictor.ts` extrapolates from the last observation's velocity vector for up to `sport.kinematics.predictionHorizonMs`, with damping when nearby pose wrists are within 12% of the ball's last position (the ball is being held).
- **Boundary decision**: `SpatialEngine::Step` runs a point-in-quad test against the calibrated court corners. Crossings emit `EventKind::kOutOfBounds` + `EventKind::kWhistle`, subject to `whistleCooldownMs` per sport. The JS layer plays the whistle audio and pushes the event through the store.

### 2. Playground Audio Commentary

- `packages/core/commentary.ts` is a pure phrase engine (playground / broadcast / hype tones) that emits text lines. `apps/mobile/src/tts/speak.ts` wraps `expo-speech` — iOS's `AVSpeechSynthesizer` and Android's `TextToSpeech`, both of which ship offline voices out of the box. `apps/web/src/lib/audio.ts` bridges the same phrase engine to the Web Speech API.
- The wrapper adds rate-limiting so events emitted milliseconds apart don't overlap and dedupes identical phrases within 4.5 s.

### 3. Zero-Cost Pro Scouting

- `packages/vision/jump-tracker.ts` estimates vertical jump in cm from the ankle-Y baseline vs. the peak flight height, normalized by body height so we don't need physical calibration.
- `packages/vision/release-velocity.ts` computes wrist-release velocity from Δposition/Δtime, normalized by body height. Only peak values separated by 700 ms are reported to avoid flapping.
- Heatmap = weighted 22×12 grid of every confident ball observation over the game. Rendered as a court-plan SVG on the Scout screen.
- Highlight reel = top-N scoring / jumping events, auto-selected by value. Every game is exportable as a JSON snapshot via the SpatialEngine's snapshot API.

## Design system

Following the spec exactly:

| Token | Value |
| --- | --- |
| Base surface | slate-900 (#0f172a) — never pure black |
| Elevated surface | slate-800 (#1e293b) |
| Primary action | orange (#ff5b1f) — matches the web brand |
| Secondary action | cyan (#22d3ee) — matches the web brand |
| Danger / whistle | rose-500 (#f43f5e) |
| Warning / streak | amber-500 (#f59e0b) |
| Typography | Inter / Geist |
| Spacing | 4 px scale |
| Motion | 160–340 ms with `[0.2, 0.8, 0.2, 1]` cubic-bezier |

All tokens live in `packages/tokens` and are consumed as an object in RN (via `theme.ts`) and as a Tailwind preset on the web (via `tailwind-preset.ts`).

## Getting started

### Prerequisites

- Node **≥ 20.10**
- **iOS**: Xcode 15+, an iPhone simulator or a real device with iOS 15+
- **Android**: Android Studio Hedgehog+, an emulator or real device with Android 8+
- CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`)

### Install

```bash
npm install
```

This hoists dependencies for all workspaces (mobile + web + core + vision + tokens) into a single root `node_modules`.

### Web workspace (works everywhere — no native tooling needed)

```bash
npm run web:dev
# → http://localhost:5173
```

**Judges / full demo:** run the API too — Recruit hard-requires it.

```bash
# Terminal 1
bash backend/run.sh

# Terminal 2
npm run dev
```

Or `npm run dev:all` (backend + web). Film works offline with bundled games; Live needs a camera (+ CDN pose on first visit); Recruit needs `:8787`.

### Backend (`backend/`) — the full Python API: video pipeline + NBA data + Film Room + scout persistence

The production backend is the Python FastAPI service in [`backend/`](backend/README.md). It serves
**everything `apps/server` serves** (same routes, same JSON, same port 8787 — the web app needs zero
config changes) **plus** the real video-processing pipeline: upload a courtside video and get
automated officiating events, live WebSocket streaming, commentary with offline TTS audio,
highlight clips + stitched reels, shot charts, heatmaps, jump/velocity metrics, box scores,
live-session persistence for the web Live page, leaderboards, and public share links.
Full API reference: [`backend/API_CONTRACT.md`](backend/API_CONTRACT.md). ~77-test pytest suite.

```bash
# Terminal 1 — start the API (http://localhost:8787); first run bootstraps its own venv
backend/run.sh              # Windows: backend\run.ps1

# Optional: seed a fully processed demo game (real highlights, no phone footage needed)
cd backend && .venv/bin/python -m app.demo    # Windows: .venv\Scripts\python.exe -m app.demo

# Terminal 2 — start the web app
npm run dev                 # http://localhost:5173
```

<details>
<summary>Legacy TS stub (<code>apps/server</code>) — superseded by <code>backend/</code>, kept for reference</summary>

`npm run server:start` and `npm run server:dev` now both just run `backend/run.sh` — the Python backend. To run the old Express/TS stub instead:

```bash
npm run server:legacy       # apps/server (Express + TS), not the Python backend
npm run dev:all             # backend/run.sh + web together
```

</details>

Verify it's live:

```bash
curl http://localhost:8787/api/health
```

**Endpoints**

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Status + counts + whether the LLM is enabled |
| GET | `/api/teams` | Real NBA franchises |
| GET | `/api/players?search=&team=` | Real players + real 2023-24 per-game averages |
| GET | `/api/players/:id` | Single player |
| GET | `/api/leaders?category=ppg\|rpg\|apg\|spg\|bpg` | Statistical leaders |
| GET | `/api/films` | Real 2024 games available in the Film Room |
| GET | `/api/films/:id` | A game + its Anact Ortho replay timeline |
| POST | `/api/commentary` | One commentary line for an event |
| POST | `/api/ai/scouting-report` | Narrative scouting report for a player |
| POST | `/api/scout/profiles` | Publish a shareable scout card |
| GET | `/api/scout/profiles/:id` | Fetch a published card |

**What's real:** the player averages (e.g. Embiid 34.7, Luka 33.9, Giannis 30.4), team colors, and the games' final scores / dates / star box-score lines (Luka's 73-point game, Embiid's 70, the 2024 Finals Game 5 clincher) are all real. The play-by-play *timing* inside a Film Room replay is a **reconstructed** deterministic sequence seeded from the real final score — it is not the actual play-by-play feed. The Film Room's "Watch the real footage" button links out to the actual highlights. If you want the real CV pipeline running against real footage (not a reconstruction), use the **`/process`** page in the web app to upload courtside video.

### Do you need an OpenAI key?

**No.** The core experience runs end-to-end with **zero keys** — commentary and scouting reports come from a built-in deterministic engine, and pose/ball tracking run entirely in the browser/on-device. This isn't a zero-network guarantee, though: the web app's pose model + WASM runtime are fetched from a CDN on first load (a few MB, once), and `apps/web/public/sw.js` caches those assets afterward so subsequent sessions survive a flaky connection.

**Optionally**, set an `OPENAI_API_KEY` environment variable before starting `backend/` (or drop a key into `apps/server/.env` for the legacy stub) to upgrade those two features to model-generated text:

```bash
# Python backend: export before running
export OPENAI_API_KEY=sk-...          # Windows: $env:OPENAI_API_KEY="sk-..."
OPENAI_MODEL=gpt-4o-mini              # optional, this is the default

# legacy stub: cp apps/server/.env.example apps/server/.env and edit
```

When a key is present, `/api/commentary` and `/api/ai/scouting-report` return `"source": "llm"`; otherwise `"source": "engine"`. Either way the app works.

### Mobile workspace

The mobile app uses **Expo dev-client**, not Expo Go, because it ships native modules (vision-camera frame processors, our C++ SpatialEngine, TFLite / CoreML). The first run needs a native build:

```bash
# 1. Generate the native iOS + Android projects
npm run mobile:prebuild

# 2. iOS (requires macOS + Xcode)
cd apps/mobile/ios && pod install && cd -
npm run mobile:ios

# 3. Android
npm run mobile:android
```

After the first successful build, day-to-day iteration only needs:

```bash
npm run mobile:start
```

...and pressing **`i`** or **`a`** to reopen your simulator.

## Native module wiring

After `expo prebuild` generates `apps/mobile/ios/` and `apps/mobile/android/`:

1. Copy `apps/mobile/native/ios/Anact OrthoFramePlugin.mm` into the Xcode project and add the `native/cpp` folder to the target's **Header Search Paths**.
2. Copy `apps/mobile/native/ios/SpatialEngineModule.swift` into the Xcode project and generate its `-Bridging-Header.h`.
3. Copy `apps/mobile/native/android/SpatialEngineModule.kt` into `apps/mobile/android/app/src/main/java/com/courtvision/ai/` and register it in the generated `MainApplication.kt`.
4. Add `apps/mobile/native/cpp/` to `apps/mobile/android/app/CMakeLists.txt`.

These stubs are complete enough to compile and register with React Native; the pixel-buffer decoding paths are documented inline for the final "wire up the actual frame bytes" step.

## Scripts

| Command | Description |
| --- | --- |
| `npm run typecheck` | Typecheck every workspace |
| `npm run dev` | Vite dev server for the web workspace |
| `npm run dev:all` | Backend API (`backend/run.sh`) + web dev server together |
| `npm run backend:start` | Start the Python backend API via `backend/run.sh` (port 8787) |
| `npm run server:start` | Alias for `backend:start` — this is what actually runs now |
| `npm run server:dev` | Alias for `backend:start` |
| `npm run server:legacy` | Start the old `apps/server` Express/TS stub instead (superseded, kept for reference) |
| `npm run web:dev` | Vite dev server for the web workspace |
| `npm run web:build` | Production web bundle |
| `npm run mobile:start` | Metro bundler for the dev-client |
| `npm run mobile:ios` | Build + run on iOS |
| `npm run mobile:android` | Build + run on Android |
| `npm run mobile:prebuild` | Regenerate native iOS + Android projects |

## Roadmap

- **Native pose model**: swap the placeholder pose bridge for `react-native-fast-tflite` running an MoveNet-Lightning quantized `.tflite` (Android) / `.mlmodel` (iOS). The interface in `SpatialEngine` and `frameProcessor.ts` is already the final shape.
- **Ball detector**: quantized YOLOv8-nano on the NPU (Hexagon on Android, Neural Engine on iOS) as an every-6th-frame correction signal on top of the color prior.
- **Scout card sharing**: expo-file-system + expo-sharing to export a signed JSON snapshot and QR-code shareable URL.
- **Persistence**: MMKV for last-session recovery, SQLite for match history.
- **Web ↔ shared packages migration**: `apps/web` currently vendors its own copies of the store + commentary engine (kept for the working demo). Follow-up PR migrates it to consume `@courtvision/core` directly.

---

_"Every kid, every court, every jump — on the record."_
