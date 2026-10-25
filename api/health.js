import { send, allow } from '../lib/http.js';
import { storageMode } from '../lib/store.js';
import { sheets, sheetsConfigured } from '../lib/google.js';

// Setup check for organizers: what this deployment can see. Never returns secret values.
export default async function handler(req, res) {
  if (!allow(req, res, 'GET')) return;
  const env = process.env;
  const report = {
    storage: storageMode(),
    onVercel: Boolean(env.VERCEL),
    node: process.version,
    sheetIdSet: Boolean(env.SHEET_ID),
    serviceAccountJsonSet: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON),
    serviceAccountJsonParses: null,
    answersLoaded: null,
    sheetAccess: null,
  };
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const j = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
      report.serviceAccountJsonParses = Boolean(j.client_email && j.private_key);
    } catch (err) {
      report.serviceAccountJsonParses = `no: ${err.message}`;
    }
  }
  try {
    const { ANSWERS } = await import('../config/answers/index.js');
    report.answersLoaded = Object.values(ANSWERS).reduce((n, s) => n + s.answers.length, 0);
  } catch (err) {
    report.answersLoaded = `error: ${err.message}`;
  }
  if (sheetsConfigured()) {
    try {
      const meta = await sheets('', { query: { fields: 'properties.title,sheets.properties.title' } });
      report.sheetAccess = `ok: "${meta.properties.title}" (${meta.sheets.map((s) => s.properties.title).join(', ')})`;
    } catch (err) {
      report.sheetAccess = `error: ${err.message.slice(0, 300)}`;
    }
  }
  send(res, 200, report);
}
