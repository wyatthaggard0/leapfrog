// The pixel world behind the UI: a low-res canvas scaled up, every sprite drawn in code.

// ---------- sprites ----------
// Fill-only pixel maps; the outline is added automatically.
const FROG_SIT = [
  '..........h.h...',
  '.........pwwp...',
  '...pppppppwkpp..',
  '..ppllllpppppppp',
  '.pplllppppppppmp',
  '.pppppppbbbbbbp.',
  '.ppppppbbbbbbb..',
  'pppppppbbbbbp...',
  'ppp.pppp..pp....',
  'pppp.pppp.ppp...',
];
const FROG_LEAP = [
  '..............h.h...',
  '.............pwwp...',
  '........ppppppwkpp..',
  'pp....pplllppppppppp',
  '.ppppplllpppppppppmp',
  '...ppppppppbbbbbbpp.',
  'pppp..pppbbbbbbpp.pp',
  'pp.........pp.....pp',
];
const FROG_PAL = { p: '#7b3fc0', l: '#a57de0', b: '#efe6f8', w: '#ffffff', k: '#16081f', h: '#ead9a2', m: '#2a0d45' };
const OUTLINE = '#1c0a30';

function makeSprite(rows, pal) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w + 2;
  c.height = h + 2;
  const g = c.getContext('2d');
  const filled = (x, y) => y >= 0 && y < h && x >= 0 && x < rows[y].length && rows[y][x] !== '.';
  g.fillStyle = OUTLINE;
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (!filled(x, y) && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) {
        g.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (!filled(x, y)) continue;
      g.fillStyle = pal[rows[y][x]];
      g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  return c;
}

// ---------- helpers ----------
function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = Math.round;

function rect(g, x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(R(x), R(y), R(w), R(h));
}

function disc(g, cx, cy, r, c) {
  g.fillStyle = c;
  for (let dy = -r; dy <= r; dy++) {
    const half = R(Math.sqrt(r * r - dy * dy));
    g.fillRect(R(cx - half), R(cy + dy), half * 2 + 1, 1);
  }
}

// Triangle from a peak at (cx, top) down to a base on y = bottom.
function tri(g, cx, top, bottom, halfBase, c) {
  g.fillStyle = c;
  const h = bottom - top;
  for (let y = 0; y < h; y++) {
    const half = R((halfBase * (y + 1)) / h);
    g.fillRect(R(cx - half), R(top + y), half * 2 + 1, 1);
  }
}

// Calls fn for each tile of a parallax layer that is on screen.
function tiles(v, parallax, size, seed, fn) {
  const off = v.camX * parallax;
  const first = Math.floor(off / size) - 1;
  const last = Math.floor((off + v.W) / size) + 1;
  for (let t = first; t <= last; t++) fn(R(t * size - off), rng(t * 7919 + seed), t);
}

