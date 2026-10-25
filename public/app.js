import { World } from './world.js';
import { sfx, isMuted, setMuted } from './audio.js';

const $ = (s) => document.querySelector(s);
const world = new World($('#world'));

let cfg = null;
let KEY = {};
const state = { player: null, i: 0, answers: [], results: [] };
let run = 0; // bumps each prompt so stale timers bail out
let statsTimer = null;

// ---------- small utils ----------
function save(key, value) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

async function api(path, body) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`/api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (screen) => (document.body.dataset.screen = screen);
const tierOf = (id) => cfg.tiers.find((t) => t.id === id) ?? cfg.tiers[0];

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmtDist(mi) {
  if (mi < 1) return `${Math.round(mi * 1760)} yd`;
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi).toLocaleString()} mi`;
}

const totalMiles = (results) => results.reduce((s, r) => s + (r?.miles || 0), 0);
const totalScore = (results) => results.reduce((s, r) => s + (r?.points || 0), 0);

function biomeFor(mi) {
  return cfg.biomes.filter((b) => mi >= b.from).at(-1).id;
}

function milestoneFor(mi) {
  const past = cfg.milestones.filter((m) => mi >= m.miles).at(-1);
  const next = cfg.milestones.find((m) => m.miles > mi) ?? null;
  return { past, next };
}

// ---------- boot ----------
async function init() {
  try {
    cfg = await api('config');
  } catch {
    $('#screen-loading .pill').textContent = 'could not reach the server · refresh to try again';
    return;
  }
  const id = cfg.event.id;
  KEY = {
    progress: `leapfrog:${id}:progress`,
    result: `leapfrog:${id}:result`,
    pending: `leapfrog:${id}:pending`,
    player: 'leapfrog:player',
  };

  $('#event-name').textContent = cfg.event.name;
  $('#event-tagline').textContent = cfg.event.tagline;
  $('#hud-blocks').append(...cfg.prompts.map(() => document.createElement('i')));
  $('#timer-ring').style.strokeDasharray = String(2 * Math.PI * 19);

  const result = load(KEY.result);
  if (result) return showResults(result);
  const pending = load(KEY.pending);
  if (pending) return submit(pending);

  const progress = load(KEY.progress);
  if (progress?.player && progress.i > 0) $('#begin').textContent = `▶ Resume · prompt ${progress.i + 1} ◀`;
  show('title');
}

// ---------- title & check-in ----------
$('#begin').addEventListener('click', () => {
  setMuted(isMuted()); // unlocks audio on the first tap if sound is on
  const progress = load(KEY.progress);
  if (progress?.player) {
    Object.assign(state, progress);
    world.setBiome(biomeFor(totalMiles(state.results)));
    return startPrompt();
  }
  const form = $('#checkin');
  const saved = load(KEY.player);
  if (saved) {
    form.first.value = saved.first || '';
    form.last.value = saved.last || '';
  }
  show('checkin');
  form.first.focus();
});

$('#checkin').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const player = {
    first: form.first.value.trim(),
    last: form.last.value.trim(),
  };
  const error = !player.first ? 'Enter your first name.' : !player.last ? 'Enter your last name.' : '';
  $('#checkin-error').textContent = error;
  if (error) return;
  save(KEY.player, player);
  Object.assign(state, { player, i: 0, answers: [], results: [] });
  saveProgress();
  startPrompt();
});

function saveProgress() {
  save(KEY.progress, { player: state.player, i: state.i, answers: state.answers, results: state.results });
}

// ---------- HUD ----------
function updateHud() {
  $('#hud-distance').textContent = fmtDist(totalMiles(state.results));
  $('#hud-score').textContent = totalScore(state.results);
  $('#hud-step').textContent = `Prompt ${Math.min(state.i + 1, cfg.prompts.length)} of ${cfg.prompts.length}`;
  [...$('#hud-blocks').children].forEach((b, k) => {
    const r = state.results[k];
    b.className = r ? 'done' : k === state.i ? 'current' : '';
    b.style.setProperty('--c', r ? tierOf(r.tier).color : '');
  });
}

