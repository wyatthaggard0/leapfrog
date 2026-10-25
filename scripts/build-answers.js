// Builds config/answers/*.json from the aggregated source lists in data/sources/.
//
// Rarity, Krillion-style:
//   - answers with a pinned "tier" keep it (manual pass: what students actually type first)
//   - answers with a Wikipedia title are ranked by 60 days of pageviews (familiarity signal) into tiers 3-6
//   - everything else must be pinned in the source file
// Pageviews are cached in data/cache/pageviews.json; delete it to refresh.
//
// Run: npm run build-answers
import fs from 'node:fs';
import path from 'node:path';
import { PROMPTS } from '../config/game.js';

const SOURCES = 'data/sources';
const OUT = 'config/answers';
const CACHE = 'data/cache/pageviews.json';
const UA = { 'user-agent': 'bis-leapfrog-answer-builder/1.0 (TCU BIS class event; educational)' };

// Tiers 1-2 come only from pins (what students actually type first); Wikipedia fame
// alone shouldn't make "Stuxnet" a common answer. Pageview-ranked answers fill tiers 3-6:
// top 12% tier 3, next 28% tier 4, next 30% tier 5, rest tier 6.
const TIER_CUTOFFS = [0.12, 0.4, 0.7, 1];
const FIRST_RANKED_TIER = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
    .replace(/\+/g, 'plus').replace(/#/g, 'sharp').replace(/[^a-z0-9]+/g, '');

async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (attempt >= 8) throw new Error(`${res.status} ${url}`);
    const retryAfter = Number(res.headers.get('retry-after')) * 1000;
    await sleep(retryAfter || Math.min(30000, 1000 * 2 ** attempt));
  }
}

// Wikipedia title -> pageviews over the last 60 days, following redirects.
// Each MediaWiki query covers 50 titles; 3 batches run at once. Cached as it goes.
async function titleViews(titles, cache) {
  const todo = titles.filter((t) => !(t in cache.views));
  const batches = [];
  for (let i = 0; i < todo.length; i += 50) batches.push(todo.slice(i, i + 50));
  let done = 0;
  const worker = async () => {
    while (batches.length) await fetchBatch(batches.shift());
  };
  async function fetchBatch(batch) {
    const base =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1' +
      `&prop=pageviews&pvipdays=60&titles=${encodeURIComponent(batch.join('|'))}`;
    const step = new Map();
    const views = new Map();
    // The API returns pageviews for a few pages at a time; follow "continue" until done.
    let cont = '';
    for (let page = 0; page < 30; page++) {
      const data = await getJson(base + cont);
      for (const n of data?.query?.normalized ?? []) step.set(n.from, n.to);
      for (const r of data?.query?.redirects ?? []) step.set(r.from, r.to);
      for (const pg of data?.query?.pages ?? []) {
        const sum = Object.values(pg.pageviews ?? {}).reduce((s, v) => s + (v || 0), 0);
        views.set(pg.title, Math.max(views.get(pg.title) ?? 0, sum));
      }
      if (!data?.continue) break;
      cont = Object.entries(data.continue).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
      await sleep(200);
    }
    for (const t of batch) {
      let c = t;
      for (let hops = 0; step.has(c) && hops < 3; hops++) c = step.get(c);
      cache.views[t] = views.get(c) ?? 0;
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    done += batch.length;
    process.stdout.write(`  ${done}/${todo.length} titles\n`);
  }
  await Promise.all(Array.from({ length: 3 }, worker));
}

const loaded = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const cache = { views: loaded.views ?? {} };
const OVERRIDES_FILE = path.join(SOURCES, 'overrides.json');
const overrides = fs.existsSync(OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) : {};
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(CACHE), { recursive: true });