// ---------- biomes ----------
const BIOMES = {
  campus: {
    sky: ['#7aa4de', '#93b6e5', '#adc8ec', '#c9daf2', '#e1e9f6'],
    sun: '#fff3c4', clouds: true, ground: '#4a8a3d', top: '#6db354',
    far(g, v) {
      tiles(v, 0.22, 22, 11, (x, r) => disc(g, x + 11, v.GY - 9 - r() * 5, 9 + R(r() * 3), r() > 0.5 ? '#3c6c48' : '#34603f'));
    },
    mid(g, v) {
      tiles(v, 0.5, 92, 12, (x, r) => {
        if (r() < 0.25) return disc(g, x + 40, v.GY - 10, 10, '#2f6b3a');
        const w = 40 + R(r() * 22), h = 20 + R(r() * 14), bx = x + R(r() * 30), top = v.GY - h;
        rect(g, bx, top, w, h, '#eadcbb');
        rect(g, bx, top + h - 2, w, 2, '#cdbd98');
        for (let y = 0; y < 6; y++) rect(g, bx - 3 + y, top - 6 + y, w + 6 - y * 2, 1, y < 1 ? '#8f3d2b' : '#b5523b');
        for (let wy = top + 4; wy < v.GY - 6; wy += 7) for (let wx = bx + 4; wx < bx + w - 5; wx += 7) rect(g, wx, wy, 3, 4, '#5b6f92');
        if (r() < 0.4) {
          const tx = bx + R(w / 2) - 4;
          rect(g, tx, top - 20, 9, 20, '#eadcbb');
          tri(g, tx + 4, top - 30, top - 20, 6, '#b5523b');
          rect(g, tx + 3, top - 15, 3, 4, '#5b6f92');
        }
      });
    },
  },
  city: {
    sky: ['#24123d', '#3d1f5c', '#63306f', '#95447a', '#cf6a7a', '#ef9d74'],
    moon: '#f3e9ff', stars: true, ground: '#363042', top: '#6b6177',
    far(g, v) {
      tiles(v, 0.2, 13, 21, (x, r) => {
        const h = 18 + R(r() * 52);
        rect(g, x, v.GY - h, 12, h, '#21113a');
        for (let wy = v.GY - h + 3; wy < v.GY - 2; wy += 4) for (let wx = x + 2; wx < x + 11; wx += 3) if (r() < 0.22) rect(g, wx, wy, 1, 2, '#f5d27a');
      });
    },
    mid(g, v) {
      tiles(v, 0.6, 58, 22, (x, r) => {
        rect(g, x + 20, v.GY - 26, 2, 26, '#1a0f28');
        rect(g, x + 17, v.GY - 27, 8, 2, '#1a0f28');
        rect(g, x + 18, v.GY - 25, 6, 1, '#ffe7a3');
        if (r() < 0.5) rect(g, x + 36, v.GY - 9, 14, 9, '#2a1d3c');
      });
    },
  },
  prairie: {
    sky: ['#70a9e1', '#8bbce8', '#a9cdee', '#c8def3', '#e2ecf6'],
    sun: '#fff6cf', clouds: true, ground: '#a3874b', top: '#c2a85e',
    far(g, v) {
      for (const [p, c, base, amp] of [[0.15, '#9bb86b', 18, 7], [0.32, '#86a457', 10, 5]]) {
        const off = v.camX * p;
        g.fillStyle = c;
        for (let x = 0; x < v.W; x++) {
          const h = base + amp * Math.sin((x + off) / 37) + (amp / 2) * Math.sin((x + off) / 13);
          g.fillRect(x, R(v.GY - h), 1, R(h));
        }
      }
    },
    mid(g, v) {
      tiles(v, 0.75, 16, 31, (x, r, t) => {
        rect(g, x, v.GY - 9, 2, 9, '#6b4a2b');
        rect(g, x, v.GY - 8, 16, 1, '#86603a');
        rect(g, x, v.GY - 4, 16, 1, '#86603a');
        if (t % 9 === 0) {
          rect(g, x + 4, v.GY - 7, 10, 7, '#d8b45a');
          rect(g, x + 4, v.GY - 5, 10, 1, '#b8943f');
        }
      });
    },
  },
  plains: {
    sky: ['#e58e57', '#eda66a', '#f3bf82', '#f7d39c', '#fae4ba'],
    sun: '#fff0c0', clouds: true, ground: '#97693f', top: '#b9834f',
    far(g, v) {
      rect(g, 0, v.GY - 6, v.W, 6, '#c99a63');
      tiles(v, 0.25, 64, 41, (x, r) => {
        if (r() < 0.35) return;
        const px = x + 30, top = v.GY - 38;
        rect(g, px, top, 1, 34, '#f6efe6');
        const a = v.t / 700 + r() * 6;
        for (let k = 0; k < 3; k++) {
          const ang = a + (k * Math.PI * 2) / 3;
          for (let s = 1; s < 11; s++) rect(g, px + Math.cos(ang) * s, top + Math.sin(ang) * s, 1, 1, '#f6efe6');
        }
      });
    },
    mid(g, v) {
      tiles(v, 0.6, 110, 42, (x, r) => {
        if (r() < 0.3) return;
        const px = x + 40, c = '#2c1f1a';
        rect(g, px, v.GY - 4, 22, 4, c);
        tri(g, px + 11, v.GY - 20, v.GY - 3, 6, c);
        const tilt = Math.sin(v.t / 500 + r() * 6) * 4;
        for (let s = -14; s <= 14; s++) rect(g, px + 11 + s, v.GY - 21 + (s * tilt) / 14, 1, 2, c);
        rect(g, px - 4, v.GY - 21 - tilt, 3, 6, c);
        rect(g, px - 3, v.GY - 16 - tilt, 1, 16 + tilt, c);
      });
    },
  },
  desert: {
    sky: ['#d4623d', '#e68352', '#f0a46a', '#f6c389', '#fadaa6'],
    sun: '#ffe6a0', ground: '#cb8d52', top: '#dfa86b',
    far(g, v) {
      tiles(v, 0.2, 120, 51, (x, r) => {
        if (r() < 0.3) return;
        const w = 50 + R(r() * 40), h = 16 + R(r() * 24), bx = x + R(r() * 40);
        for (let y = 0; y < h; y++) {
          const inset = y < 3 ? 3 - y : 0;
          rect(g, bx - y * 0.3 + inset, v.GY - h + y, w + y * 0.6 - inset * 2, 1, y % 7 === 3 ? '#9d4832' : '#b0553a');
        }
      });
    },
    mid(g, v) {
      tiles(v, 0.65, 50, 52, (x, r) => {
        if (r() < 0.4) return;
        const cx = x + 20, h = 13 + R(r() * 9), c = '#3b7a3a';
        rect(g, cx, v.GY - h, 3, h, c);
        rect(g, cx - 4, v.GY - h + 5, 4, 2, c);
        rect(g, cx - 4, v.GY - h + 1, 2, 5, c);
        rect(g, cx + 3, v.GY - h + 8, 4, 2, c);
        rect(g, cx + 5, v.GY - h + 4, 2, 5, c);
      });
    },
  },
  mountains: {
    sky: ['#4a6bb2', '#6787c3', '#88a3d3', '#abc0e2', '#cbd8ee'],
    sun: '#fffbe6', clouds: true, ground: '#3c5b36', top: '#5c8248',
    far(g, v) {
      for (const [p, c, size, seed] of [[0.15, '#6274a0', 90, 61], [0.3, '#4b5a85', 70, 62]]) {
        tiles(v, p, size, seed, (x, r) => {
          const h = 30 + R(r() * 40), cx = x + size / 2;
          tri(g, cx, v.GY - h, v.GY, h * 0.9, c);
          if (p < 0.2) tri(g, cx, v.GY - h, v.GY - h + h * 0.25, h * 0.225, '#f1f5fb');
        });
      }
    },
    mid(g, v) {
      tiles(v, 0.6, 18, 63, (x, r) => {
        const h = 12 + R(r() * 12);
        tri(g, x + 9, v.GY - h, v.GY - 2, 5, '#244a33');
        rect(g, x + 8, v.GY - 2, 2, 2, '#4a3222');
      });
    },
  },
  coast: {
    sky: ['#3a92d6', '#5fabe3', '#89c3ed', '#b3d9f4', '#d6ebf9'],
    sun: '#fff8d8', clouds: true, ground: '#dcc792', top: '#efdfb0',
    far(g, v) {
      rect(g, 0, v.GY - 22, v.W, 22, '#2f7fc0');
      rect(g, 0, v.GY - 22, v.W, 1, '#1f5f99');
      const off = v.camX * 0.3 + v.t / 60;
      for (let row = 0; row < 4; row++) {
        for (let x = -((off + row * 9) % 18); x < v.W; x += 18) rect(g, x, v.GY - 18 + row * 5, 6, 1, '#7cc3ee');
      }
    },
    mid(g, v) {
      tiles(v, 0.65, 80, 72, (x, r) => {
        if (r() < 0.35) return;
        const bx = x + 30;
        for (let s = 0; s < 26; s++) rect(g, bx + Math.sin(s / 9) * 4, v.GY - s, 2, 1, '#8a6239');
        const tx = bx + Math.sin(25 / 9) * 4, ty = v.GY - 26;
        for (const [dx, dy] of [[-1, 0], [1, 0], [-0.7, 0.5], [0.7, 0.5]]) {
          for (let s = 0; s < 9; s++) rect(g, tx + dx * s, ty + dy * s + (s * s) / 20, 2, 1, '#2f8a4a');
        }
      });
    },
  },
};

