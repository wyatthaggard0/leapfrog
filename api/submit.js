import { PROMPTS } from '../config/game.js';
import { readBody, send, allow } from '../lib/http.js';
import { scoreAll } from '../lib/scoring.js';
import { appendResponse } from '../lib/store.js';
import { getStats, rememberRow } from '../lib/stats.js';

// "smith" / "SMITH" -> "Smith"; mixed case like "McDonald" is kept as typed.
export function cleanName(s) {
  const name = String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
}

// "2026-10-25 14:03:22" in the event's timezone; sorts correctly as text.
function timestamp() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: process.env.TIMEZONE || 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

// Records the check-in. Scores are recomputed here so the client can't inflate them.
export default async function handler(req, res) {
  if (!allow(req, res, 'POST')) return;
  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 400, { error: 'Bad request' });
  }

  const first = cleanName(body.first);
  const last = cleanName(body.last);
  if (!first || !last) return send(res, 400, { error: 'First and last name are required' });

  const answers = PROMPTS.map((_, i) => String(body.answers?.[i] ?? '').trim().slice(0, 80));
  const { results, score, miles } = scoreAll(answers);
  const record = {
    ts: timestamp(),
    last,
    first,
    score,
    answers,
    matched: results.map((r) => r.matched),
    points: results.map((r) => r.points),
  };

  try {
    await appendResponse(record);
  } catch (err) {
    console.error(err);
    return send(res, 503, { error: 'Could not save your check-in. Retrying…' });
  }
  rememberRow(record);

  let stats = null;
  try {
    stats = await getStats();
  } catch (err) {
    console.error(err);
  }
  send(res, 200, { player: { first, last }, score, miles, results, stats });
}
