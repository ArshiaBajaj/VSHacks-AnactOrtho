/**
 * Client-side Film Coach helpers + offline fallbacks.
 * Mirrors apps/server filmCoach deterministic engines so the theater never blanks.
 */

import type { FilmEvent, FilmGameDetail } from "./api";

export type CoachMode = "rookie" | "scout" | "hype";

export interface FilmChapter {
  id: string;
  title: string;
  blurb: string;
  t: number;
  quarter: number;
}

export interface FilmQuiz {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explain: string;
}

export interface FilmMoment {
  title: string;
  what: string;
  why: string;
  watchNext: string;
}

export interface FilmRecap {
  star: string;
  takeaways: string[];
  drill: string;
  grade: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "ortho";
  text: string;
  source?: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

export function filmPayload(
  film: FilmGameDetail,
  extras: {
    mode: CoachMode;
    scoreA?: number;
    scoreB?: number;
    quarter?: number;
    clock?: string;
    lastEvent?: string;
  },
) {
  return {
    id: film.id,
    title: film.title,
    subtitle: film.subtitle,
    headline: film.headline,
    starLine: film.starLine,
    tags: film.tags,
    teamA: {
      tricode: film.teamA.tricode,
      name: film.teamA.name,
      final: film.teamA.final,
    },
    teamB: {
      tricode: film.teamB.tricode,
      name: film.teamB.name,
      final: film.teamB.final,
    },
    boxLeaders: film.boxLeaders,
    ...extras,
  };
}

export function localCoachLine(
  film: FilmGameDetail,
  mode: CoachMode,
  scoreA: number,
  scoreB: number,
  lastEvent?: string,
): string {
  const seed = hash(`${film.id}|${scoreA}|${scoreB}|${lastEvent}|${mode}`);
  const a = film.teamA.tricode;
  const b = film.teamB.tricode;
  const event = lastEvent || "the last make";
  const lead =
    scoreA === scoreB ? "tied" : scoreA > scoreB ? `${a} by ${scoreA - scoreB}` : `${b} by ${scoreB - scoreA}`;
  const intel = filmIntel(film.id, mode);
  const banks = {
    rookie: [
      `After ${event}: ${lead}. Watch the helper's first step.`,
      `${a} ${scoreA}–${scoreB} ${b}. Good shot = balance + space — check the feet.`,
      `${event}. Next: body on the catch before the shot.`,
      `${intel} Score is ${lead}.`,
    ],
    scout: [
      `${lead} after ${event}. Hunt the late closeout / help lag.`,
      `${a} ${scoreA}–${scoreB} ${b}. Coverage read: switch, drop, or hedge?`,
      `Film cue on ${event}: shoulder set before the release.`,
      `${intel} Live ${a} ${scoreA}–${scoreB} ${b}.`,
    ],
    hype: [
      `BANG — ${event}! ${lead} and the reel is tilting!`,
      `${a} ${scoreA}–${scoreB} ${b}! ${event} — KEEP IT ROLLING!`,
      `TAKEOVER beat: ${event}. Crowd noise meter broken!`,
      `${intel} ${lead}!`,
    ],
  };
  return pick(banks[mode], seed);
}

function filmIntel(id: string, mode: CoachMode): string {
  const table: Record<string, Record<CoachMode, string>> = {
    "embiid-70": {
      rookie: "Embiid seals deep, then rises — size + balance.",
      scout: "Punish drop coverage; seal Wemby and finish through contact.",
      hype: "SEVENTY-POINT ENERGY — Embiid is unguardable!",
    },
    "luka-73": {
      rookie: "Luka slows down, then attacks the closeout.",
      scout: "Step-back threes punish overhelping on the drive.",
      hype: "73-POINT TAKEOVER — Luka owns the night!",
    },
    "wemby-5x5": {
      rookie: "Wemby times the block — jump straight up, don't lean.",
      scout: "Verticality + steal lanes: elite two-way processing.",
      hype: "5×5 FREAK SHOW — every column filled!",
    },
    "finals-g5-2024": {
      rookie: "Championship closeouts: contest without fouling.",
      scout: "Boston's help chain and weak-side tags seal the series.",
      hype: "BANNER 18 — Celtics slam the door!",
    },
    "sga-thunder": {
      rookie: "SGA uses the mid-range when the paint packs in.",
      scout: "Pull-up midrange after the PnR — elite shot diet.",
      hype: "SGA ICE IN HIS VEINS — series even!",
    },
  };
  return (
    table[id]?.[mode] ??
    {
      rookie: "Watch balance before the shot.",
      scout: "Advantage creation beats raw athleticism.",
      hype: "THIS HIGHLIGHT IS COOKING!",
    }[mode]
  );
}

export function localAsk(film: FilmGameDetail, question: string, mode: CoachMode): string {
  const q = question.toLowerCase();
  const star = film.boxLeaders[0]?.name ?? film.starLine.split(":")[0]?.trim() ?? "the star";
  if (/why|good shot|open|contest/.test(q)) {
    return mode === "rookie"
      ? `A good shot is open or on-balance. Watch ${star}'s feet land under the body — that's why it dropped.`
      : `Shot quality = balance, contest distance, and advantage. ${star}'s early elevation shows up all over this tape.`;
  }
  if (/pick|pnr|screen|roll/.test(q)) {
    return `Pick-and-roll: screener sets an angle, ball handler reads the big. Watch switch / drop / hedge — then punish the gap.`;
  }
  if (/defense|stop|should/.test(q)) {
    return `Earlier help and a body on the catch. Late closeouts created the damage in ${film.title}.`;
  }
  if (/three|3\b|deep/.test(q)) {
    return `Threes stretch help. One extra swing pass and the closeout arrives late — that's the spacing lesson here.`;
  }
  if (/final|score|who won|winner/.test(q)) {
    return `Final: ${film.teamA.tricode} ${film.teamA.final}–${film.teamB.final} ${film.teamB.tricode}. ${film.headline}`;
  }
  if (/show|jump|seek|go to|chapter/.test(q)) {
    return `Use the Chapters tab to jump to Q1–Q4 beats, or scrub the Ortho bar. I can explain whatever you land on.`;
  }
  return mode === "hype"
    ? `${film.headline} ${star} owns this tape — ask about spacing, defense, or shot quality!`
    : `${film.headline} Focus on ${star}: ${film.starLine}. Ask about shot quality, PnR, or defensive fixes.`;
}

export function localMoment(
  film: FilmGameDetail,
  mode: CoachMode,
  lastEvent?: string,
): FilmMoment {
  const star = film.boxLeaders[0]?.name ?? "the star";
  if (mode === "rookie") {
    return {
      title: "Teachable moment",
      what: `${star} just scored — the defense was a step late.`,
      why: "Late help = open look. Early feet beat talent.",
      watchNext: "On the next trip, watch who helps first from the weak side.",
    };
  }
  if (mode === "hype") {
    return {
      title: "MOMENT ALERT",
      what: `${star} just ripped the reel open!`,
      why: "Momentum swings when you punish soft coverage.",
      watchNext: "Stay locked — the counterpunch is coming.",
    };
  }
  return {
    title: "Film break",
    what: lastEvent ?? `${star} creates an advantage.`,
    why: "Advantage creation + spacing beat raw athleticism on this possession.",
    watchNext: "Track the helper's first step and whether the ball finds the open man.",
  };
}

export function localQuiz(film: FilmGameDetail, scoreA: number, quarter: number): FilmQuiz {
  const seed = hash(`${film.id}|quiz|${scoreA}|${quarter}`);
  const star = film.boxLeaders[0]?.name ?? "the star";
  const quizzes: FilmQuiz[] = [
    {
      id: `q-${seed}-0`,
      question: `After this stretch, who is dictating pace?`,
      options: [star, film.teamB.name, "The referees", "Random variance"],
      correctIndex: 0,
      explain: `${star} owns the initiative — ${film.starLine}.`,
    },
    {
      id: `q-${seed}-1`,
      question: "Best defensive fix for the next possession?",
      options: [
        "Earlier help + body on the catch",
        "Ignore the ball handler",
        "Hack-a whoever",
        "Zone with no communication",
      ],
      correctIndex: 0,
      explain: "Late closeouts created this damage. Early feet and talk fix it.",
    },
    {
      id: `q-${seed}-2`,
      question: `Final score of ${film.title}?`,
      options: [
        `${film.teamA.final}–${film.teamB.final}`,
        `${film.teamA.final + 7}–${film.teamB.final - 3}`,
        `${film.teamB.final}–${film.teamA.final}`,
        "Went to OT 120–118",
      ],
      correctIndex: 0,
      explain: `${film.teamA.tricode} ${film.teamA.final}–${film.teamB.final} ${film.teamB.tricode}.`,
    },
    {
      id: `q-${seed}-3`,
      question: "What makes this a 'good shot' in film study?",
      options: [
        "Balance + space (or clear advantage)",
        "Any contested fadeaway",
        "Only dunks",
        "Whatever the crowd cheers",
      ],
      correctIndex: 0,
      explain: "Shot quality = balance, contest, and whether the advantage was real.",
    },
  ];
  return pick(quizzes, seed);
}

export function localChapters(film: FilmGameDetail): FilmChapter[] {
  const timeline = film.timeline;
  if (!timeline.length) {
    const GAME_MS = 48 * 60 * 1000;
    return [
      { id: "tip", title: "Tip-off energy", blurb: film.subtitle, t: 0, quarter: 1 },
      {
        id: "star",
        title: "Star takeover",
        blurb: film.starLine,
        t: Math.floor(0.45 * GAME_MS),
        quarter: 2,
      },
      {
        id: "close",
        title: "Closing stretch",
        blurb: film.headline,
        t: Math.floor(0.78 * GAME_MS),
        quarter: 4,
      },
    ];
  }

  const labels = ["Opening salvo", "Midgame chess", "Third-quarter push", "Closing statement"];
  const chapters: FilmChapter[] = [];
  for (let q = 1; q <= 4; q++) {
    const ev = timeline.filter((e) => e.quarter === q);
    if (!ev.length) continue;
    const mid = ev[Math.floor(ev.length / 2)];
    const end = ev[ev.length - 1];
    chapters.push({
      id: `q${q}`,
      title: `Q${q} · ${labels[q - 1]}`,
      blurb: `${film.teamA.tricode} ${end.scoreA}–${end.scoreB} ${film.teamB.tricode} · ${mid.text}`,
      t: ev[0].t,
      quarter: q,
    });
  }

  let best = { start: 0, pts: 0, team: "A" as "A" | "B" };
  for (let i = 0; i < timeline.length; i++) {
    const baseA = i > 0 ? timeline[i - 1].scoreA : 0;
    const baseB = i > 0 ? timeline[i - 1].scoreB : 0;
    for (let j = i; j < Math.min(timeline.length, i + 8); j++) {
      const dA = timeline[j].scoreA - baseA;
      const dB = timeline[j].scoreB - baseB;
      if (dA >= 8 && dA > best.pts) best = { start: timeline[i].t, pts: dA, team: "A" };
      if (dB >= 8 && dB > best.pts) best = { start: timeline[i].t, pts: dB, team: "B" };
    }
  }
  if (best.pts >= 8) {
    const name = best.team === "A" ? film.teamA.name : film.teamB.name;
    chapters.push({
      id: "run",
      title: `${name} ${best.pts}-0 surge`,
      blurb: "Momentum chapter — Ortho flags the scoring burst.",
      t: best.start,
      quarter: Math.min(4, Math.floor(best.start / (12 * 60_000)) + 1),
    });
  }

  chapters.sort((a, b) => a.t - b.t);
  const out: FilmChapter[] = [];
  for (const c of chapters) {
    if (out.some((x) => Math.abs(x.t - c.t) < 90_000)) continue;
    out.push(c);
  }
  return out.slice(0, 6);
}

export function localRecap(film: FilmGameDetail): FilmRecap {
  const star = film.boxLeaders[0]?.name ?? film.starLine.split(":")[0]?.trim() ?? "Film MVP";
  return {
    star,
    takeaways: [
      `${star} set the tone — ${film.starLine}.`,
      `Spacing + early advantage beats late help defense.`,
      `Finish possessions; sprint back — momentum is a choice.`,
    ],
    drill: "3-man weave → catch-and-shoot threes (make 8), then closeout + contest without fouling.",
    grade: film.tags.some((t) => /Championship|Career-high|70-point|Finals/i.test(t))
      ? "A+"
      : "A",
  };
}

/** Detect a scoring run of 8+ unanswered for teachable moments. */
export function detectRun(
  timeline: FilmEvent[],
  upToT: number,
): { team: "A" | "B"; pts: number; eventId: string } | null {
  const shown = timeline.filter((e) => e.t <= upToT);
  if (shown.length < 3) return null;
  let runTeam: "A" | "B" | null = null;
  let runPts = 0;
  let startId = shown[0].id;
  for (let i = 0; i < shown.length; i++) {
    const e = shown[i];
    if (!e.value) continue;
    if (runTeam === e.team) {
      runPts += e.value;
    } else {
      runTeam = e.team;
      runPts = e.value;
      startId = e.id;
    }
    if (runPts >= 8 && runTeam) {
      return { team: runTeam, pts: runPts, eventId: startId };
    }
  }
  return null;
}

export function momentumTip(
  film: FilmGameDetail,
  scoreA: number,
  scoreB: number,
  lastEvent?: string,
): string {
  const gap = scoreA - scoreB;
  if (Math.abs(gap) >= 12) {
    const lead = gap > 0 ? film.teamA.tricode : film.teamB.tricode;
    return `${lead} controlling tempo — watch for junk-time vs killer instinct.`;
  }
  if (Math.abs(gap) <= 3) {
    return `Knife-edge score. Every possession is a teaching rep.`;
  }
  return lastEvent ?? `Ortho tracking · ${film.starLine}`;
}
