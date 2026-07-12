import type { NbaPlayer } from "../types.js";
import { teamName } from "./teams.js";

/**
 * Real NBA players with real 2023-24 regular-season per-game averages.
 * Source figures are the widely published season stat lines. This ships in the
 * bundle so the feed is 100% functional with zero network / zero API key.
 * (An optional live provider can be layered on later behind an env flag.)
 */
const RAW: Omit<NbaPlayer, "teamName">[] = [
  { id: "luka-doncic", name: "Luka Dončić", team: "DAL", position: "PG", jersey: 77, heightCm: 201, ppg: 33.9, rpg: 9.2, apg: 9.8, spg: 1.4, bpg: 0.5, fgPct: 48.7, tpPct: 38.2, ftPct: 78.6, gamesPlayed: 70 },
  { id: "sga", name: "Shai Gilgeous-Alexander", team: "OKC", position: "PG", jersey: 2, heightCm: 198, ppg: 30.1, rpg: 5.5, apg: 6.2, spg: 2.0, bpg: 0.9, fgPct: 53.5, tpPct: 35.3, ftPct: 87.4, gamesPlayed: 75 },
  { id: "giannis", name: "Giannis Antetokounmpo", team: "MIL", position: "PF", jersey: 34, heightCm: 211, ppg: 30.4, rpg: 11.5, apg: 6.5, spg: 1.2, bpg: 1.1, fgPct: 61.1, tpPct: 27.4, ftPct: 65.7, gamesPlayed: 73 },
  { id: "embiid", name: "Joel Embiid", team: "PHI", position: "C", jersey: 21, heightCm: 213, ppg: 34.7, rpg: 11.0, apg: 5.6, spg: 1.2, bpg: 1.7, fgPct: 52.9, tpPct: 38.8, ftPct: 88.3, gamesPlayed: 39 },
  { id: "jokic", name: "Nikola Jokić", team: "DEN", position: "C", jersey: 15, heightCm: 211, ppg: 26.4, rpg: 12.4, apg: 9.0, spg: 1.4, bpg: 0.9, fgPct: 58.3, tpPct: 35.9, ftPct: 81.7, gamesPlayed: 79 },
  { id: "brunson", name: "Jalen Brunson", team: "NYK", position: "PG", jersey: 11, heightCm: 188, ppg: 28.7, rpg: 3.6, apg: 6.7, spg: 0.9, bpg: 0.2, fgPct: 47.9, tpPct: 40.1, ftPct: 84.7, gamesPlayed: 77 },
  { id: "tatum", name: "Jayson Tatum", team: "BOS", position: "SF", jersey: 0, heightCm: 203, ppg: 26.9, rpg: 8.1, apg: 4.9, spg: 1.0, bpg: 0.6, fgPct: 47.1, tpPct: 37.6, ftPct: 83.3, gamesPlayed: 74 },
  { id: "durant", name: "Kevin Durant", team: "PHX", position: "SF", jersey: 35, heightCm: 208, ppg: 27.1, rpg: 6.6, apg: 5.0, spg: 0.9, bpg: 1.2, fgPct: 52.3, tpPct: 41.3, ftPct: 85.6, gamesPlayed: 75 },
  { id: "booker", name: "Devin Booker", team: "PHX", position: "SG", jersey: 1, heightCm: 196, ppg: 27.1, rpg: 4.5, apg: 6.9, spg: 0.9, bpg: 0.4, fgPct: 49.2, tpPct: 36.4, ftPct: 88.6, gamesPlayed: 68 },
  { id: "ant", name: "Anthony Edwards", team: "MIN", position: "SG", jersey: 5, heightCm: 193, ppg: 25.9, rpg: 5.4, apg: 5.1, spg: 1.3, bpg: 0.5, fgPct: 46.1, tpPct: 35.7, ftPct: 83.6, gamesPlayed: 79 },
  { id: "curry", name: "Stephen Curry", team: "GSW", position: "PG", jersey: 30, heightCm: 188, ppg: 26.4, rpg: 4.5, apg: 5.1, spg: 0.7, bpg: 0.4, fgPct: 45.0, tpPct: 40.8, ftPct: 92.3, gamesPlayed: 74 },
  { id: "lebron", name: "LeBron James", team: "LAL", position: "SF", jersey: 23, heightCm: 206, ppg: 25.7, rpg: 7.3, apg: 8.3, spg: 1.3, bpg: 0.5, fgPct: 54.0, tpPct: 41.0, ftPct: 75.0, gamesPlayed: 71 },
  { id: "ad", name: "Anthony Davis", team: "LAL", position: "PF", jersey: 3, heightCm: 208, ppg: 24.7, rpg: 12.6, apg: 3.5, spg: 1.2, bpg: 2.3, fgPct: 55.6, tpPct: 27.1, ftPct: 81.6, gamesPlayed: 76 },
  { id: "kawhi", name: "Kawhi Leonard", team: "LAC", position: "SF", jersey: 2, heightCm: 201, ppg: 23.7, rpg: 6.1, apg: 3.6, spg: 1.6, bpg: 0.9, fgPct: 52.5, tpPct: 41.7, ftPct: 88.5, gamesPlayed: 68 },
  { id: "dame", name: "Damian Lillard", team: "MIL", position: "PG", jersey: 0, heightCm: 188, ppg: 24.3, rpg: 4.4, apg: 7.0, spg: 1.0, bpg: 0.3, fgPct: 42.4, tpPct: 35.4, ftPct: 92.0, gamesPlayed: 73 },
  { id: "fox", name: "De'Aaron Fox", team: "SAC", position: "PG", jersey: 5, heightCm: 191, ppg: 26.6, rpg: 4.6, apg: 5.6, spg: 2.0, bpg: 0.4, fgPct: 46.5, tpPct: 36.9, ftPct: 73.8, gamesPlayed: 74 },
  { id: "sabonis", name: "Domantas Sabonis", team: "SAC", position: "C", jersey: 10, heightCm: 211, ppg: 19.4, rpg: 13.7, apg: 8.2, spg: 0.9, bpg: 0.6, fgPct: 59.4, tpPct: 37.9, ftPct: 70.4, gamesPlayed: 82 },
  { id: "haliburton", name: "Tyrese Haliburton", team: "IND", position: "PG", jersey: 0, heightCm: 196, ppg: 20.1, rpg: 3.9, apg: 10.9, spg: 1.2, bpg: 0.7, fgPct: 47.7, tpPct: 36.4, ftPct: 85.5, gamesPlayed: 69 },
  { id: "mitchell", name: "Donovan Mitchell", team: "CLE", position: "SG", jersey: 45, heightCm: 185, ppg: 26.6, rpg: 5.1, apg: 6.1, spg: 1.8, bpg: 0.5, fgPct: 46.2, tpPct: 36.8, ftPct: 86.6, gamesPlayed: 55 },
  { id: "wemby", name: "Victor Wembanyama", team: "SAS", position: "C", jersey: 1, heightCm: 224, ppg: 21.4, rpg: 10.6, apg: 3.9, spg: 1.2, bpg: 3.6, fgPct: 46.5, tpPct: 32.5, ftPct: 79.6, gamesPlayed: 71 },
  { id: "jbrown", name: "Jaylen Brown", team: "BOS", position: "SG", jersey: 7, heightCm: 198, ppg: 23.0, rpg: 5.5, apg: 3.6, spg: 1.2, bpg: 0.5, fgPct: 49.9, tpPct: 35.4, ftPct: 70.3, gamesPlayed: 70 },
  { id: "paolo", name: "Paolo Banchero", team: "ORL", position: "PF", jersey: 5, heightCm: 208, ppg: 22.6, rpg: 6.9, apg: 5.4, spg: 0.9, bpg: 0.6, fgPct: 45.5, tpPct: 33.9, ftPct: 72.5, gamesPlayed: 80 },
  { id: "trae", name: "Trae Young", team: "ATL", position: "PG", jersey: 11, heightCm: 185, ppg: 25.7, rpg: 2.8, apg: 10.8, spg: 1.3, bpg: 0.2, fgPct: 43.0, tpPct: 37.3, ftPct: 85.8, gamesPlayed: 54 },
  { id: "zion", name: "Zion Williamson", team: "NOP", position: "PF", jersey: 1, heightCm: 198, ppg: 22.9, rpg: 5.8, apg: 5.0, spg: 1.1, bpg: 0.7, fgPct: 57.0, tpPct: 33.3, ftPct: 70.5, gamesPlayed: 70 },
];

export const PLAYERS: NbaPlayer[] = RAW.map((p) => ({ ...p, teamName: teamName(p.team) }));

const byId = new Map(PLAYERS.map((p) => [p.id, p]));

export function playerById(id: string): NbaPlayer | undefined {
  return byId.get(id);
}

export type LeaderCategory = "ppg" | "rpg" | "apg" | "spg" | "bpg";

export function leaders(category: LeaderCategory, limit = 10): NbaPlayer[] {
  return [...PLAYERS].sort((a, b) => b[category] - a[category]).slice(0, limit);
}
