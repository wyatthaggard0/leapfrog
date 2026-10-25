import { PROMPTS } from '../config/game.js';
import { readBody, send, allow } from '../lib/http.js';
import { scoreAnswer } from '../lib/scoring.js';

// Scores one answer for the instant reveal. Nothing is saved here.
export default async function handler(req, res) {
  if (!allow(req, res, 'POST')) return;
  try {
    const { i, answer } = await readBody(req);
    if (!Number.isInteger(i) || i < 0 || i >= PROMPTS.length) return send(res, 400, { error: 'Bad prompt index' });
    send(res, 200, scoreAnswer(i, answer));
  } catch {
    send(res, 400, { error: 'Bad request' });
  }
}
