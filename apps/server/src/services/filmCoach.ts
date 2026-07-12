/**
 * Film Room AI coach — OpenAI when available, deterministic engine otherwise.
 * Never throws; callers always get usable content for the theater UI.
 */

import { chat, llmEnabled } from "./ai.js";

export type CoachMode = "rookie" | "scout" | "hype";

export interface FilmContext {
  id: string;
  title: string;
  subtitle: string;
  headline: string;
  starLine: string;
  tags: string[];
  teamA: { tricode: string; name: string; final: number };
  teamB: { tricode: string; name: string; final: number };
  boxLeaders?: { name: string; team: "A" | "B"; line: string }[];
  scoreA?: number;
  scoreB?: number;
  quarter?: number;
  clock?: string;
  lastEvent?: string;
  mode?: CoachMode;
}

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

function modeVoice(mode: CoachMode): string {
  if (mode === "rookie")
    return "Youth coach for a 12-year-old. Teach ONE concrete watch cue (feet, spacing, help, balance).";
  if (mode === "hype")
    return "Broadcast hype — short, punchy, accurate to the live play. No empty slogans.";
  return "NBA film scout. Name the action (closeout, seal, PnR coverage, advantage).";
}

function lineSystem(mode: CoachMode): string {
  return (
    `You are Ortho, Anact's AI film coach. ${modeVoice(mode)} ` +
    "ONE color line only. React to LIVE last event + live score. Max 18 words. " +
    "No emojis. No generic advice like practice hard / teamwork. Include a concrete watch cue."
  );
}

function askSystem(mode: CoachMode): string {
  return (
    `You are Ortho inside a highlight replay. ${modeVoice(mode)} ` +
    "2-4 short sentences. Ground in THIS game and live Ortho moment. " +
    "Prefer film cues: feet, contest, help timing, spacing, seal, closeout. No emojis."
  );
}

function ctxLine(f: FilmContext): string {
  return [
    `Game: ${f.title} (${f.teamA.tricode} ${f.teamA.final}–${f.teamB.final} ${f.teamB.tricode}).`,
    f.headline,
    `Star line: ${f.starLine}.`,
    f.tags?.length ? `Tags: ${f.tags.join(", ")}.` : "",
    f.scoreA != null
      ? `Live Ortho score Q${f.quarter ?? "?"} ${f.clock ?? ""}: ${f.teamA.tricode} ${f.scoreA}–${f.scoreB} ${f.teamB.tricode}.`
      : "",
    f.lastEvent ? `Last event: ${f.lastEvent}.` : "",
    f.boxLeaders?.length
      ? `Box: ${f.boxLeaders.map((b) => `${b.name} ${b.line}`).join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
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

// --- Live color line -------------------------------------------------------

export function deterministicCoachLine(f: FilmContext): string {
  const mode = f.mode ?? "scout";
  const seed = hash(`${f.id}|${f.scoreA}|${f.scoreB}|${f.lastEvent}|${mode}`);
  const a = f.teamA.tricode;
  const b = f.teamB.tricode;
  const sa = f.scoreA ?? 0;
  const sb = f.scoreB ?? 0;
  const lead = sa === sb ? "tied" : sa > sb ? `${a} by ${sa - sb}` : `${b} by ${sb - sa}`;

  const rookie = [
    `Watch the spacing — ${lead} and the floor is opening up.`,
    `That score matters: ${a} ${sa}–${sb} ${b}. See how the defense reacts next.`,
    `Simple lesson: finish strong, then sprint back. ${lead} right now.`,
    `Eyes on the ball handler's feet — balance before the shot.`,
  ];
  const scout = [
    `${lead}. Look for the help rotation lag after that make.`,
    `Scoreboard pressure: ${a} ${sa}–${sb} ${b}. Next possession tells the story.`,
    `Tactical beat: attack the closeout — ${f.starLine.split("·")[0]?.trim() ?? "the star"} sets the tone.`,
    `Film cue: shoulder angle into the shot — that's the teachable rep.`,
  ];
  const hype = [
    `BANG — ${lead} and the building just tilted!`,
    `${a} ${sa}–${sb} ${b}! This highlight is heating up!`,
    `TAKEOVER ENERGY — ${f.starLine.split(":")[0] ?? "the star"} is cooking!`,
    `OH WHAT A SEQUENCE — keep the reel rolling!`,
  ];
  const bank = mode === "rookie" ? rookie : mode === "hype" ? hype : scout;
  return pick(bank, seed);
}

