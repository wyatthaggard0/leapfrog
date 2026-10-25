import { EVENT, SECTIONS, SETTINGS, TIERS, MILESTONES, BIOMES, PROMPTS } from '../config/game.js';
import { send, allow } from '../lib/http.js';
import { storageMode } from '../lib/store.js';

// Public game config. Answer lists are deliberately left out.
export default function handler(req, res) {
  if (!allow(req, res, 'GET')) return;
  send(res, 200, {
    event: EVENT,
    sections: SECTIONS,
    settings: SETTINGS,
    tiers: TIERS,
    milestones: MILESTONES,
    biomes: BIOMES,
    prompts: PROMPTS.map((p) => ({ text: p.text })),
    storage: storageMode(),
  });
}
