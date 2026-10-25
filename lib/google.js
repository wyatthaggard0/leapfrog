// Minimal Google Sheets client: service-account JWT auth + REST calls, no dependencies.
import crypto from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function credentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const json = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return { email: json.client_email, key: json.private_key };
  }
  return {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

export function sheetsConfigured() {
  return Boolean(
    process.env.SHEET_ID &&
      (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
        (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)),
  );
}

let token = null;
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (token && token.exp - 120 > now) return token.value;
  const { email, key } = credentials();
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`Google auth failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  token = { value: data.access_token, exp: now + data.expires_in };
  return token.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries rate limits (429) and server errors with exponential backoff.
export async function sheets(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`${BASE}/${process.env.SHEET_ID}${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    // Quota windows are per minute, so keep trying for roughly 45s before giving up.
    if (!retryable || attempt >= 8) {
      throw new Error(`Sheets ${method} ${path} failed (${res.status}): ${await res.text()}`);
    }
    await sleep(Math.min(10000, 500 * 2 ** attempt) + Math.random() * 1000);
  }
}
