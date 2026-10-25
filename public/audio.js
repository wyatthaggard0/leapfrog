// Tiny synth sounds. Off by default since students play in a lecture hall.
let ctx = null;
let muted = true;
try {
  muted = localStorage.getItem('leapfrog:sound') !== 'on';
} catch {}

export const isMuted = () => muted;

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem('leapfrog:sound', m ? 'off' : 'on');
  } catch {}
  if (!m) ctx ??= new AudioContext();
}

function tone(freq, start, dur, { type = 'square', gain = 0.06, slide = 0 } = {}) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  tick: () => tone(880, 0, 0.05, { gain: 0.03 }),
  leap: (tier) => tone(180 + tier * 30, 0, 0.25 + tier * 0.05, { slide: 3, type: 'triangle', gain: 0.08 }),
  land: () => tone(110, 0, 0.12, { type: 'triangle', gain: 0.1, slide: 0.5 }),
  splash: () => tone(600, 0, 0.3, { type: 'sawtooth', gain: 0.03, slide: 0.3 }),
  tier(tier) {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    for (let i = 0; i < tier; i++) tone(notes[i], i * 0.08, 0.14, { gain: 0.05 });
  },
};