export async function generateCoachLine(
  f: FilmContext,
): Promise<{ text: string; source: "llm" | "engine" }> {
  const mode = f.mode ?? "scout";
  if (llmEnabled()) {
    const text = await chat(
      lineSystem(mode),
      `${ctxLine(f)}\nWrite the live color line now.`,
      55,
    );
    if (text) {
      const cleaned = text.replace(/^["']|["']$/g, "");
      const low = cleaned.toLowerCase();
      if (
        !["practice hard", "believe in yourself", "teamwork makes", "never give up"].some((b) =>
          low.includes(b),
        )
      ) {
        return { text: cleaned, source: "llm" };
      }
    }
  }
  return { text: deterministicCoachLine(f), source: "engine" };
}

// --- Ask Ortho -------------------------------------------------------------

export function deterministicAsk(f: FilmContext, question: string): string {
  const q = question.toLowerCase();
  const mode = f.mode ?? "scout";
  const star = f.boxLeaders?.[0]?.name ?? f.starLine.split(":")[0]?.trim() ?? "the star";

  if (/why|good shot|open|contest/.test(q)) {
    return mode === "rookie"
      ? `A good shot is open or on-balance. Here, watch ${star}'s feet land under the body — that's why it went in.`
      : `Evaluate the shot quality: catch-and-shoot vs off-dribble, contest distance, and foot set. ${star}'s reps in this film reward early elevation.`;
  }
  if (/pick|pnr|screen|roll/.test(q)) {
    return `Pick-and-roll: screener sets an angle, ball handler reads the big. Watch whether the defense switches, drops, or hedges — then punish the gap.`;
  }
  if (/defense|stop|should/.test(q)) {
    return `${f.teamB.name} needed earlier help and a body on the catch. Late closeouts create the open threes and paint seals you see in this reel.`;
  }
  if (/three|3\b|deep/.test(q)) {
    return `Threes stretch the floor. When the ball swings one extra pass, help can't recover — that's the spacing lesson in ${f.title}.`;
  }
  if (/final|score|who won|winner/.test(q)) {
    return `Final: ${f.teamA.tricode} ${f.teamA.final}–${f.teamB.final} ${f.teamB.tricode}. ${f.headline}`;
  }
  if (/embiid|luka|wemby|tatum|sga|brown|shai/.test(q) || /star|mvp/.test(q)) {
    return `${f.starLine}. ${f.subtitle}. Scrub to mid-reel scoring runs to see the takeover.`;
  }
  return mode === "hype"
    ? `${f.headline} ${star} owns this tape — ask me about spacing, defense, or shot quality!`
    : `${f.headline} Focus on ${star}: ${f.starLine}. Ask about shot quality, PnR reads, or what the defense should change.`;
}

export async function answerFilmQuestion(
  f: FilmContext,
  question: string,
): Promise<{ text: string; source: "llm" | "engine" }> {
  const mode = f.mode ?? "scout";
  const q = question.trim().slice(0, 400);
  if (!q) return { text: "Ask me anything about this film — shot quality, defense, or what to practice.", source: "engine" };

  if (llmEnabled()) {
    const text = await chat(
      askSystem(mode),
      `${ctxLine(f)}\n\nStudent question: ${q}`,
      220,
    );
    if (text) return { text, source: "llm" };
  }
  return { text: deterministicAsk(f, q), source: "engine" };
}

// --- Teachable moment ------------------------------------------------------

export function deterministicMoment(f: FilmContext): FilmMoment {
  const star = f.boxLeaders?.[0]?.name ?? "the star";
  const mode = f.mode ?? "scout";
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
    what: f.lastEvent ?? `${star} creates an advantage.`,
    why: "Advantage creation + spacing beat raw athleticism on this possession.",
    watchNext: "Track the helper's first step and whether the ball finds the open man.",
  };
}

export async function generateMoment(
  f: FilmContext,
): Promise<{ moment: FilmMoment; source: "llm" | "engine" }> {
  const mode = f.mode ?? "scout";
  if (llmEnabled()) {
    const text = await chat(
      `You are Ortho film coach. ${modeVoice(mode)} Reply ONLY as JSON: {"title":"...","what":"...","why":"...","watchNext":"..."} — each value one short sentence.`,
      ctxLine(f),
      180,
    );
    if (text) {
      try {
        const json = JSON.parse(text.replace(/```json|```/g, "").trim()) as FilmMoment;
        if (json.what && json.why && json.watchNext) {
          return {
            moment: {
              title: json.title || "Teachable moment",
              what: json.what,
              why: json.why,
              watchNext: json.watchNext,
            },
            source: "llm",
          };
        }
      } catch {
        /* fall through */
      }
    }
  }
  return { moment: deterministicMoment(f), source: "engine" };
}

// --- Quiz ------------------------------------------------------------------

export function deterministicQuiz(f: FilmContext): FilmQuiz {
  const seed = hash(`${f.id}|quiz|${f.scoreA}|${f.quarter}`);
  const star = f.boxLeaders?.[0]?.name ?? "the star";
  const quizzes: FilmQuiz[] = [
    {
      id: `q-${seed}-0`,
      question: `After this stretch, who is dictating pace?`,
      options: [star, f.teamB.name, "The referees", "Random variance"],
      correctIndex: 0,
      explain: `${star} owns the initiative — ${f.starLine}.`,
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
      question: `Final score of ${f.title}?`,
      options: [
        `${f.teamA.final}–${f.teamB.final}`,
        `${f.teamA.final + 7}–${f.teamB.final - 3}`,
        `${f.teamB.final}–${f.teamA.final}`,
        "Went to OT 120–118",
      ],
      correctIndex: 0,
      explain: `${f.teamA.tricode} ${f.teamA.final}–${f.teamB.final} ${f.teamB.tricode}. ${f.headline}`,
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

export async function generateQuiz(
  f: FilmContext,
): Promise<{ quiz: FilmQuiz; source: "llm" | "engine" }> {
  const mode = f.mode ?? "scout";
  if (llmEnabled()) {
    const text = await chat(
      `You are Ortho film coach writing a multiple-choice quiz. ${modeVoice(mode)} Reply ONLY JSON: {"question":"...","options":["a","b","c","d"],"correctIndex":0,"explain":"..."}`,
      ctxLine(f),
      220,
    );
    if (text) {
      try {
        const json = JSON.parse(text.replace(/```json|```/g, "").trim()) as Omit<FilmQuiz, "id">;
        if (json.question && Array.isArray(json.options) && json.options.length >= 2) {
          const correctIndex = Math.max(
            0,
            Math.min(json.options.length - 1, Number(json.correctIndex) || 0),
          );
          return {
            quiz: {
              id: `llm-${hash(json.question)}`,
              question: json.question,
              options: json.options.slice(0, 4).map(String),
              correctIndex,
              explain: json.explain || "Solid film IQ.",
            },
            source: "llm",
          };
        }
      } catch {
        /* fall through */
      }
    }
  }
  return { quiz: deterministicQuiz(f), source: "engine" };
}

// --- Chapters --------------------------------------------------------------

export function deterministicChapters(
  f: FilmContext,
  timeline: { t: number; quarter: number; text: string; scoreA: number; scoreB: number }[],
): FilmChapter[] {
  if (!timeline.length) {
    return [
      {
        id: "tip",
        title: "Tip-off energy",
        blurb: f.subtitle,
        t: 0,
        quarter: 1,
      },
      {
        id: "star",
        title: "Star takeover",
        blurb: f.starLine,
        t: Math.floor((f.teamA.final + f.teamB.final > 0 ? 0.45 : 0.5) * 48 * 60 * 1000),
        quarter: 2,
      },
      {
        id: "close",
        title: "Closing stretch",
        blurb: f.headline,
        t: Math.floor(0.78 * 48 * 60 * 1000),
        quarter: 4,
      },
    ];
  }

  const byQ = [1, 2, 3, 4].map((q) => timeline.filter((e) => e.quarter === q));
  const chapters: FilmChapter[] = [];
  const labels = ["Opening salvo", "Midgame chess", "Third-quarter push", "Closing statement"];

  for (let i = 0; i < 4; i++) {
    const ev = byQ[i];
    if (!ev.length) continue;
    const mid = ev[Math.floor(ev.length / 2)];
    const end = ev[ev.length - 1];
    chapters.push({
      id: `q${i + 1}`,
      title: `Q${i + 1} · ${labels[i]}`,
      blurb: `${f.teamA.tricode} ${end.scoreA}–${end.scoreB} ${f.teamB.tricode} · ${mid.text}`,
      t: ev[0].t,
      quarter: i + 1,
    });
  }

  // Peak run chapter — biggest single-team burst in a window
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
    const name = best.team === "A" ? f.teamA.name : f.teamB.name;
    chapters.push({
      id: "run",
      title: `${name} ${best.pts}-0 surge`,
      blurb: "Momentum chapter — Ortho flags the scoring burst.",
      t: best.start,
      quarter: Math.min(4, Math.floor(best.start / (12 * 60_000)) + 1),
    });
  }

  chapters.sort((a, b) => a.t - b.t);
  // de-dupe near-identical times
  const out: FilmChapter[] = [];
  for (const c of chapters) {
    if (out.some((x) => Math.abs(x.t - c.t) < 90_000)) continue;
    out.push(c);
  }
  return out.slice(0, 6);
}

export async function generateChapters(
  f: FilmContext,
  timeline: { t: number; quarter: number; text: string; scoreA: number; scoreB: number }[],
): Promise<{ chapters: FilmChapter[]; source: "llm" | "engine" }> {
  const base = deterministicChapters(f, timeline);
  if (llmEnabled() && base.length) {
    const text = await chat(
      `You rename film-study chapters. Reply ONLY JSON array of {"id","title","blurb"} matching the same ids. Titles max 6 words, blurbs max 14 words. Mode: ${(f.mode ?? "scout")}.`,
      `Game: ${f.title}. Chapters: ${JSON.stringify(base.map((c) => ({ id: c.id, title: c.title, blurb: c.blurb, t: c.t })))}`,
      280,
    );
    if (text) {
      try {
        const arr = JSON.parse(text.replace(/```json|```/g, "").trim()) as {
          id: string;
          title?: string;
          blurb?: string;
        }[];
        if (Array.isArray(arr)) {
          const map = new Map(arr.map((x) => [x.id, x]));
          return {
            chapters: base.map((c) => {
              const m = map.get(c.id);
              return {
                ...c,
                title: m?.title?.trim() || c.title,
                blurb: m?.blurb?.trim() || c.blurb,
              };
            }),
            source: "llm",
          };
        }
      } catch {
        /* fall through */
      }
    }
  }
  return { chapters: base, source: "engine" };
}

// --- Recap -----------------------------------------------------------------

export function deterministicRecap(f: FilmContext): FilmRecap {
  const star = f.boxLeaders?.[0]?.name ?? f.starLine.split(":")[0]?.trim() ?? "Film MVP";
  return {
    star,
    takeaways: [
      `${star} set the tone — ${f.starLine}.`,
      `Spacing + early advantage beats late help defense.`,
      `Finish possessions; sprint back — momentum is a choice.`,
    ],
    drill: "3-man weave → catch-and-shoot threes (make 8), then closeout + contest without fouling.",
    grade: f.tags.includes("Championship") || f.tags.includes("Career-high") ? "A+" : "A",
  };
}

export async function generateRecap(
  f: FilmContext,
): Promise<{ recap: FilmRecap; source: "llm" | "engine" }> {
  const mode = f.mode ?? "scout";
  if (llmEnabled()) {
    const text = await chat(
      `You are Ortho writing a post-film scouting card. ${modeVoice(mode)} Reply ONLY JSON: {"star":"...","takeaways":["...","...","..."],"drill":"...","grade":"A|A+|B+"}.`,
      ctxLine(f),
      260,
    );
    if (text) {
      try {
        const json = JSON.parse(text.replace(/```json|```/g, "").trim()) as FilmRecap;
        if (json.star && Array.isArray(json.takeaways) && json.drill) {
          return {
            recap: {
              star: String(json.star),
              takeaways: json.takeaways.map(String).slice(0, 3),
              drill: String(json.drill),
              grade: String(json.grade || "A"),
            },
            source: "llm",
          };
        }
      } catch {
        /* fall through */
      }
    }
  }
  return { recap: deterministicRecap(f), source: "engine" };
}
