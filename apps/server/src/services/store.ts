import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScoutCard } from "../types.js";

/**
 * Scout-card store. In-memory for speed, transparently persisted to a JSON file
 * so published cards survive restarts. Deliberately dependency-free (no DB) so
 * the backend runs anywhere with zero setup — swap for SQLite/Postgres later.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../.data");
const FILE = path.join(DATA_DIR, "scout-cards.json");

const cards = new Map<string, ScoutCard>();
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  if (existsSync(FILE)) {
    try {
      const raw = await readFile(FILE, "utf8");
      const arr = JSON.parse(raw) as ScoutCard[];
      for (const c of arr) cards.set(c.id, c);
    } catch {
      /* start fresh on parse error */
    }
  }
}

async function persist(): Promise<void> {
  try {
    if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
    await writeFile(FILE, JSON.stringify([...cards.values()], null, 2), "utf8");
  } catch {
    /* non-fatal: still works in-memory */
  }
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

export async function saveCard(card: Omit<ScoutCard, "id" | "createdAt">): Promise<ScoutCard> {
  await ensureLoaded();
  const full: ScoutCard = { ...card, id: shortId(), createdAt: Date.now() };
  cards.set(full.id, full);
  void persist();
  return full;
}

export async function getCard(id: string): Promise<ScoutCard | undefined> {
  await ensureLoaded();
  return cards.get(id);
}

export async function listCards(): Promise<ScoutCard[]> {
  await ensureLoaded();
  return [...cards.values()].sort((a, b) => b.createdAt - a.createdAt);
}
