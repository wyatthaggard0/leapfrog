import { send, allow } from '../lib/http.js';
import { getStats } from '../lib/stats.js';

export default async function handler(req, res) {
  if (!allow(req, res, 'GET')) return;
  try {
    send(res, 200, await getStats());
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Could not load stats' });
  }
}
