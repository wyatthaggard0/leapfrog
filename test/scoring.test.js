import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndexes, scoreAnswer, scoreAll, normalize } from '../lib/scoring.js';
import { PROMPTS, SECTIONS } from '../config/game.js';

const EXCEL = 2;
const LANG = 3;
const COMPANY = 6;

test('answer lists have no alias listed under two answers', () => {
  assert.doesNotThrow(() => buildIndexes());
});

test('there are 7 prompts and every tier 1-6 is filled', () => {
  assert.equal(PROMPTS.length, 7);
  for (const p of PROMPTS) for (const t of [1, 2, 3, 4, 5, 6]) assert.ok(p.tiers[t]?.length, `${p.text} tier ${t}`);
});

test('section names are safe for Sheet tabs and QUERY strings', () => {
  for (const s of SECTIONS) assert.doesNotMatch(s, /['[\]*?:/\\]/);
});

test('normalize handles case, punctuation, + and #', () => {
  assert.equal(normalize('  VLOOKUP() '), 'vlookup');
  assert.equal(normalize('C++'), 'cplusplus');
  assert.equal(normalize('C#'), 'csharp');
  assert.equal(normalize('AT&T'), 'at and t');
});

test('exact, cased and punctuated answers match', () => {
  for (const a of ['vlookup', 'VLOOKUP', '=VLOOKUP(', 'v lookup', 'Vlookup()']) {
    assert.equal(scoreAnswer(EXCEL, a).matched, 'VLOOKUP', a);
  }
});

test('aliases resolve to the display name', () => {
  assert.equal(scoreAnswer(LANG, 'cpp').matched, 'C++');
  assert.equal(scoreAnswer(LANG, 'C sharp').matched, 'C#');
  assert.equal(scoreAnswer(LANG, 'golang').matched, 'Go');
  assert.equal(scoreAnswer(COMPANY, 'Ernst & Young').matched, 'EY');
  assert.equal(scoreAnswer(COMPANY, 'AT&T').matched, 'AT&T');
});

test('filler words and plurals are forgiven', () => {
  assert.equal(scoreAnswer(COMPANY, 'The Home Depot').matched, 'Home Depot');
  assert.equal(scoreAnswer(4, 'MS Excel').matched, 'Excel');
  assert.equal(scoreAnswer(0, 'data analysts').matched, 'Data Analyst');
  assert.equal(scoreAnswer(COMPANY, 'Microsoft').matched, 'Microsoft');
});

test('small typos still match, short words must be exact', () => {
  assert.equal(scoreAnswer(EXCEL, 'vlookp').matched, 'VLOOKUP');
  assert.equal(scoreAnswer(5, 'ransomwear').matched, 'Ransomware');
  assert.equal(scoreAnswer(LANG, 'pythn').matched, 'Python');
  assert.equal(scoreAnswer(EXCEL, 'sun').matched, '');
});

test('junk and blanks score zero', () => {
  for (const a of ['', '   ', 'asdfghjkl', 'idk', null, undefined]) {
    const r = scoreAnswer(EXCEL, a);
    assert.equal(r.tier, 0);
    assert.equal(r.points, 0);
  }
});

test('rarer answers score more', () => {
  const common = scoreAnswer(EXCEL, 'sum');
  const rare = scoreAnswer(EXCEL, 'lambda');
  assert.equal(common.tier, 1);
  assert.equal(rare.tier, 6);
  assert.ok(rare.points > common.points);
});

test('scoreAll totals points and miles', () => {
  const all = scoreAll(['data analyst', 'finance', 'sum', 'python', 'excel', 'phishing', 'microsoft']);
  assert.equal(all.score, 70);
  assert.equal(all.results.length, 7);
  assert.ok(all.miles > 0);
  assert.equal(scoreAll([]).score, 0);
});
