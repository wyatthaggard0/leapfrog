// Load test: sends fake finished games to a running server.
// Run: npm run simulate -- [count] [baseUrl]    e.g. npm run simulate -- 100 http://localhost:3000
// Writes real rows, so point it at a test sheet (or local mode) and clear them afterwards.
import { PROMPTS, SECTIONS } from '../config/game.js';

const count = Number(process.argv[2]) || 50;
const base = process.argv[3] || `http://localhost:${process.env.PORT || 3000}`;
const FIRST = ['Ava', 'Liam', 'Mia', 'Noah', 'Zoe', 'Eli', 'Ivy', 'Leo', 'Ana', 'Max', 'Sam', 'Kai'];
const LAST = ['Smith', 'Garcia', 'Nguyen', 'Patel', 'Brown', 'Lee', 'Lopez', 'Kim', 'Davis', 'Moore'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Mostly common answers, sometimes rare ones, sometimes junk.
function answerFor(prompt) {
  if (Math.random() < 0.08) return 'idk';
  const tier = Math.random() < 0.55 ? 1 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 6);
  return pick(prompt.tiers[tier]).split('|')[0];
}

const started = Date.now();
const results = await Promise.allSettled(
  Array.from({ length: count }, async (_, n) => {
    await new Promise((r) => setTimeout(r, Math.random() * 3000));
    const res = await fetch(`${base}/api/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        first: pick(FIRST),
        last: `${pick(LAST)}${n}`,
        section: pick(SECTIONS),
        answers: PROMPTS.map(answerFor),
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }),
);

const ok = results.filter((r) => r.status === 'fulfilled');
const failed = results.filter((r) => r.status === 'rejected');
console.log(`${ok.length}/${count} saved in ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (failed.length) console.log('First failure:', failed[0].reason.message);
if (ok.length) {
  const last = ok.at(-1).value;
  console.log(`Room now has ${last.stats?.n} players; sample score ${last.score}`);
}
