import type { NbaTeam } from "../types.js";

/** Real NBA franchises (subset used by the film room + player feed). */
export const TEAMS: NbaTeam[] = [
  { tricode: "DAL", name: "Mavericks", city: "Dallas", conference: "West", primary: "#00538C", secondary: "#B8C4CA" },
  { tricode: "BOS", name: "Celtics", city: "Boston", conference: "East", primary: "#007A33", secondary: "#BA9653" },
  { tricode: "OKC", name: "Thunder", city: "Oklahoma City", conference: "West", primary: "#007AC1", secondary: "#EF3B24" },
  { tricode: "MIL", name: "Bucks", city: "Milwaukee", conference: "East", primary: "#00471B", secondary: "#EEE1C6" },
  { tricode: "PHI", name: "76ers", city: "Philadelphia", conference: "East", primary: "#006BB6", secondary: "#ED174C" },
  { tricode: "DEN", name: "Nuggets", city: "Denver", conference: "West", primary: "#0E2240", secondary: "#FEC524" },
  { tricode: "NYK", name: "Knicks", city: "New York", conference: "East", primary: "#006BB6", secondary: "#F58426" },
  { tricode: "PHX", name: "Suns", city: "Phoenix", conference: "West", primary: "#1D1160", secondary: "#E56020" },
  { tricode: "MIN", name: "Timberwolves", city: "Minnesota", conference: "West", primary: "#0C2340", secondary: "#236192" },
  { tricode: "GSW", name: "Warriors", city: "Golden State", conference: "West", primary: "#1D428A", secondary: "#FFC72C" },
  { tricode: "LAL", name: "Lakers", city: "Los Angeles", conference: "West", primary: "#552583", secondary: "#FDB927" },
  { tricode: "LAC", name: "Clippers", city: "Los Angeles", conference: "West", primary: "#C8102E", secondary: "#1D428A" },
  { tricode: "SAC", name: "Kings", city: "Sacramento", conference: "West", primary: "#5A2D81", secondary: "#63727A" },
  { tricode: "IND", name: "Pacers", city: "Indiana", conference: "East", primary: "#002D62", secondary: "#FDBB30" },
  { tricode: "CLE", name: "Cavaliers", city: "Cleveland", conference: "East", primary: "#860038", secondary: "#FDBB30" },
  { tricode: "SAS", name: "Spurs", city: "San Antonio", conference: "West", primary: "#C4CED4", secondary: "#000000" },
  { tricode: "ORL", name: "Magic", city: "Orlando", conference: "East", primary: "#0077C0", secondary: "#C4CED4" },
  { tricode: "ATL", name: "Hawks", city: "Atlanta", conference: "East", primary: "#E03A3E", secondary: "#26282A" },
  { tricode: "NOP", name: "Pelicans", city: "New Orleans", conference: "West", primary: "#0C2340", secondary: "#C8102E" },
];

const byTricode = new Map(TEAMS.map((t) => [t.tricode, t]));

export function teamColor(tricode: string): string {
  return byTricode.get(tricode)?.primary ?? "#64748b";
}

export function teamName(tricode: string): string {
  const t = byTricode.get(tricode);
  return t ? `${t.city} ${t.name}` : tricode;
}
