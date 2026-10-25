// Everything you'd want to edit between events lives here.
// Answer sets are generated: edit data/sources/<slug>.json, then run `npm run build-answers`.
// /api/config only sends prompt text and tiers, never answers.

export const EVENT = {
  id: 'bis-speaker-2026-fall', // change per event so returning students start fresh
  name: 'BIS Speaker Series',
  tagline: '7 prompts · 25 seconds each · rarer answers leap farther',
};

export const SETTINGS = {
  secondsPerPrompt: 25,
  countdownSeconds: 3,
};

// Each slug matches config/answers/<slug>.json.
export const PROMPTS = [
  { slug: 'careers', text: 'Name a career you can go into as a BIS major' },
  { slug: 'double-majors', text: 'Name a major you could double with BIS' },
  { slug: 'excel', text: 'Name an Excel function' },
  { slug: 'languages', text: 'Name a programming or query language' },
  { slug: 'data-tools', text: 'Name a data or BI tool' },
  { slug: 'cyber-threats', text: 'Name a cybersecurity threat' },
  { slug: 'companies', text: 'Name a company that hires BIS grads' },
];

// id 0 is a miss. miles drives the frog's journey west from campus.
export const TIERS = [
  { id: 0, name: 'Splash', points: 0, miles: 0, color: '#6f7d8c', landmark: 'a puddle', flavor: 'Splash! Missed the lily pad.' },
  { id: 1, name: 'Pond Hopper', points: 10, miles: 0.05, color: '#a9b4c2', landmark: 'the lily pads', flavor: 'Lily pad to lily pad.' },
  { id: 2, name: 'Fountain Leaper', points: 20, miles: 0.4, color: '#7bd389', landmark: 'Frog Fountain', flavor: 'Solid. Hops with the crowd.' },
  { id: 3, name: 'Stadium Clearer', points: 35, miles: 3, color: '#5ec8e5', landmark: 'the stadium', flavor: 'Clean leap over the stands.' },
  { id: 4, name: 'Skyline Jumper', points: 60, miles: 15, color: '#c09bff', landmark: 'the Fort Worth skyline', flavor: 'Genuinely uncommon. Nice leap.' },
  { id: 5, name: 'Lone Star Legend', points: 85, miles: 60, color: '#f2c14e', landmark: 'the West Texas mesas', flavor: 'Barely anyone said that.' },
  { id: 6, name: 'Super Frog', points: 100, miles: 200, color: '#ff6b9a', landmark: 'the mountains', flavor: 'One in a million. Legendary.' },
];

// The route west from campus. A perfect game (7 x 200 mi) reaches the Pacific.
export const MILESTONES = [
  { miles: 0, name: 'the Frog pond' },
  { miles: 0.1, name: 'Frog Fountain' },
  { miles: 0.4, name: 'Amon G. Carter Stadium' },
  { miles: 1, name: 'the edge of campus' },
  { miles: 3, name: 'Downtown Fort Worth' },
  { miles: 5, name: 'the Stockyards' },
  { miles: 30, name: 'Weatherford' },
  { miles: 75, name: 'Ranger' },
  { miles: 150, name: 'Abilene' },
  { miles: 300, name: 'Midland' },
  { miles: 400, name: 'Pecos' },
  { miles: 520, name: 'Van Horn' },
  { miles: 600, name: 'El Paso' },
  { miles: 870, name: 'Tucson' },
  { miles: 980, name: 'Phoenix' },
  { miles: 1250, name: 'Palm Springs' },
  { miles: 1360, name: 'Los Angeles' },
  { miles: 1400, name: 'the Pacific Ocean' },
];

// Scenery the frog travels through, by total miles.
export const BIOMES = [
  { from: 0, id: 'campus' },
  { from: 1, id: 'city' },
  { from: 8, id: 'prairie' },
  { from: 120, id: 'plains' },
  { from: 450, id: 'desert' },
  { from: 950, id: 'mountains' },
  { from: 1300, id: 'coast' },
];
