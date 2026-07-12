import type { FilmEvent, FilmGame, FilmGameDetail, TeamId } from "../types.js";
import { teamColor } from "./teams.js";

/**
 * Real, famous 2023-24 NBA games. The final scores, dates and star box-score
 * lines are real. Anact Ortho turns each into a "film-room replay": a
 * quarter-by-quarter event timeline that drives the same broadcast HUD the
 * live product uses. The play-by-play timing is a deterministic reconstruction
 * (seeded by the real final score) — the underlying result/box score is real.
 */
interface FilmSeed {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  season: string;
  a: { tricode: string; name: string; final: number };
  b: { tricode: string; name: string; final: number };
  headline: string;
  starLine: string;
  youtubeUrl: string;
  tags: string[];
  boxLeaders: { name: string; team: TeamId; line: string }[];
}

const SEEDS: FilmSeed[] = [
  {
    id: "luka-73",
    title: "Luka Dončić drops 73",
    subtitle: "3rd-highest single-game total in NBA history",
    date: "2024-01-26",
    season: "2023-24",
    a: { tricode: "DAL", name: "Mavericks", final: 148 },
    b: { tricode: "ATL", name: "Hawks", final: 143 },
    headline: "Luka pours in 73 to outduel Atlanta in a shootout for the ages.",
    starLine: "Dončić: 73 PTS · 10 REB · 7 AST · 25/33 FG",
    youtubeUrl: "https://www.youtube.com/watch?v=GRblNTXolvo",
    tags: ["Career-high", "Shootout", "MVP form"],
    boxLeaders: [
      { name: "Luka Dončić", team: "A", line: "73 PTS · 10 REB · 7 AST" },
      { name: "Trae Young", team: "B", line: "22 PTS · 15 AST" },
      { name: "Dejounte Murray", team: "B", line: "23 PTS · 6 AST" },
    ],
  },
  {
    id: "embiid-70",
    title: "Joel Embiid explodes for 70",
    subtitle: "First 70-point game in 76ers history",
    date: "2024-01-22",
    season: "2023-24",
    a: { tricode: "PHI", name: "76ers", final: 133 },
    b: { tricode: "SAS", name: "Spurs", final: 123 },
    headline: "Embiid sets the franchise record and outscores Wembanyama's Spurs by himself in stretches.",
    starLine: "Embiid: 70 PTS · 18 REB · 5 AST · 24/41 FG",
    youtubeUrl: "https://www.youtube.com/watch?v=9SjvZPFiDH0",
    tags: ["Franchise record", "70-point game", "Big-man clinic"],
    boxLeaders: [
      { name: "Joel Embiid", team: "A", line: "70 PTS · 18 REB · 5 AST" },
      { name: "Victor Wembanyama", team: "B", line: "33 PTS · 7 REB · 6 BLK" },
      { name: "Devin Vassell", team: "B", line: "25 PTS" },
    ],
  },
  {
    id: "finals-g5-2024",
    title: "2024 NBA Finals · Game 5",
    subtitle: "Celtics clinch banner 18",
    date: "2024-06-17",
    season: "2023-24 Playoffs",
    a: { tricode: "BOS", name: "Celtics", final: 106 },
    b: { tricode: "DAL", name: "Mavericks", final: 88 },
    headline: "Boston closes the series 4-1; Jaylen Brown takes Finals MVP.",
    starLine: "Brown: 21 PTS · Tatum: 31 PTS, 11 AST, 8 REB",
    youtubeUrl: "https://www.youtube.com/watch?v=6kW6N2Ax9XA",
    tags: ["Championship", "Finals MVP", "Clincher"],
    boxLeaders: [
      { name: "Jayson Tatum", team: "A", line: "31 PTS · 11 AST · 8 REB" },
      { name: "Jaylen Brown", team: "A", line: "21 PTS · Finals MVP" },
      { name: "Kyrie Irving", team: "B", line: "15 PTS" },
    ],
  },
  {
    id: "wemby-5x5",
    title: "Wembanyama's historic 5×5",
    subtitle: "Youngest player ever with a 5×5 game",
    date: "2024-01-13",
    season: "2023-24",
    a: { tricode: "SAS", name: "Spurs", final: 130 },
    b: { tricode: "DET", name: "Pistons", final: 108 },
    headline: "Victor stuffs every column and anchors the paint like a franchise cornerstone.",
    starLine: "Wembanyama: 27 PTS · 10 REB · 5 AST · 5 STL · 5 BLK",
    youtubeUrl: "https://www.youtube.com/watch?v=D2-ZVVxU1Wk",
    tags: ["Rookie", "Two-way", "History"],
    boxLeaders: [
      { name: "Victor Wembanyama", team: "A", line: "27 PTS · 10 REB · 5 STL · 5 BLK" },
      { name: "Devin Vassell", team: "A", line: "20 PTS" },
      { name: "Cade Cunningham", team: "B", line: "31 PTS · 7 AST" },
    ],
  },
  {
    id: "sga-thunder",
    title: "SGA leads the 1-seed Thunder",
    subtitle: "MVP-caliber two-way masterclass · West semis G4",
    date: "2024-05-13",
    season: "2023-24 Playoffs",
    a: { tricode: "OKC", name: "Thunder", final: 100 },
    b: { tricode: "DAL", name: "Mavericks", final: 96 },
    headline: "Shai's mid-range and defense even the series 2–2 in Dallas.",
    starLine: "Gilgeous-Alexander: 34 PTS · 8 REB · 5 AST",
    youtubeUrl: "https://www.youtube.com/watch?v=4g98FQb54No",
    tags: ["MVP race", "Playoffs", "Two-way"],
    boxLeaders: [
      { name: "Shai Gilgeous-Alexander", team: "A", line: "34 PTS · 8 REB · 5 AST" },
      { name: "Chet Holmgren", team: "A", line: "15 PTS · 9 REB" },
      { name: "Luka Dončić", team: "B", line: "29 PTS · 10 REB · 5 AST" },
    ],
  },
];