// ---------- play ----------
const playScreen = $('#screen-play');
const input = $('#answer');
let locked = false;

function startPrompt() {
  const myRun = ++run;
  const i = state.i;
  locked = false;
  show('play');
  updateHud();
  playScreen.classList.remove('live');
  $('#prompt-step').textContent = `Prompt ${i + 1} of ${cfg.prompts.length}`;
  $('#prompt-text').textContent = cfg.prompts[i].text;
  input.value = '';

  let n = cfg.settings.countdownSeconds;
  const countEl = $('#countdown b');
  countEl.textContent = n;
  const step = () => {
    if (myRun !== run) return;
    if (n <= 0) return startClock(myRun);
    countEl.textContent = n--;
    setTimeout(step, 1000);
  };
  step();
}

function startClock(myRun) {
  playScreen.classList.add('live');
  input.focus();
  const total = cfg.settings.secondsPerPrompt * 1000;
  const start = performance.now();
  const ring = $('#timer-ring');
  const circ = 2 * Math.PI * 19;
  let lastSec = null;
  const frame = (now) => {
    if (myRun !== run || locked) return;
    const left = Math.max(0, total - (now - start));
    const sec = Math.ceil(left / 1000);
    $('#timer-text').textContent = sec;
    ring.style.strokeDashoffset = String(circ * (1 - left / total));
    $('#time-bar-fill').style.width = `${(left / total) * 100}%`;
    $('#timer').classList.toggle('urgent', left < 5000);
    if (sec !== lastSec && sec <= 5 && sec > 0) sfx.tick();
    lastSec = sec;
    if (left <= 0) return lockIn();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

$('#answer-form').addEventListener('submit', (e) => {
  e.preventDefault();
  lockIn();
});

async function lockIn() {
  if (locked) return;
  locked = true;
  const i = state.i;
  const answer = input.value.trim();
  input.blur();
  state.answers[i] = answer;

  let result;
  try {
    result = await api('score', { i, answer });
  } catch {
    // Scored for real on submit; keep the game moving.
    result = { answer, matched: '', tier: 0, points: 0, miles: 0, offline: true };
  }
  state.results[i] = result;
  saveProgress();

  const reveal = $('#screen-reveal');
  reveal.classList.remove('shown');
  show('reveal');
  sfx.leap(result.tier);
  const miles = totalMiles(state.results);
  await world.leap(result.tier, { onApex: () => world.setBiome(biomeFor(miles)) });
  if (result.tier === 0) sfx.splash();
  else sfx.land();
  sfx.tier(result.tier);

  const tier = tierOf(result.tier);
  const box = $('#reveal');
  box.style.setProperty('--c', tier.color);
  $('#reveal-tier').textContent = tier.name;
  $('#reveal-answer').textContent = answer ? `“${result.matched || answer}”` : 'Out of time';
  $('#reveal-points').innerHTML = '';
  $('#reveal-points').append(`+${tier.points} PTS`, el('b', '', ` · leap ${fmtDist(tier.miles)}`));
  $('#reveal-flavor').textContent = result.offline ? 'Connection hiccup. We will score this one at the end.' : tier.flavor;
  const last = i === cfg.prompts.length - 1;
  $('#next').textContent = last ? 'Finish ▶' : 'Leap ▶';
  updateHud();
  reveal.classList.add('shown');
  $('#next').focus();
}

$('#next').addEventListener('click', () => {
  if (!$('#screen-reveal').classList.contains('shown')) return;
  state.i++;
  saveProgress();
  if (state.i >= cfg.prompts.length) submit({ ...state.player, answers: state.answers });
  else startPrompt();
});

// ---------- submit (retries until it lands) ----------
async function submit(payload) {
  save(KEY.pending, payload);
  show('saving');
  const status = $('#saving-status');
  for (let attempt = 1; ; attempt++) {
    try {
      const data = await api('submit', payload);
      save(KEY.result, data);
      save(KEY.pending);
      save(KEY.progress);
      return showResults(data);
    } catch (err) {
      if (err.status === 400) {
        status.textContent = `${err.message}. Refresh and check in again.`;
        save(KEY.pending);
        save(KEY.progress);
        return;
      }
      status.textContent = `Connection hiccup · retrying (try ${attempt})… keep this page open.`;
      await sleep(Math.min(15000, 1500 * attempt));
    }
  }
}

// ---------- results ----------
function showResults(data) {
  show('results');
  world.setBiome(biomeFor(data.miles));
  const { first, last } = data.player;
  $('#checked-in').textContent = `✓ Checked in · ${first} ${last}`;
  $('#final-score').textContent = data.score;
  $('#final-distance').textContent = fmtDist(data.miles);

  const { past, next } = milestoneFor(data.miles);
  const landed = $('#landed');
  landed.innerHTML = '';
  if (!next) landed.append('You leaped all the way to ', el('b', '', past.name), '. Legendary.');
  else landed.append('You landed past ', el('b', '', past.name), ` · ${fmtDist(next.miles - data.miles)} short of ${next.name}.`);

  renderLeapLog(data.results);
  renderStats(data);

  clearInterval(statsTimer);
  statsTimer = setInterval(async () => {
    try {
      data.stats = await api('stats');
      save(KEY.result, data);
      renderStats(data);
    } catch {}
  }, 15000);
}

function renderStats(data) {
  const stats = data.stats ?? { n: 1, scores: [data.score], prompts: [] };
  const scores = stats.scores.length ? stats.scores : [data.score];
  renderCurve(scores, data.score);

  const others = Math.max(0, stats.n - 1);
  // Ties count as half, and your own score is one of the ties.
  const below = scores.filter((s) => s < data.score).length;
  const ties = scores.filter((s) => s === data.score).length - 1;
  $('#percentile').textContent = others
    ? `Better than ${Math.round(((below + ties / 2) / others) * 100)}% of ${others} classmate${others === 1 ? '' : 's'}`
    : 'First frog to finish · more classmates coming';

  const list = $('#answers');
  list.innerHTML = '';
  data.results.forEach((r, i) => {
    const tier = tierOf(r.tier);
    const room = stats.prompts?.[i];
    const li = el('li');
    li.style.setProperty('--c', tier.color);
    li.append(el('p', 'a-prompt', `${i + 1} · ${cfg.prompts[i].text}`));

    const main = el('div', 'a-main');
    const text = el('span', 'a-text', r.answer ? r.matched || r.answer : '—');
    if (r.answer && r.matched && r.matched.toLowerCase() !== r.answer.toLowerCase()) text.append(' ', el('small', '', `(you typed “${r.answer}”)`));
    if (r.answer && !r.matched) text.append(' ', el('small', '', '(not on our list)'));
    main.append(text, el('span', 'badge', `${tier.name} · +${tier.points}`));
    li.append(main);

    if (room?.top) {
      const line = el('p', 'a-room');
      const same = r.matched ? (room.counts[r.matched] || 1) - 1 : 0;
      if (r.matched) line.append(same ? `${same} other${same === 1 ? '' : 's'} said this · ` : 'Nobody else said this · ');
      line.append('Top: ', el('b', '', room.top.display), ` (${room.top.count})`);
      if (room.rarest && room.rarest.display !== room.top.display) line.append(' · Rarest: ', el('b', '', room.rarest.display));
      li.append(line);
    }
    list.append(li);
  });
}

const SVG = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderCurve(scores, mine) {
  const svg = $('#curve');
  svg.innerHTML = '';
  const max = cfg.tiers.at(-1).points * cfg.prompts.length;
  const X = (s) => 20 + (s / max) * 560;
  const base = 150;
  const bw = Math.max(20, max / 18);
  const density = (s) => scores.reduce((d, v) => d + Math.exp(-0.5 * ((s - v) / bw) ** 2), 0);
  const pts = [];
  for (let s = 0; s <= max; s += max / 100) pts.push([s, density(s)]);
  const peak = Math.max(...pts.map((p) => p[1]));
  const Y = (d) => base - (d / peak) * 120;
  const line = pts.map(([s, d], k) => `${k ? 'L' : 'M'}${X(s).toFixed(1)},${Y(d).toFixed(1)}`).join('');

  const grad = svgEl('linearGradient', { id: 'cg', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(svgEl('stop', { offset: 0, 'stop-color': '#b48cff', 'stop-opacity': 0.55 }), svgEl('stop', { offset: 1, 'stop-color': '#b48cff', 'stop-opacity': 0.03 }));
  const defs = svgEl('defs', {});
  defs.append(grad);
  svg.append(defs);
  svg.append(svgEl('path', { d: `${line}L${X(max)},${base}L${X(0)},${base}Z`, fill: 'url(#cg)' }));
  svg.append(svgEl('path', { d: line, fill: 'none', stroke: '#b48cff', 'stroke-width': 3 }));
  svg.append(svgEl('line', { x1: X(0), x2: X(max), y1: base, y2: base, stroke: '#3a2a55', 'stroke-width': 2 }));
  for (let s = 0; s <= max; s += 100) {
    svg.append(svgEl('line', { x1: X(s), x2: X(s), y1: base, y2: base + 5, stroke: '#3a2a55', 'stroke-width': 2 }));
    svg.append(svgEl('text', { x: X(s), y: base + 22, 'text-anchor': 'middle' }, s));
  }
  const yx = X(Math.min(mine, max));
  const yy = Y(density(mine));
  svg.append(svgEl('line', { x1: yx, x2: yx, y1: base, y2: yy, stroke: '#ff6b9a', 'stroke-width': 3 }));
  svg.append(svgEl('rect', { x: yx - 5, y: yy - 5, width: 10, height: 10, fill: '#ff6b9a' }));
  svg.append(svgEl('text', { x: yx, y: base + 40, 'text-anchor': 'middle', class: 'you' }, 'YOU'));
}

function renderLeapLog(results) {
  const svg = $('#leaplog');
  svg.innerHTML = '';
  const widths = [16, 28, 40, 58, 76, 96, 124];
  const heights = [6, 14, 24, 38, 56, 76, 104];
  const base = 140;
  const total = results.reduce((s, r) => s + widths[r.tier], 0) || 1;
  const k = 560 / total;
  let x = 20;
  svg.append(svgEl('line', { x1: 10, x2: 590, y1: base, y2: base, stroke: '#3a2a55', 'stroke-width': 2, 'stroke-dasharray': '4 4' }));
  results.forEach((r, i) => {
    const w = widths[r.tier] * k;
    const h = heights[r.tier];
    const color = tierOf(r.tier).color;
    svg.append(svgEl('path', {
      d: `M${x},${base} Q${x + w / 2},${base - h * 2} ${x + w},${base}`,
      fill: 'none', stroke: color, 'stroke-width': 3,
      'stroke-dasharray': r.tier === 0 ? '3 4' : 'none',
    }));
    svg.append(svgEl('rect', { x: x + w - 4, y: base - 4, width: 8, height: 8, fill: color }));
    svg.append(svgEl('text', { x: x + w, y: base + 24, 'text-anchor': 'middle' }, i + 1));
    x += w;
  });
}

// ---------- sound toggle ----------
const soundBtn = $('#sound');
soundBtn.setAttribute('aria-pressed', String(!isMuted()));
soundBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  soundBtn.setAttribute('aria-pressed', String(!isMuted()));
});

init();
