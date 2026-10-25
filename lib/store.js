// Where check-ins are saved: Google Sheets when configured, otherwise data/responses.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { sheets, sheetsConfigured } from './google.js';

// Responses tab columns: A ts | B last | C first | D section | E score | F-L answers | M-S matched | T-Z points
export const HEADERS = [
  'Timestamp', 'Last Name', 'First Name', 'Section', 'Score',
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `Answer ${n}`),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `Matched ${n}`),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `Points ${n}`),
];
export const RESPONSES_TAB = 'Responses';

const LOCAL_FILE = path.join(process.cwd(), 'data', 'responses.json');

export const storageMode = () => (sheetsConfigured() ? 'sheets' : 'local');

const toRow = (r) => [r.ts, r.last, r.first, r.section, r.score, ...r.answers, ...r.matched, ...r.points];

function fromRow(row) {
  const cell = (i) => row[i] ?? '';
  return {
    ts: cell(0),
    last: cell(1),
    first: cell(2),
    section: cell(3),
    score: Number(cell(4)) || 0,
    answers: [5, 6, 7, 8, 9, 10, 11].map(cell),
    matched: [12, 13, 14, 15, 16, 17, 18].map(cell),
    points: [19, 20, 21, 22, 23, 24, 25].map((i) => Number(cell(i)) || 0),
  };
}

async function readLocal() {
  try {
    return JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Serialize local writes so concurrent submissions don't clobber each other.
let localQueue = Promise.resolve();

export async function appendResponse(record) {
  if (storageMode() === 'sheets') {
    // RAW keeps answers like "=SUM(" as text instead of formulas.
    await sheets(`/values/${RESPONSES_TAB}!A:Z:append`, {
      method: 'POST',
      query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
      body: { values: [toRow(record)] },
    });
    return;
  }
  localQueue = localQueue.then(async () => {
    const rows = await readLocal();
    rows.push(record);
    await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
    await fs.writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2));
  });
  await localQueue;
}

export async function listResponses() {
  if (storageMode() === 'sheets') {
    const data = await sheets(`/values/${RESPONSES_TAB}!A2:Z`);
    return (data.values || []).map(fromRow);
  }
  return readLocal();
}