function drawSky(g, v, b) {
  const bands = b.sky;
  const bandH = v.GY / bands.length;
  bands.forEach((c, i) => rect(g, 0, Math.floor(i * bandH), v.W, Math.ceil(bandH) + 1, c));
  if (b.stars) {
    const r = rng(99);
    for (let i = 0; i < 40; i++) {
      const x = R(r() * v.W), y = R(r() * v.GY * 0.55);
      if ((Math.sin(v.t / 400 + i) + 1) / 2 > 0.25) rect(g, x, y, 1, 1, '#f3e9ff');
    }
  }
  if (b.sun) disc(g, R(v.W * 0.8), R(v.GY * 0.2), 8, b.sun);
  if (b.moon) {
    disc(g, R(v.W * 0.8), R(v.GY * 0.18), 7, b.moon);
    disc(g, R(v.W * 0.8) + 3, R(v.GY * 0.18) - 2, 6, bands[0]);
  }
  if (b.clouds) {
    const off = v.camX * 0.08 + v.t / 250;
    const first = Math.floor(off / 70) - 1;
    for (let t = first; t < first + v.W / 70 + 3; t++) {
      const r = rng(t * 31 + 5);
      if (r() < 0.45) continue;
      const x = R(t * 70 - off + r() * 30), y = R(6 + r() * v.GY * 0.35), w = 18 + R(r() * 20);
      rect(g, x, y + 3, w, 4, '#ffffff');
      rect(g, x + 4, y, w - 10, 4, '#ffffff');
      rect(g, x + 2, y + 7, w - 2, 1, '#dfe8f4');
    }
  }
}

