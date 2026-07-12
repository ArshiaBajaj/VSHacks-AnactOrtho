import express from "express";
import cors from "cors";
import { api } from "./routes.js";
import { llmEnabled } from "./services/ai.js";

const app = express();
const PORT = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Tiny request log — helpful during a live demo.
app.use((req, _res, next) => {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${req.method} ${req.url}`);
  next();
});

app.get("/", (_req, res) => {
  res.json({
    name: "Anact Ortho · Backend",
    docs: "/api/health",
    endpoints: [
      "GET  /api/health",
      "GET  /api/teams",
      "GET  /api/players?search=&team=",
      "GET  /api/players/:id",
      "GET  /api/leaders?category=ppg|rpg|apg|spg|bpg&limit=",
      "GET  /api/films",
      "GET  /api/films/:id",
      "POST /api/commentary",
      "POST /api/ai/scouting-report",
      "POST /api/ai/film  {action: line|ask|moment|quiz|chapters|recap}",
      "POST /api/scout/profiles",
      "GET  /api/scout/profiles",
      "GET  /api/scout/profiles/:id",
      "GET  /api/hooperiq/health",
      "POST /api/hooperiq/assess",
    ],
  });
});

app.use("/api", api);

app.use((_req, res) => res.status(404).json({ error: "not_found" }));

app.listen(PORT, () => {
  console.log("");
  console.log("  🏀  Anact Ortho backend");
  console.log(`      → http://localhost:${PORT}`);
  console.log(`      → health: http://localhost:${PORT}/api/health`);
  console.log(`      → LLM commentary/reports: ${llmEnabled() ? "ENABLED (OpenAI)" : "offline deterministic engine"}`);
  console.log("");
});