/** Deterministic PRNG (mulberry32) so a given game always yields the same replay. */
function rng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUARTER_MS = 12 * 60 * 1000;
const GAME_MS = 4 * QUARTER_MS;

function clockFor(tInQuarter: number): string {
  const remaining = Math.max(0, QUARTER_MS - tInQuarter);
  const total = Math.floor(remaining / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Build a realistic scoring timeline that sums exactly to the real final score. */
function buildTimeline(seed: FilmSeed): FilmEvent[] {
  const rand = rng(seed.id);
  const events: FilmEvent[] = [];
  let scoreA = 0;
  let scoreB = 0;
  let streakTeam: TeamId | null = null;
  let streak = 0;

  const emitScoresForTeam = (team: TeamId, target: number, color: TeamId) => {
    void color;
    // Break `target` points into 2s and 3s (plus the odd FT) pseudo-randomly.
    let remaining = target;
    const buckets: number[] = [];
    while (remaining > 0) {
      if (remaining >= 3 && rand() < 0.36) {
        buckets.push(3);
        remaining -= 3;
      } else if (remaining >= 2) {
        buckets.push(2);
        remaining -= 2;
      } else {
        buckets.push(1);
        remaining -= 1;
      }
    }
    return buckets;
  };

  const bucketsA = emitScoresForTeam("A", seed.a.final, "A");
  const bucketsB = emitScoresForTeam("B", seed.b.final, "B");

  // Interleave both teams' baskets across the 48 minutes.
  type Basket = { team: TeamId; pts: number };
  const baskets: Basket[] = [
    ...bucketsA.map((pts) => ({ team: "A" as TeamId, pts })),
    ...bucketsB.map((pts) => ({ team: "B" as TeamId, pts })),
  ];
  // Shuffle deterministically.
  for (let i = baskets.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [baskets[i], baskets[j]] = [baskets[j], baskets[i]];
  }

  baskets.forEach((b, idx) => {
    const t = Math.floor(((idx + 0.5) / baskets.length) * GAME_MS);
    const quarter = Math.min(4, Math.floor(t / QUARTER_MS) + 1);
    const tInQuarter = t - (quarter - 1) * QUARTER_MS;
    if (b.team === "A") scoreA += b.pts;
    else scoreB += b.pts;

    if (streakTeam === b.team) streak += 1;
    else {
      streakTeam = b.team;
      streak = 1;
    }

    events.push({
      id: `${seed.id}-s${idx}`,
      t,
      quarter,
      clock: clockFor(tInQuarter),
      kind: "score",
      team: b.team,
      scoreA,
      scoreB,
      value: b.pts,
      text:
        b.pts === 3
          ? `${teamLabel(seed, b.team)} drills a three`
          : b.pts === 2
            ? `${teamLabel(seed, b.team)} finishes at the rim`
            : `${teamLabel(seed, b.team)} at the line`,
    });

    // Occasionally layer officiating / hype events on top.
    if (streak >= 4) {
      events.push({
        id: `${seed.id}-run${idx}`,
        t: t + 400,
        quarter,
        clock: clockFor(tInQuarter),
        kind: "streak",
        team: b.team,
        scoreA,
        scoreB,
        value: streak,
        text: `${teamLabel(seed, b.team)} on a ${streak}-basket run — timeout territory`,
      });
      streak = 0;
    }
    if (rand() < 0.05) {
      events.push({
        id: `${seed.id}-wh${idx}`,
        t: t + 700,
        quarter,
        clock: clockFor(tInQuarter),
        kind: "whistle",
        team: b.team === "A" ? "B" : "A",
        scoreA,
        scoreB,
        text: "Anact Ortho flags a boundary crossing — auto-whistle",
      });
    }
  });

  events.sort((x, y) => x.t - y.t);
  return events;
}

function teamLabel(seed: FilmSeed, team: TeamId): string {
  return team === "A" ? seed.a.name : seed.b.name;
}

export function listFilms(): FilmGame[] {
  return SEEDS.map((s) => toGame(s));
}

function toGame(s: FilmSeed): FilmGame {
  return {
    id: s.id,
    title: s.title,
    subtitle: s.subtitle,
    date: s.date,
    season: s.season,
    teamA: { tricode: s.a.tricode, name: s.a.name, color: teamColor(s.a.tricode), final: s.a.final },
    teamB: { tricode: s.b.tricode, name: s.b.name, color: teamColor(s.b.tricode), final: s.b.final },
    headline: s.headline,
    starLine: s.starLine,
    youtubeUrl: s.youtubeUrl,
    durationMs: GAME_MS,
    tags: s.tags,
  };
}

export function filmDetail(id: string): FilmGameDetail | undefined {
  const seed = SEEDS.find((s) => s.id === id);
  if (!seed) return undefined;
  return {
    ...toGame(seed),
    timeline: buildTimeline(seed),
    boxLeaders: seed.boxLeaders,
  };
}
