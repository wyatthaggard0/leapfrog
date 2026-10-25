// Room-wide stats for the results screen, cached briefly to stay under Sheets quotas.
import { PROMPTS } from '../config/game.js';
import { listResponses } from './store.js';
import { tierOfDisplay } from './scoring.js';

const TTL_MS = 10_000;
let cache = null; // { at, rows }

const personKey = (r) => `${r.first}|${r.last}|${r.section}`.toLowerCase();

async function rows() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  cache = { at: Date.now(), rows: await listResponses() };
  return cache.rows;
}

// Lets a fresh submission show up in stats without re-reading the sheet.
export function rememberRow(record) {
  if (cache) cache.rows = [...cache.rows, record];
}

export function computeStats(allRows) {
  // One entry per student: their first finished game.
  const seen = new Set();
  const players = allRows.filter((r) => {
    const k = personKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const prompts = PROMPTS.map((_, i) => {
    const counts = {};
    for (const r of players) {
      const m = r.matched?.[i];
      if (m) counts[m] = (counts[m] || 0) + 1;
    }
    const entries = Object.entries(counts).map(([display, count]) => ({
      display,
      count,
      tier: tierOfDisplay(i, display),
    }));
    const top = [...entries].sort((a, b) => b.count - a.count || a.tier - b.tier)[0] ?? null;
    const rarest = [...entries].sort((a, b) => b.tier - a.tier || a.count - b.count)[0] ?? null;
    return { counts, top, rarest };
  });

  return {
    n: players.length,
    scores: players.map((r) => r.score).sort((a, b) => a - b),
    prompts,
  };
}

export async function getStats() {
  return computeStats(await rows());
}
