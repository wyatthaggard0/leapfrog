import { PROMPTS, TIERS } from '../config/game.js';

// Words dropped on a second matching pass ("the Home Depot", "MS Excel").
const FILLER = new Set(['a', 'an', 'the', 'microsoft', 'ms']);

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const toKey = (s) => normalize(s).replace(/ /g, '');

// Keys to try for a player's answer, most literal first.
function candidateKeys(answer) {
  const words = normalize(answer).split(' ').filter(Boolean);
  const keys = [words.join('')];
  const trimmed = words.filter((w) => !FILLER.has(w));
  if (trimmed.length && trimmed.length !== words.length) keys.push(trimmed.join(''));
  for (const k of [...keys]) {
    if (k.length > 4 && k.endsWith('es')) keys.push(k.slice(0, -2));
    if (k.length > 3 && k.endsWith('s')) keys.push(k.slice(0, -1));
  }
  return [...new Set(keys)].filter(Boolean);
}

function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Per prompt: Map key -> { display, tier }, plus a display -> tier lookup.
let indexes = null;
export function buildIndexes() {
  return PROMPTS.map((prompt, i) => {
    const byKey = new Map();
    const tierOf = new Map();
    for (const [tier, entries] of Object.entries(prompt.tiers)) {
      for (const entry of entries) {
        const [display, ...aliases] = entry.split('|').map((s) => s.trim());
        tierOf.set(display, Number(tier));
        for (const name of [display, ...aliases]) {
          const key = toKey(name);
          if (!key) continue;
          const existing = byKey.get(key);
          if (existing && existing.display !== display) {
            throw new Error(`Prompt ${i + 1}: "${name}" is listed under both "${existing.display}" and "${display}"`);
          }
          byKey.set(key, { display, tier: Number(tier) });
        }
      }
    }
    return { byKey, tierOf };
  });
}
const getIndexes = () => (indexes ??= buildIndexes());

export function tierInfo(id) {
  return TIERS.find((t) => t.id === id) ?? TIERS[0];
}

export function tierOfDisplay(promptIndex, display) {
  return getIndexes()[promptIndex]?.tierOf.get(display) ?? 0;
}

function findMatch(promptIndex, answer) {
  const { byKey } = getIndexes()[promptIndex];
  const keys = candidateKeys(answer);
  for (const k of keys) {
    const hit = byKey.get(k);
    if (hit) return hit;
  }
  // Typos: 1 edit for 5+ letters, 2 edits for 9+. Ties go to the more common answer.
  let best = null;
  for (const k of keys) {
    if (k.length < 5) continue;
    const max = k.length >= 9 ? 2 : 1;
    for (const [key, hit] of byKey) {
      if (key.length < 4) continue;
      const d = levenshtein(k, key, max);
      if (d <= max && (!best || d < best.d || (d === best.d && hit.tier < best.hit.tier))) best = { d, hit };
    }
  }
  return best?.hit ?? null;
}

export function scoreAnswer(promptIndex, answer) {
  const raw = String(answer ?? '').trim().slice(0, 80);
  const hit = raw ? findMatch(promptIndex, raw) : null;
  const tier = tierInfo(hit?.tier ?? 0);
  return {
    answer: raw,
    matched: hit?.display ?? '',
    tier: tier.id,
    points: tier.points,
    miles: tier.miles,
  };
}

export function scoreAll(answers) {
  const results = PROMPTS.map((_, i) => scoreAnswer(i, answers?.[i]));
  return {
    results,
    score: results.reduce((s, r) => s + r.points, 0),
    miles: Math.round(results.reduce((s, r) => s + r.miles, 0) * 100) / 100,
  };
}
