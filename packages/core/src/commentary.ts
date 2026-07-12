import type { CommentaryStyle, TeamId } from "./types";

/**
 * Commentary phrase engine. Pure data + one dispatcher — no I/O. Runs on
 * every platform. The caller (mobile / web) is responsible for feeding output
 * into TTS.
 */

type Ctx = {
  team: TeamId;
  scoreA: number;
  scoreB: number;
  points?: number;
  streak?: number;
  jumpCm?: number;
  releaseMps?: number;
};

const PLAYGROUND = {
  score2: [
    "And-1! Team {T} bucket, {A}–{B}.",
    "Wet! Team {T} cashes two. {A}–{B}.",
    "Off the glass, count it! {A}–{B}.",
  ],
  score3: [
    "From downtown! Team {T} drills the three, {A}–{B}.",
    "Deep three for Team {T}, they don't miss out here.",
    "Cold-blooded three ball! {A}–{B}.",
  ],
  streak: [
    "Team {T} on a heater — {N} straight!",
    "That's {N} in a row for Team {T}. Somebody call timeout.",
  ],
  outOfBounds: [
    "That's out on Team {T}, no good.",
    "Off the fingertips, ball goes the other way.",
    "Whistle up — out of bounds on Team {T}.",
  ],
  jump: [
    "{N}cm off the floor — get this man a highlight reel.",
    "{N} centimeters vertical! Absurd.",
  ],
  release: [
    "Release velocity {V} meters per second — pure snap.",
    "Elite release: {V} m/s off the fingertips.",
  ],
  intro: [
    "Alright park, we're live. First bucket wins the possession.",
    "Anact Ortho's rolling. Let's hoop.",
  ],
};

const BROADCAST = {
  score2: [
    "Team {T} converts. Score, {A} to {B}.",
    "Two-point field goal for Team {T}. {A}–{B}.",
  ],
  score3: [
    "Three-point field goal, Team {T}. {A}–{B}.",
    "That's a three. Team {T} extends to {S}.",
  ],
  streak: [
    "Team {T} scores {N} consecutive possessions.",
    "Momentum shift — Team {T} on a {N}-point run.",
  ],
  outOfBounds: [
    "Ball out on Team {T}. Possession reverses.",
    "Officiating layer marks that out of bounds.",
  ],
  jump: [
    "Vertical measurement recorded at {N} centimeters.",
    "Player vertical: {N} centimeters.",
  ],
  release: [
    "Shot release velocity: {V} meters per second.",
    "Kinematic release logged at {V} m/s.",
  ],
  intro: [
    "Anact Ortho is calibrated. Game is live.",
    "Officiating and analytics engaged. Tip-off.",
  ],
};

const HYPE = {
  score2: [
    "YESSS! Team {T} with the bucket! {A}–{B}!",
    "COUNT IT! Team {T} up to {S}!",
  ],
  score3: [
    "BANG! Team {T} drops the three!",
    "SPLASH CITY! Team {T} up to {S}!",
  ],
  streak: [
    "THIS IS A TAKEOVER! {N} STRAIGHT FOR TEAM {T}!",
    "TEAM {T} IS UNCONSCIOUS! {N} IN A ROW!",
  ],
  outOfBounds: [
    "OFF! Ball goes the other way, Team {T}!",
    "OUT! Fresh possession!",
  ],
  jump: [
    "{N}CM! HE FLEW!",
    "OFF THE PLANET — {N}CM VERTICAL!",
  ],
  release: [
    "{V} M/S OFF THE WRIST!",
    "SNAP RELEASE — {V} METERS PER SECOND!",
  ],
  intro: [
    "We are LIVE from the park. Let's ride!",
    "Anact Ortho engaged — showtime!",
  ],
};

type Bank = typeof PLAYGROUND;

function bank(style: CommentaryStyle): Bank {
  if (style === "broadcast") return BROADCAST as Bank;
  if (style === "hype") return HYPE as Bank;
  return PLAYGROUND;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function fill(tpl: string, c: Ctx & { N?: number; V?: number; S?: number }): string {
  return tpl
    .replaceAll("{T}", c.team)
    .replaceAll("{A}", String(c.scoreA))
    .replaceAll("{B}", String(c.scoreB))
    .replaceAll("{N}", String(c.N ?? c.streak ?? Math.round(c.jumpCm ?? 0)))
    .replaceAll("{V}", (c.V ?? c.releaseMps ?? 0).toFixed(1))
    .replaceAll("{S}", String(c.team === "A" ? c.scoreA : c.scoreB));
}

export function scoreLine(style: CommentaryStyle, c: Ctx): string {
  const b = bank(style);
  return fill(pick(c.points === 3 ? b.score3 : b.score2), c);
}
export function streakLine(style: CommentaryStyle, c: Ctx & { streak: number }): string {
  return fill(pick(bank(style).streak), c);
}
export function outLine(style: CommentaryStyle, c: Ctx): string {
  return fill(pick(bank(style).outOfBounds), c);
}
export function jumpLine(style: CommentaryStyle, c: Ctx & { jumpCm: number }): string {
  return fill(pick(bank(style).jump), c);
}
export function releaseLine(style: CommentaryStyle, c: Ctx & { releaseMps: number }): string {
  return fill(pick(bank(style).release), c);
}
export function introLine(style: CommentaryStyle): string {
  return pick(bank(style).intro);
}
