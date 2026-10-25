import { PROMPTS, TIERS } from '../config/game.js';
import { ANSWERS } from '../config/answers/index.js';

// Words that never form an answer on their own ("finance AND bis", "I'd say SQL").
const FILLER = new Set([
  'a', 'an', 'the', 'and', 'or', 'with', 'plus', 'i', 'id', 'im', 'would', 'say', 'maybe', 'probably', 'um',
  'like', 'my', 'is', 'its', 'of', 'in', 'for', 'at', 'as', 'to', 'be', 'bis', 'mis', 'major', 'double',
  'degree', 'microsoft', 'ms', 'function', 'language', 'tool', 'company',
]);
const MAX_WORDS = 8;

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

// Optimal string alignment distance: insert/delete/substitute/swap neighbours = 1 each.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1);
      row[j] = d;
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
    rows.push(row);
  }
  return rows[a.length][b.length];
}

// How many typos a guess of this length may contain.
const allowedTypos = (len) => (len >= 12 ? 3 : len >= 7 ? 2 : len >= 4 ? 1 : 0);

// Per prompt: Map key -> { display, tier }, display -> tier, and keys bucketed by length for fuzzy search.
let indexes = null;
export function buildIndexes() {
  return PROMPTS.map((prompt, i) => {
    const set = ANSWERS[prompt.slug];
    if (!set) throw new Error(`Missing config/answers/${prompt.slug}.json`);
    const byKey = new Map();
    const tierOf = new Map();
    for (const { name, aliases = [], tier } of set.answers) {
      tierOf.set(name, tier);
      for (const alias of [name, ...aliases]) {
        const key = toKey(alias);
        if (!key) continue;
        const existing = byKey.get(key);
        if (existing && existing.display !== name) {
          throw new Error(`Prompt ${i + 1}: "${alias}" is listed under both "${existing.display}" and "${name}"`);
        }
        byKey.set(key, { display: name, tier });
      }
    }
    const byLength = new Map();
    for (const [key, hit] of byKey) {
      if (!byLength.has(key.length)) byLength.set(key.length, []);
      byLength.get(key.length).push([key, hit]);
    }
    const reject = new Set((set.reject ?? []).map(toKey));
    return { byKey, tierOf, byLength, reject };
  });
}
const getIndexes = () => (indexes ??= buildIndexes());

export function tierInfo(id) {
  return TIERS.find((t) => t.id === id) ?? TIERS[0];
}

export function tierOfDisplay(promptIndex, display) {
  return getIndexes()[promptIndex]?.tierOf.get(display) ?? 0;
}

// Every contiguous run of words, longest first, skipping runs made only of filler.
function spans(words) {
  const out = [];
  const n = Math.min(words.length, MAX_WORDS);
  for (let len = n; len >= 1; len--) {
    for (let start = 0; start + len <= n; start++) {
      const run = words.slice(start, start + len);
      // The full guess is always tried, so "Microsoft" or Excel's AND still count.
      if (len < words.length && run.every((w) => FILLER.has(w))) continue;
      const trimmed = run.filter((w) => !FILLER.has(w));
      out.push({ key: run.join(''), len });
      if (trimmed.length !== run.length) out.push({ key: trimmed.join(''), len: trimmed.length });
    }
  }
  return out;
}

// "data analysts" -> "data analyst", "phishing attacks" -> "phishing attack".
function depluralize(key) {
  const out = [];
  if (key.length > 4 && key.endsWith('es')) out.push(key.slice(0, -2));
  if (key.length > 3 && key.endsWith('s')) out.push(key.slice(0, -1));
  return out;
}

function exactMatch(byKey, candidates) {
  for (const c of candidates) {
    for (const key of [c.key, ...depluralize(c.key)]) {
      const hit = byKey.get(key);
      if (hit) return hit;
    }
  }
  return null;
}

function fuzzyMatch(byLength, candidates) {
  let best = null;
  for (const c of candidates) {
    const max = allowedTypos(c.key.length);
    if (!max) continue;
    for (let len = c.key.length - max; len <= c.key.length + max; len++) {
      for (const [key, hit] of byLength.get(len) ?? []) {
        if (key.length < 4) continue;
        const d = editDistance(c.key, key, max);
        if (d > max || d * 3 > key.length) continue;
        // A different first letter is a weaker match; longer spans and fewer typos win.
        const score = d + (c.key[0] === key[0] ? 0 : 0.6) - c.len * 0.01;
        if (!best || score < best.score || (score === best.score && hit.tier < best.hit.tier)) best = { score, hit };
      }
    }
  }
  return best?.hit ?? null;
}

function findMatch(promptIndex, answer) {
  const { byKey, byLength, reject } = getIndexes()[promptIndex];
  const words = normalize(answer).split(' ').filter(Boolean);
  if (!words.length) return null;
  // Reject before searching so "information systems" can't fuzz into "Information Science".
  const candidates = spans(words);
  if (candidates.some((c) => reject.has(c.key) && c.len === words.filter((w) => !FILLER.has(w)).length)) return null;
  return exactMatch(byKey, candidates) ?? fuzzyMatch(byLength, candidates);
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
