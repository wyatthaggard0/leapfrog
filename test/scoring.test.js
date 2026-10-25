import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndexes, scoreAnswer, scoreAll, normalize } from '../lib/scoring.js';
import { PROMPTS } from '../config/game.js';
import { ANSWERS } from '../config/answers/index.js';

const at = (slug) => PROMPTS.findIndex((p) => p.slug === slug);
const CAREER = at('careers');
const MAJOR = at('double-majors');
const EXCEL = at('excel');
const LANG = at('languages');
const TOOL = at('data-tools');
const THREAT = at('cyber-threats');
const COMPANY = at('companies');
const matched = (i, a) => scoreAnswer(i, a).matched;

test('every prompt has a generated answer set with all tiers', () => {
  assert.equal(PROMPTS.length, 7);
  for (const p of PROMPTS) {
    const set = ANSWERS[p.slug];
    assert.ok(set, `${p.slug} answers missing`);
    for (const t of [1, 2, 3, 4, 5, 6]) assert.ok(set.answers.some((a) => a.tier === t), `${p.slug} tier ${t} empty`);
  }
});

test('no alias is listed under two answers', () => {
  assert.doesNotThrow(() => buildIndexes());
});

test('normalize handles case, punctuation, + and #', () => {
  assert.equal(normalize('  VLOOKUP() '), 'vlookup');
  assert.equal(normalize('C++'), 'cplusplus');
  assert.equal(normalize('C#'), 'csharp');
  assert.equal(normalize('AT&T'), 'at and t');
});

test('exact, cased and punctuated answers match', () => {
  for (const a of ['vlookup', 'VLOOKUP', '=VLOOKUP(', 'v lookup', 'Vlookup()']) assert.equal(matched(EXCEL, a), 'VLOOKUP', a);
});

test('answers inside a longer phrase are found', () => {
  assert.equal(matched(MAJOR, 'finance and BIS'), 'Finance');
  assert.equal(matched(MAJOR, 'BIS & Finance'), 'Finance');
  assert.equal(matched(MAJOR, 'i would say accounting'), 'Accounting');
  assert.equal(matched(LANG, 'probably python'), 'Python');
  assert.equal(matched(EXCEL, 'the sumifs function'), 'SUMIFS');
});

test('multi-word answers beat their single words', () => {
  assert.equal(matched(EXCEL, 'index match'), 'INDEX MATCH');
  assert.equal(matched(TOOL, 'power bi'), 'Power BI');
});

test('typos, swapped letters and plurals are forgiven', () => {
  assert.equal(matched(EXCEL, 'vlookp'), 'VLOOKUP');
  assert.equal(matched(EXCEL, 'xlookpu'), 'XLOOKUP');
  assert.equal(matched(LANG, 'pyhton'), 'Python');
  assert.equal(matched(LANG, 'javascirpt'), 'JavaScript');
  assert.equal(matched(MAJOR, 'acounting'), 'Accounting');
  assert.equal(matched(MAJOR, 'finanse'), 'Finance');
  assert.equal(matched(THREAT, 'ransomwear'), 'Ransomware');
  assert.equal(matched(THREAT, 'phising'), 'Phishing');
  assert.equal(matched(TOOL, 'tablaeu'), 'Tableau');
  assert.equal(matched(COMPANY, 'microsft'), 'Microsoft');
  assert.equal(matched(COMPANY, 'deloite'), 'Deloitte');
});

test('manual overrides: extra aliases and rejected guesses', () => {
  assert.equal(matched(LANG, 'sequel'), 'SQL');
  assert.equal(matched(MAJOR, 'information systems'), '');
  assert.equal(matched(MAJOR, 'business information systems'), '');
  assert.equal(matched(MAJOR, 'finance and bis'), 'Finance');
});

test('filler words alone still count when they are the answer', () => {
  assert.equal(matched(EXCEL, 'AND'), 'AND');
  assert.equal(matched(COMPANY, 'Microsoft'), 'Microsoft');
});

test('junk and blanks score zero', () => {
  for (const a of ['', '   ', 'asdfghjkl', 'idk', 'qwerty uiop', null, undefined]) {
    const r = scoreAnswer(EXCEL, a);
    assert.equal(r.tier, 0, String(a));
    assert.equal(r.points, 0);
  }
});

test('common answers score low, deep cuts score high', () => {
  assert.equal(scoreAnswer(EXCEL, 'sum').tier, 1);
  assert.equal(scoreAnswer(MAJOR, 'finance').tier, 1);
  assert.ok(scoreAnswer(EXCEL, 'besselj').tier >= 5);
  assert.ok(scoreAnswer(CAREER, 'data analyst').tier <= 2);
});

test('scoreAll totals points and miles', () => {
  const all = scoreAll(['data analyst', 'finance', 'sum', 'python', 'excel', 'phishing', 'microsoft']);
  assert.equal(all.results.length, 7);
  assert.equal(all.score, 70);
  assert.ok(all.miles > 0);
  assert.equal(scoreAll([]).score, 0);
});
