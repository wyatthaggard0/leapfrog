// One-time (safe to re-run) setup of the attendance Google Sheet:
//   Responses   raw log written by the game
//   Attendance  everyone, sorted Section > Last > First
//   <section>   one tab per section from config/game.js
//   Unmatched   answers that scored 0, for adding aliases later
// Run: npm run setup-sheet   (reads .env)
import fs from 'node:fs';
import { PROMPTS, SECTIONS } from '../config/game.js';
import { HEADERS, RESPONSES_TAB } from '../lib/store.js';
import { sheets, sheetsConfigured } from '../lib/google.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
if (!sheetsConfigured()) {
  console.error('Set SHEET_ID and the service-account variables in .env first (see .env.example).');
  process.exit(1);
}

const ATTENDANCE = 'Attendance';
const UNMATCHED = 'Unmatched';
const tabs = [RESPONSES_TAB, ATTENDANCE, ...SECTIONS, UNMATCHED];

const meta = await sheets('', { query: { fields: 'sheets.properties' } });
const existing = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
const missing = tabs.filter((t) => !existing.has(t));
if (missing.length) {
  const res = await sheets(':batchUpdate', {
    method: 'POST',
    body: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  for (const r of res.replies) existing.set(r.addSheet.properties.title, r.addSheet.properties.sheetId);
  console.log(`Added tabs: ${missing.join(', ')}`);
}

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const attendance =
  `=QUERY(${RESPONSES_TAB}!A2:D, "select D, B, C, min(A) where B is not null group by D, B, C order by D, B, C ` +
  `label D 'Section', B 'Last Name', C 'First Name', min(A) 'Check-in Time'", 0)`;
const sectionQuery = (section) =>
  `=QUERY(${RESPONSES_TAB}!A2:D, "select B, C, min(A) where D = '${section}' group by B, C order by B, C ` +
  `label B 'Last Name', C 'First Name', min(A) 'Check-in Time'", 0)`;
// Answer column F..L, points column T..Z for prompts 1..7.
const col = (start, i) => String.fromCharCode(start.charCodeAt(0) + i);
const unmatched = PROMPTS.map(
  (_, i) =>
    `=IFERROR(SORT(UNIQUE(FILTER(${RESPONSES_TAB}!${col('F', i)}2:${col('F', i)}, ` +
    `${RESPONSES_TAB}!${col('T', i)}2:${col('T', i)}=0, ${RESPONSES_TAB}!${col('F', i)}2:${col('F', i)}<>""))), "")`,
);

const data = [
  { range: `${q(RESPONSES_TAB)}!A1:Z1`, values: [HEADERS] },
  { range: `${q(ATTENDANCE)}!A1`, values: [[attendance]] },
  ...SECTIONS.map((s) => ({ range: `${q(s)}!A1`, values: [[sectionQuery(s)]] })),
  { range: `${q(UNMATCHED)}!A1:G2`, values: [PROMPTS.map((p, i) => `${i + 1}. ${p.text}`), unmatched] },
];
await sheets('/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'USER_ENTERED', data } });

// Freeze + bold header rows so the tabs read like tables.
const requests = tabs.flatMap((t) => [
  {
    updateSheetProperties: {
      properties: { sheetId: existing.get(t), gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    },
  },
  {
    repeatCell: {
      range: { sheetId: existing.get(t), startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat.bold',
    },
  },
]);
await sheets(':batchUpdate', { method: 'POST', body: { requests } });

console.log(`Sheet ready: https://docs.google.com/spreadsheets/d/${process.env.SHEET_ID}/edit`);
console.log(`Tabs: ${tabs.join(' | ')}`);
