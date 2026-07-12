import { Router } from "express";
import type { Request, Response } from "express";
import { PLAYERS, playerById, leaders, type LeaderCategory } from "./data/players.js";
import { TEAMS } from "./data/teams.js";
import { listFilms, filmDetail } from "./data/films.js";
import { getCard, listCards, saveCard } from "./services/store.js";
import {
  generateCommentary,
  generateScoutingReport,
  llmEnabled,
  type CommentaryRequest,
} from "./services/ai.js";
import {
  answerFilmQuestion,
  generateChapters,
  generateCoachLine,
  generateMoment,
  generateQuiz,
  generateRecap,
  type CoachMode,
  type FilmContext,
} from "./services/filmCoach.js";
import type { ScoutCard } from "./types.js";
import { hooperiqApi } from "./routes.hooperiq.js";

export const api = Router();

// Independent HooperIQ feature (assess / health) — isolated router
api.use("/hooperiq", hooperiqApi);

api.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "anact-ortho-server",
    version: "0.1.0",
    llm: llmEnabled() ? "enabled" : "offline-fallback",
    counts: { players: PLAYERS.length, teams: TEAMS.length, films: listFilms().length },
    time: new Date().toISOString(),
  });
});

// --- Real NBA data --------------------------------------------------------

api.get("/teams", (_req, res) => {
  res.json({ teams: TEAMS });
});

api.get("/players", (req, res) => {
  const q = String(req.query.search ?? "").toLowerCase().trim();
  const team = String(req.query.team ?? "").toUpperCase().trim();
  let out = PLAYERS;
  if (team) out = out.filter((p) => p.team === team);
  if (q) out = out.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
  res.json({ season: "2023-24", count: out.length, players: out });
});

api.get("/players/:id", (req, res) => {
  const p = playerById(req.params.id);
  if (!p) return res.status(404).json({ error: "player_not_found" });
  res.json({ player: p });
});

api.get("/leaders", (req, res) => {
  const valid: LeaderCategory[] = ["ppg", "rpg", "apg", "spg", "bpg"];
  const cat = String(req.query.category ?? "ppg") as LeaderCategory;
  const category = valid.includes(cat) ? cat : "ppg";
  const limit = Math.min(24, Math.max(1, Number(req.query.limit ?? 10)));
  res.json({ category, leaders: leaders(category, limit) });
});

// --- Film room (real games → Anact Ortho replay) --------------------------

api.get("/films", (_req, res) => {
  res.json({ films: listFilms() });
});

api.get("/films/:id", (req, res) => {
  const film = filmDetail(req.params.id);
  if (!film) return res.status(404).json({ error: "film_not_found" });
  res.json({ film });
});

// --- Commentary + scouting AI (optional LLM, deterministic fallback) ------

api.post("/commentary", async (req, res) => {
  const body = req.body as CommentaryRequest;
  if (!body || typeof body.event !== "string") {
    return res.status(400).json({ error: "event_required" });
  }
  const result = await generateCommentary(body);
  res.json(result);
});

api.post("/ai/scouting-report", async (req, res) => {
  const card = req.body as ScoutCard;
  if (!card || !card.player || typeof card.player.name !== "string") {
    return res.status(400).json({ error: "player_required" });
  }
  const result = await generateScoutingReport(card);
  res.json(result);
});

// --- Film Room AI coach (line / ask / moment / quiz / chapters / recap) ---

function asFilmContext(body: Record<string, unknown>): FilmContext | null {
  const id = String(body.id ?? "");
  const title = String(body.title ?? "");
  if (!id || !title) return null;
  const teamA = body.teamA as FilmContext["teamA"] | undefined;
  const teamB = body.teamB as FilmContext["teamB"] | undefined;
  if (!teamA?.tricode || !teamB?.tricode) return null;
  const mode = (["rookie", "scout", "hype"].includes(String(body.mode))
    ? String(body.mode)
    : "scout") as CoachMode;
  return {
    id,
    title,
    subtitle: String(body.subtitle ?? ""),
    headline: String(body.headline ?? ""),
    starLine: String(body.starLine ?? ""),
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    teamA,
    teamB,
    boxLeaders: Array.isArray(body.boxLeaders)
      ? (body.boxLeaders as FilmContext["boxLeaders"])
      : [],
    scoreA: typeof body.scoreA === "number" ? body.scoreA : undefined,
    scoreB: typeof body.scoreB === "number" ? body.scoreB : undefined,
    quarter: typeof body.quarter === "number" ? body.quarter : undefined,
    clock: typeof body.clock === "string" ? body.clock : undefined,
    lastEvent: typeof body.lastEvent === "string" ? body.lastEvent : undefined,
    mode,
  };
}

api.post("/ai/film", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const film = asFilmContext(body);
    if (!film) return res.status(400).json({ error: "film_context_required" });

    if (action === "line") {
      const result = await generateCoachLine(film);
      return res.json(result);
    }
    if (action === "ask") {
      const question = String(body.question ?? "");
      const result = await answerFilmQuestion(film, question);
      return res.json(result);
    }
    if (action === "moment") {
      const result = await generateMoment(film);
      return res.json(result);
    }
    if (action === "quiz") {
      const result = await generateQuiz(film);
      return res.json(result);
    }
    if (action === "chapters") {
      const timeline = Array.isArray(body.timeline) ? body.timeline : [];
      const result = await generateChapters(
        film,
        timeline as {
          t: number;
          quarter: number;
          text: string;
          scoreA: number;
          scoreB: number;
        }[],
      );
      return res.json(result);
    }
    if (action === "recap") {
      const result = await generateRecap(film);
      return res.json(result);
    }
    return res.status(400).json({
      error: "invalid_action",
      hint: "line | ask | moment | quiz | chapters | recap",
    });
  } catch (err) {
    console.error("[film-ai]", err);
    res.status(500).json({ error: "film_ai_failed" });
  }
});

// --- Scout-card persistence + sharing -------------------------------------

api.post("/scout/profiles", async (req, res) => {
  const body = req.body as Omit<ScoutCard, "id" | "createdAt">;
  if (!body || !body.player || typeof body.player.name !== "string") {
    return res.status(400).json({ error: "invalid_card" });
  }
  // Attach a scouting report if one wasn't supplied.
  if (!body.report) {
    const report = await generateScoutingReport({ ...body, id: "tmp", createdAt: Date.now() } as ScoutCard);
    body.report = report.text;
    body.reportSource = report.source;
  }
  const saved = await saveCard(body);
  res.status(201).json({ card: saved });
});

api.get("/scout/profiles", async (_req, res) => {
  const cards = await listCards();
  res.json({ count: cards.length, cards });
});

api.get("/scout/profiles/:id", async (req, res) => {
  const card = await getCard(req.params.id);
  if (!card) return res.status(404).json({ error: "card_not_found" });
  res.json({ card });
});
