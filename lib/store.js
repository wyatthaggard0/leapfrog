// Where check-ins are saved: Google Sheets when configured, otherwise data/responses.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { sheets, sheetsConfigured } from './google.js';

// Responses tab columns: A ts | B last | C first | D score | E-K answers | L-R matched | S-Y points
export const HEADERS = [
  'Timestamp', 'Last Name', 'First Name', 'Score',
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `Answer ${n}`),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `Matched ${n}`),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `Points ${n}`),
];
// Overridable so load tests can write to a scratch tab instead of the real log.
export const RESPONSES_TAB = process.env.RESPONSES_TAB || 'Responses';

const LOCAL_FILE = path.join(process.cwd(), 'data', 'responses.json');

export const storageMode = () => (sheetsConfigured() ? 'sheets' : 'local');

const toRow = (r) => [r.ts, r.last, r.first, r.score, ...r.answers, ...r.matched, ...r.points];

function fromRow(row) {
  const cell = (i) => row[i] ?? '';
  return {
    ts: cell(0),
    last: cell(1),
    first: cell(2),
    score: Number(cell(3)) || 0,
    answers: [4, 5, 6, 7, 8, 9, 10].map(cell),
    matched: [11, 12, 13, 14, 15, 16, 17].map(cell),
    points: [18, 19, 20, 21, 22, 23, 24].map((i) => Number(cell(i)) || 0),
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

// Check-ins arriving within BATCH_MS share one Sheets write, so a room finishing at
// once stays under Google's ~60 writes/minute quota. Each request still waits for
// its batch to land before answering, so a "saved" response means it's in the sheet.
const BATCH_MS = 1500;
const BATCH_MAX = 100;
let pendingBatch = null;

function writeRows(rows) {
  // RAW keeps answers like "=SUM(" as text. INSERT_ROWS gives every append its own
  // rows, which is safe under concurrency; the other tabs use whole-column ranges
  // so the inserted rows can't shift their formulas.
  return sheets(`/values/${RESPONSES_TAB}!A:Y:append`, {
    method: 'POST',
    query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
    body: { values: rows },
  });
}

function queueRow(row) {
  if (!pendingBatch) {
    const batch = { rows: [] };
    batch.done = new Promise((r) => setTimeout(r, BATCH_MS)).then(() => {
      if (pendingBatch === batch) pendingBatch = null;
      return writeRows(batch.rows);
    });
    pendingBatch = batch;
  }
  const batch = pendingBatch;
  batch.rows.push(row);
  if (batch.rows.length >= BATCH_MAX) pendingBatch = null;
  return batch.done;
}

export async function appendResponse(record) {
  if (storageMode() === 'sheets') {
    await queueRow(toRow(record));
    return;
  }
  if (process.env.VERCEL) {
    // Vercel's filesystem is read-only, so the local fallback can't work there.
    throw Object.assign(new Error('Google Sheets is not connected (set SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON in Vercel).'), {
      code: 'storage_not_configured',
    });
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
    const data = await sheets(`/values/${RESPONSES_TAB}!A:Y`);
    return (data.values || []).slice(1).filter((r) => r[1]).map(fromRow);
  }
  return readLocal();
}
