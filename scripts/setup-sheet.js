// One-time (safe to re-run) setup of the attendance Google Sheet:
//   Attendance  everyone who finished, sorted Last > First, with check-in time
//   Responses   raw log written by the game
//   Unmatched   answers that scored 0, for adding aliases later
// Run: npm run setup-sheet   (reads .env)
import fs from 'node:fs';
import { PROMPTS } from '../config/game.js';
import { HEADERS, RESPONSES_TAB } from '../lib/store.js';
import { sheets, sheetsConfigured } from '../lib/google.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
if (!sheetsConfigured()) {
  console.error('Set SHEET_ID and the service-account variables in .env first (see .env.example).');
  process.exit(1);
}

const ATTENDANCE = 'Attendance';
const UNMATCHED = 'Unmatched';
const tabs = [ATTENDANCE, RESPONSES_TAB, UNMATCHED];

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

// Whole-column ranges (A:C, not A2:C) so inserted rows can never shift the formulas.
// One row per student (first finished game), sorted by last name; row 1 is the header.
const attendance =
  `=QUERY(${RESPONSES_TAB}!A:C, "select B, C, min(A) where B is not null group by B, C order by B, C ` +
  `label B 'Last Name', C 'First Name', min(A) 'Check-in Time'", 1)`;
// Answers are columns E..K and points S..Y for prompts 1..7.
const col = (start, i) => String.fromCharCode(start.charCodeAt(0) + i);
const unmatched = PROMPTS.map((_, i) => {
  const a = `${RESPONSES_TAB}!${col('E', i)}:${col('E', i)}`;
  const p = `${RESPONSES_TAB}!${col('S', i)}:${col('S', i)}`;
  return `=IFERROR(SORT(UNIQUE(FILTER(${a}, ${p}=0, ${a}<>"", ROW(${a})>1))), "")`;
});

const data = [
  { range: `${ATTENDANCE}!A1`, values: [[attendance]] },
  { range: `${RESPONSES_TAB}!A1:Y1`, values: [HEADERS] },
  { range: `${UNMATCHED}!A1:G2`, values: [PROMPTS.map((p, i) => `${i + 1}. ${p.text}`), unmatched] },
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