function drawGround(g, v, b) {
  rect(g, 0, v.GY, v.W, v.H - v.GY, b.ground);
  rect(g, 0, v.GY, v.W, 2, b.top);
  tiles(v, 1, 12, 81, (x, r) => {
    rect(g, x + R(r() * 10), v.GY + 4 + R(r() * (v.H - v.GY - 6)), 2, 1, 'rgba(0,0,0,0.12)');
    if (r() < 0.5) rect(g, x + R(r() * 10), v.GY - 1, 1, 1, b.top);
  });
}

// ---------- tier landmarks ----------
const LEAPS = {
  0: { dist: 40, h: 16, dur: 650, obstacle: 'puddle' },
  1: { dist: 58, h: 22, dur: 760, obstacle: 'pads' },
  2: { dist: 86, h: 46, dur: 950, obstacle: 'fountain' },
  3: { dist: 160, h: 74, dur: 1250, obstacle: 'stadium' },
  4: { dist: 200, h: 112, dur: 1500, obstacle: 'skyline' },
  5: { dist: 250, h: 96, dur: 1700, obstacle: 'mesa' },
  6: { dist: 360, h: 999, dur: 2300, obstacle: 'peaks' },
};

function water(g, v, x0, x1) {
  rect(g, x0, v.GY, x1 - x0, 4, '#3f86c9');
  rect(g, x0 + 1, v.GY, x1 - x0 - 2, 1, '#8cc8f0');
  const shift = R(v.t / 300) % 6;
  for (let x = x0 + 3 + shift; x < x1 - 3; x += 9) rect(g, x, v.GY + 2, 3, 1, '#6fb2e4');
}

