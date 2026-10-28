// The 11 x 6 colour palette, with friendly names.

const HUES = [
  ['Red', 0], ['Orange', 28], ['Yellow', 56], ['Lime', 84], ['Green', 115], ['Aqua', 180],
  ['Sky Blue', 210], ['Blue', 235], ['Violet', 265], ['Magenta', 300], ['Rose', 335],
];

function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const fn = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${hex(fn(0))}${hex(fn(8))}${hex(fn(4))}`;
}

export const PALETTE = [];
// Row 1: greys
const greys = ['White', 'Grey 10%', 'Grey 25%', 'Grey 40%', 'Grey 50%', 'Grey 60%', 'Grey 70%', 'Grey 80%', 'Grey 85%', 'Grey 90%', 'Black'];
const greyVals = [255, 224, 192, 160, 138, 120, 100, 80, 60, 32, 0];
PALETTE.push(greys.map((name, i) => {
  const v = greyVals[i].toString(16).padStart(2, '0');
  return { name, color: `#${v}${v}${v}` };
}));
// Rows 2-6: hues at different tones
const tones = [
  { prefix: '', s: 90, l: 50 },
  { prefix: 'Pale ', s: 80, l: 90 },
  { prefix: 'Light ', s: 80, l: 75 },
  { prefix: 'Dusty ', s: 45, l: 45 },
  { prefix: 'Dark ', s: 75, l: 26 },
];
for (const t of tones) {
  PALETTE.push(HUES.map(([name, h]) => ({ name: t.prefix + name, color: hsl(h, t.s, t.l) })));
}
// A few classic names people expect
PALETTE[5][7].name = 'Navy Blue';
PALETTE[5][4].name = 'Forest Green';
PALETTE[5][0].name = 'Maroon';

const NAME_BY_COLOR = new Map();
for (const row of PALETTE) for (const c of row) NAME_BY_COLOR.set(c.color.toLowerCase(), c.name);

export function colorName(color) {
  if (!color || color === 'none') return 'Transparent';
  return NAME_BY_COLOR.get(color.toLowerCase()) || color.toUpperCase();
}

function parseHex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}
export function lighter(c, amt = 0.2) {
  return toHex(parseHex(c).map((v) => v + (255 - v) * amt));
}
export function darker(c, amt = 0.2) {
  return toHex(parseHex(c).map((v) => v * (1 - amt)));
}
export function mix(c1, c2, t) {
  const a = parseHex(c1), b = parseHex(c2);
  return toHex(a.map((v, i) => v + (b[i] - v) * t));
}
