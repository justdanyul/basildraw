// Blend: morph one object into another through a number of in-between steps,
// blending both the outline and the colours.

import { objMatrix, apply, mul, scale as scaleM, boundsOfPoints, f } from './geometry.js';
import { shapeGeometry, linePath } from './shapes.js';
import { newId } from './model.js';
import { mix } from './palette.js';

const SAMPLES = 120;
const SVGNS = 'http://www.w3.org/2000/svg';
let scratch = null;

export function canBlend(o) {
  return o && (o.type === 'shape' || o.type === 'line' || o.type === 'path');
}

function isClosed(o) {
  if (o.type === 'line') return false;
  if (o.type === 'path') return o.closed !== false;
  return true;
}

// Sample an object's outline as page-space points.
export function samplePoints(o, n = SAMPLES) {
  let d, m = objMatrix(o);
  if (o.type === 'shape') {
    const g = shapeGeometry(o);
    d = g.main;
    if (g.mainTransform) {
      const t = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.mainTransform);
      if (t) m = mul(m, [1, 0, 0, 1, Number(t[1]), Number(t[2])]);
    }
  } else if (o.type === 'line') {
    d = linePath(o);
  } else {
    d = o.d;
    m = mul(m, scaleM(o.w / (o.baseW || 1), o.h / (o.baseH || 1)));
  }
  if (!scratch) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute'; svg.style.left = '-9999px';
    scratch = document.createElementNS(SVGNS, 'path');
    svg.appendChild(scratch);
    document.body.appendChild(svg);
  }
  // Use only the first sub-path (the outline); inner details don't morph well.
  const first = d.replace(/^\s*M/i, 'M').split(/(?=[Mm])/)[0];
  scratch.setAttribute('d', first);
  const len = scratch.getTotalLength() || 1;
  const closed = isClosed(o);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = closed ? (i / n) * len : (i / (n - 1)) * len;
    const p = scratch.getPointAtLength(t);
    pts.push(apply(m, { x: p.x, y: p.y }));
  }
  return pts;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
function centroid(pts) {
  const c = { x: 0, y: 0 };
  for (const p of pts) { c.x += p.x; c.y += p.y; }
  return { x: c.x / pts.length, y: c.y / pts.length };
}

// Line up the second outline with the first so the morph doesn't twist.
function align(A, B, closed) {
  if (!closed) {
    const d1 = Math.hypot(A[0].x - B[0].x, A[0].y - B[0].y) + Math.hypot(A.at(-1).x - B.at(-1).x, A.at(-1).y - B.at(-1).y);
    const d2 = Math.hypot(A[0].x - B.at(-1).x, A[0].y - B.at(-1).y) + Math.hypot(A.at(-1).x - B[0].x, A.at(-1).y - B[0].y);
    return d2 < d1 ? B.slice().reverse() : B;
  }
  let b = B;
  if (Math.sign(signedArea(A)) !== Math.sign(signedArea(B))) b = B.slice().reverse();
  const ca = centroid(A), cb = centroid(b);
  const n = A.length;
  let best = 0, bestCost = Infinity;
  for (let k = 0; k < n; k += 1) {
    let cost = 0;
    for (let i = 0; i < n; i += 3) {
      const p = A[i], q = b[(i + k) % n];
      const dx = (p.x - ca.x) - (q.x - cb.x), dy = (p.y - ca.y) - (q.y - cb.y);
      cost += dx * dx + dy * dy;
      if (cost > bestCost) break;
    }
    if (cost < bestCost) { bestCost = cost; best = k; }
  }
  return A.map((_, i) => b[(i + best) % n]);
}

function fillColor(o) {
  const fl = o.fill;
  if (!fl || fl.style === 'none' || o.type === 'line') return null;
  if (fl.style === 'solid') return fl.color;
  if (fl.style === 'pattern') return fl.bg;
  if (fl.style === 'gradient') return mix(fl.start, fl.end, 0.5);
  return null;
}

// Build the in-between objects. Returns an array of new path objects (back to front).
export function blendObjects(a, b, { steps = 10, colors = true } = {}) {
  const closed = isClosed(a) && isClosed(b);
  const A = samplePoints(a);
  const B = align(A, samplePoints(b), closed);
  const fa = fillColor(a), fb = fillColor(b);
  const lineA = a.line || {}, lineB = b.line || {};
  const out = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / (steps + 1);
    const pts = A.map((p, i) => ({ x: p.x + (B[i].x - p.x) * t, y: p.y + (B[i].y - p.y) * t }));
    const bb = boundsOfPoints(pts);
    const w = Math.max(bb.w, 0.01), h = Math.max(bb.h, 0.01);
    let d = 'M' + pts.map((p) => `${f(p.x - bb.x)} ${f(p.y - bb.y)}`).join(' L');
    if (closed) d += ' Z';
    const ct = colors ? t : 0;
    let fill = { ...a.fill, style: 'none' };
    if (closed && (fa || fb)) fill = { ...a.fill, style: 'solid', color: mix(fa || fb, fb || fa, ct) };
    const hasLine = lineA.style !== 'none' || lineB.style !== 'none';
    const wa = lineA.style === 'wide' ? lineA.width : lineA.style === 'hairline' ? 0.75 : 0;
    const wb = lineB.style === 'wide' ? lineB.width : lineB.style === 'hairline' ? 0.75 : 0;
    const width = wa + (wb - wa) * t;
    const line = {
      ...lineA,
      style: !hasLine ? 'none' : width <= 0.8 ? 'hairline' : 'wide',
      width: Math.max(width, 0.25),
      color: mix(lineA.style === 'none' ? lineB.color : lineA.color, lineB.style === 'none' ? lineA.color : lineB.color, ct),
    };
    out.push({
      id: newId(), type: 'path', kind: 'path', layer: a.layer, name: '',
      x: bb.x, y: bb.y, w, h, baseW: w, baseH: h, d, closed,
      rot: 0, skx: 0, sky: 0, fh: false, fv: false,
      fill, line, ends: { start: 0, end: 0, size: 'medium' }, shadow: { style: 'none', color: '#808080' },
      text: { ...a.text }, label: '',
    });
  }
  return out;
}