function lilyPad(g, x, y) {
  rect(g, x - 6, y, 13, 2, '#3f9a48');
  rect(g, x - 5, y - 1, 11, 1, '#5cbf5f');
  rect(g, x + 1, y - 1, 2, 1, '#3f86c9');
}

const OBSTACLES = {
  pond(g, v, x) {
    water(g, v, x - 28, x + 28);
    lilyPad(g, x, v.GY);
    lilyPad(g, x + 18, v.GY + 1);
    for (const cx of [x - 24, x + 25]) {
      rect(g, cx, v.GY - 12, 1, 12, '#4f7a3a');
      rect(g, cx - 1, v.GY - 15, 3, 5, '#7a4a2a');
    }
  },
  puddle(g, v, x) {
    water(g, v, x - 12, x + 12);
  },
  pads(g, v, x, o) {
    water(g, v, x - o.dist / 2 + 10, x + o.dist / 2 - 10);
    lilyPad(g, x - 8, v.GY + 1);
    lilyPad(g, x + 10, v.GY);
  },
  fountain(g, v, x) {
    rect(g, x - 17, v.GY - 8, 35, 8, '#c9c2b4');
    rect(g, x - 17, v.GY - 9, 35, 2, '#9c958a');
    rect(g, x - 15, v.GY - 7, 31, 2, '#5aa7e0');
    rect(g, x - 3, v.GY - 22, 7, 14, '#b8b0a2');
    rect(g, x - 10, v.GY - 25, 21, 3, '#c9c2b4');
    rect(g, x - 2, v.GY - 30, 5, 5, '#7b3fc0');
    for (let k = 0; k < 10; k++) {
      const p = ((v.t / 900 + k / 10) % 1), side = k % 2 ? 1 : -1;
      rect(g, x + side * p * 14, v.GY - 28 + (p * 2 - 1) ** 2 * 18 - 4, 1, 1, '#a9dcff');
    }
  },
  stadium(g, v, x) {
    const l = x - 62, w = 124;
    rect(g, l, v.GY - 42, w, 42, '#d9d2c3');
    rect(g, l, v.GY - 42, w, 12, '#4d1979');
    rect(g, l, v.GY - 35, w, 1, '#ffffff');
    for (let ax = l + 5; ax < l + w - 6; ax += 11) rect(g, ax, v.GY - 14, 6, 14, '#5a5262');
    rect(g, x - 22, v.GY - 51, 44, 9, '#ece7dd');
    for (let wx = x - 19; wx < x + 20; wx += 5) rect(g, wx, v.GY - 48, 3, 3, '#5b6f92');
    for (const px of [l - 6, l + w + 4]) {
      rect(g, px, v.GY - 66, 2, 66, '#8b8496');
      rect(g, px - 4, v.GY - 70, 10, 5, '#fff6c9');
      if (Math.sin(v.t / 200) > 0) rect(g, px - 5, v.GY - 71, 12, 1, 'rgba(255,246,201,0.6)');
    }
  },
  skyline(g, v, x) {
    const blds = [[-70, 16, 44], [-52, 20, 64], [-30, 18, 92], [-10, 22, 58], [14, 16, 76], [32, 20, 50], [54, 18, 68]];
    blds.forEach(([dx, w, h], i) => {
      const bx = x + dx, c = ['#3a2a55', '#4a3668', '#2d2045'][i % 3];
      rect(g, bx, v.GY - h, w, h, c);
      for (let wy = v.GY - h + 4; wy < v.GY - 3; wy += 5) for (let wx = bx + 3; wx < bx + w - 3; wx += 4) {
        if ((wx * 7 + wy * 13 + i) % 5 !== 0) rect(g, wx, wy, 2, 2, '#ffd97a');
      }
    });
    rect(g, x - 22, v.GY - 104, 2, 12, '#3a2a55');
    if (Math.sin(v.t / 300) > 0) rect(g, x - 23, v.GY - 106, 4, 2, '#ff4d6a');
  },
  mesa(g, v, x) {
    const h = 58;
    for (let y = 0; y < h; y++) {
      const half = 55 + y * 0.35;
      const c = y % 9 === 4 ? '#9a4a32' : y % 9 === 1 ? '#d07a52' : '#b65a3c';
      rect(g, x - half, v.GY - h + y, half * 2, 1, c);
    }
    for (const cx of [x - 78, x + 74]) {
      rect(g, cx, v.GY - 16, 3, 16, '#3b7a3a');
      rect(g, cx - 4, v.GY - 11, 4, 2, '#3b7a3a');
      rect(g, cx - 4, v.GY - 15, 2, 5, '#3b7a3a');
    }
  },
  peaks(g, v, x) {
    const hm = Math.min(120, v.GY - 40);
    for (const [dx, f, c, d] of [[-60, 0.7, '#5d6f99', '#47577d'], [55, 0.8, '#5d6f99', '#47577d'], [0, 1, '#6a7cab', '#4f5f8c']]) {
      const h = hm * f, cx = x + dx;
      tri(g, cx, v.GY - h, v.GY, h * 0.8, c);
      g.fillStyle = d;
      for (let y = 0; y < h; y++) g.fillRect(R(cx), R(v.GY - h + y), R((h * 0.8 * (y + 1)) / h) + 1, 1);
      tri(g, cx, v.GY - h, v.GY - h + h * 0.28, h * 0.8 * 0.28, '#f2f6fc');
    }
  },
};

