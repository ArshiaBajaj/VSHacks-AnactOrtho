# Anact Ortho (web)

Three features. Demo on **web** — mobile native CV is incomplete.

| Route | Feature | Needs |
| --- | --- | --- |
| `/live` | Courtside camera **or upload clip**: setup → tip off → report | Video file (mp4/mov) or camera; CDN MediaPipe once (optional for ball heuristics) |
| `/film` | HUD replay of real 2023–24 finals | Works offline (bundled samples) |
| `/recruit` | Upload / Try demo → scout card from that game | **Python API** on `:8787` |

## Run

```bash
# Terminal 1 — required for Recruit
bash backend/run.sh
curl http://localhost:8787/api/health

# Terminal 2
npm run dev
# → http://localhost:5173
```

Optional highlight clips: `cd backend && .venv/bin/python -m app.demo` (seeds `g_demo`).

## Honest claims

- **Live:** Upload a courtside mp4 (no hoop required) or use the camera. Manual +2/+3 + whistle are the reliable path. Auto-score is OFF by default (rim-arc heuristic). Ball tracking is orange-pixel heuristics, not YOLO. Pose is CDN MediaPipe.
- **Film:** “Replay HUD” reconstructs play-by-play from the final score — not broadcast video. YouTube opens a search.
- **Recruit:** Does not work with Vite alone. Scout card from “Open scout card from this game” uses `/api/games/:id/analytics`. Upload here hits the Python backend CV pipeline.

## App flow

1. `/` Landing — three doors  
2. `/live` — calibrate corners → tip off → End → `/analytics` → New game  
3. `/film` — pick a sample game → Replay HUD  
4. `/recruit` — API online → Try demo → Open scout card from this game  

Legacy `/calibrate` → `/live`, `/process` → `/recruit`.