for (const prompt of PROMPTS) {
  const file = path.join(SOURCES, `${prompt.slug}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`! ${file} missing, skipping`);
    continue;
  }
  const source = JSON.parse(fs.readFileSync(file, 'utf8'));
  const answers = source.answers.map((a) => ({ ...a, aliases: [...new Set(a.aliases ?? [])] }));

  // Merge exact duplicate names that slipped through.
  const byName = new Map();
  for (const a of answers) {
    const k = key(a.name);
    const prev = byName.get(k);
    if (!prev) byName.set(k, a);
    else {
      prev.aliases = [...new Set([...prev.aliases, ...a.aliases])];
      prev.tier ??= a.tier;
      prev.wiki ??= a.wiki;
    }
  }
  const merged = [...byName.values()];

  // Manual overrides (fun-factor deep cuts, pageview oddities, extra spellings) beat everything.
  const find = (name) => byName.get(key(name)) ?? merged.find((a) => a.aliases.some((al) => key(al) === key(name)));
  for (const [name, tier] of Object.entries(overrides.tiers?.[prompt.slug] ?? {})) {
    const target = find(name);
    if (target) target.tier = tier;
    else console.warn(`! tier override "${name}" not found in ${prompt.slug}`);
  }
  for (const [name, extra] of Object.entries(overrides.aliases?.[prompt.slug] ?? {})) {
    const target = find(name);
    if (target) target.aliases = [...new Set([...target.aliases, ...extra])];
    else console.warn(`! alias override "${name}" not found in ${prompt.slug}`);
  }

  const wikiTitles = [...new Set(merged.filter((a) => a.tier == null && a.wiki).map((a) => a.wiki))];
  await titleViews(wikiTitles, cache);

  const ranked = merged
    .filter((a) => a.tier == null)
    .map((a) => {
      return { a, views: a.wiki ? cache.views[a.wiki] ?? 0 : 0 };
    })
    .sort((x, y) => y.views - x.views);
  ranked.forEach(({ a, views }, i) => {
    const share = (i + 0.5) / ranked.length;
    a.tier = views === 0 ? 6 : FIRST_RANKED_TIER + TIER_CUTOFFS.findIndex((c) => share <= c);
    a.views = views;
  });

  // Drop aliases that collide with a different answer instead of failing the build.
  const owner = new Map();
  for (const a of merged) owner.set(key(a.name), a.name);
  let dropped = 0;
  for (const a of merged) {
    a.aliases = a.aliases.filter((al) => {
      const k = key(al);
      if (!k || k === key(a.name)) return false;
      if (owner.has(k) && owner.get(k) !== a.name) {
        dropped++;
        return false;
      }
      owner.set(k, a.name);
      return true;
    });
  }

  const out = {
    prompt: prompt.text,
    generated: new Date().toISOString().slice(0, 10),
    sources: source.sources ?? [],
    reject: overrides.reject?.[prompt.slug] ?? [],
    answers: merged
      .map(({ name, aliases, tier, views }) => ({ name, aliases, tier, ...(views !== undefined ? { views } : {}) }))
      .sort((x, y) => x.tier - y.tier || x.name.localeCompare(y.name)),
  };
  fs.writeFileSync(path.join(OUT, `${prompt.slug}.json`), JSON.stringify(out, null, 1));
  const counts = [1, 2, 3, 4, 5, 6].map((t) => out.answers.filter((a) => a.tier === t).length);
  console.log(`${prompt.slug}: ${out.answers.length} answers · tiers ${counts.join('/')}${dropped ? ` · ${dropped} colliding aliases dropped` : ''}`);
}

// Static imports so Vercel bundles the JSON with the functions.
const slugs = PROMPTS.map((p) => p.slug).filter((s) => fs.existsSync(path.join(OUT, `${s}.json`)));
const ident = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
fs.writeFileSync(
  path.join(OUT, 'index.js'),
  `// Generated by scripts/build-answers.js. Do not edit by hand.\n` +
    slugs.map((s) => `import ${ident(s)} from './${s}.json' with { type: 'json' };`).join('\n') +
    `\n\nexport const ANSWERS = {\n${slugs.map((s) => `  '${s}': ${ident(s)},`).join('\n')}\n};\n`,
);
console.log(`Wrote ${OUT}/index.js`);