// ---------- world ----------
export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.sit = makeSprite(FROG_SIT, FROG_PAL);
    this.leapSprite = makeSprite(FROG_LEAP, FROG_PAL);
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.t = 0;
    this.camX = 0;
    this.shake = 0;
    this.particles = [];
    this.reset();
    this.resize();
    addEventListener('resize', () => this.resize());
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt, now);
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  reset() {
    this.biome = 'campus';
    this.prevBiome = null;
    this.fade = 1;
    this.frog = { x: 0, y: 0, airborne: false, squash: 0 };
    this.obstacles = [{ type: 'pond', x: 0 }];
    this.flight = null;
    this.camX = -this.frogScreenX();
  }

  frogScreenX() {
    return (this.W || 160) * 0.3;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.scale = Math.max(2, Math.min(7, Math.round(Math.min(w / 140, h / 170))));
    this.W = Math.ceil(w / this.scale);
    this.H = Math.ceil(h / this.scale);
    this.GY = this.H - Math.max(16, Math.round(this.H * 0.16));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.g.imageSmoothingEnabled = false;
  }

  setBiome(id) {
    if (!BIOMES[id] || id === this.biome) return;
    this.prevBiome = this.biome;
    this.biome = id;
    this.fade = 0;
  }

  // Animates one leap for a tier; resolves after the frog lands.
  leap(tier, { onApex } = {}) {
    const spec = LEAPS[tier] ?? LEAPS[0];
    const x0 = this.frog.x;
    const dist = spec.dist;
    const h = Math.min(spec.h, this.GY - 22);
    const dur = this.reduced ? Math.min(spec.dur, 600) : spec.dur;
    const center = x0 + dist / 2;
    this.obstacles.push({ type: spec.obstacle, x: spec.obstacle === 'puddle' ? x0 + dist : center, dist });
    this.obstacles = this.obstacles.filter((o) => o.x > this.camX - 400);
    return new Promise((resolve) => {
      this.flight = { tier, x0, dist, h, dur, start: null, crouch: 140, onApex, apexed: false, resolve };
    });
  }

  burst(x, y, n, colors, spread = 1, up = 1) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 60 * spread,
        vy: -Math.random() * 70 * up,
        life: 0.5 + Math.random() * 0.5,
        c: colors[i % colors.length],
      });
    }
  }

  update(dt, now) {
    this.t = now;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / 0.8);
    const f = this.frog;
    const fl = this.flight;
    if (fl) {
      if (fl.start === null) fl.start = now;
      const el = now - fl.start;
      if (el < fl.crouch) {
        f.squash = 2;
      } else {
        const p = Math.min(1, (el - fl.crouch) / fl.dur);
        f.squash = 0;
        f.airborne = p < 0.92;
        f.x = fl.x0 + fl.dist * p;
        f.y = -4 * fl.h * p * (1 - p);
        if (!fl.apexed && p >= 0.5) {
          fl.apexed = true;
          fl.onApex?.();
        }
        if (fl.tier === 6 && Math.random() < 0.6) this.burst(f.x, this.GY + f.y - 4, 1, ['#ffd86b', '#ff6b9a', '#ffffff'], 0.3, 0.2);
        if (p >= 1) {
          f.y = 0;
          f.airborne = false;
          f.squash = 2;
          if (fl.tier === 0) this.burst(f.x, this.GY, 16, ['#8cc8f0', '#3f86c9', '#ffffff'], 1.2, 1.6);
          else this.burst(f.x, this.GY, 6 + fl.tier * 2, ['#d9cdb5', '#bfae8f'], 1, 0.6);
          if (fl.tier >= 5 && !this.reduced) this.shake = fl.tier === 6 ? 4 : 2;
          this.flight = null;
          setTimeout(fl.resolve, 260);
        }
      }
    } else if (f.squash > 0) {
      f.squash = Math.max(0, f.squash - dt * 12);
    }
    const target = f.x - this.frogScreenX();
    this.camX += (target - this.camX) * Math.min(1, dt * (fl ? 5 : 3));
    this.shake = Math.max(0, this.shake - dt * 10);
    for (const p of this.particles) {
      p.vy += 160 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  view() {
    return { W: this.W, H: this.H, GY: this.GY, camX: this.camX, t: this.t };
  }

  drawScene(g, v, id) {
    const b = BIOMES[id];
    drawSky(g, v, b);
    b.far(g, v);
    b.mid(g, v);
    drawGround(g, v, b);
  }

  draw() {
    const g = this.g;
    const v = this.view();
    g.save();
    if (this.shake > 0) g.translate(R((Math.random() - 0.5) * this.shake), R((Math.random() - 0.5) * this.shake));
    if (this.prevBiome && this.fade < 1) {
      this.drawScene(g, v, this.prevBiome);
      g.globalAlpha = this.fade;
    }
    this.drawScene(g, v, this.biome);
    g.globalAlpha = 1;

    // Landmarks live in world space, same layer as the frog.
    g.save();
    g.translate(-R(this.camX), 0);
    for (const o of this.obstacles) OBSTACLES[o.type](g, v, o.x, o);
    g.restore();

    this.drawFrog(g);

    for (const p of this.particles) rect(g, p.x - this.camX, p.y, 1, 1, p.c);

    if (this.flight?.tier === 6 && this.frog.airborne && !this.reduced) {
      const r = rng(R(this.t / 60));
      for (let i = 0; i < 10; i++) rect(g, r() * this.W, r() * this.GY, 6 + r() * 14, 1, 'rgba(255,255,255,0.55)');
    }
    g.restore();
  }

  drawFrog(g) {
    const f = this.frog;
    const img = f.airborne ? this.leapSprite : this.sit;
    const sx = R(f.x - this.camX - img.width / 2);
    const squash = R(f.squash);
    const bob = !f.airborne && !this.flight && Math.sin(this.t / 600) > 0.92 ? 1 : 0;
    const h = img.height - squash - bob;
    // Shadow
    if (f.airborne) rect(g, sx + 3, this.GY, img.width - 6, 1, 'rgba(0,0,0,0.25)');
    g.drawImage(img, sx, R(this.GY + f.y - h + 1), img.width, h);
  }
}
