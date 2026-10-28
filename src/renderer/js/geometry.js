// Geometry helpers: units, 2D affine matrices, object transforms, bounds.

export const PX_PER_CM = 96 / 2.54;
export const PX_PER_PT = 96 / 72;
export const PX_PER_IN = 96;

export const cm = (px) => px / PX_PER_CM;
export const fromCm = (c) => c * PX_PER_CM;

export const deg2rad = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

// Matrices are [a, b, c, d, e, f] as in SVG: x' = a x + c y + e, y' = b x + d y + f
export const I = () => [1, 0, 0, 1, 0, 0];
export function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export const translate = (x, y) => [1, 0, 0, 1, x, y];
export const scale = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
export function rotate(deg) {
  const r = deg2rad(deg);
  const c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}
export const skewX = (deg) => [1, 0, Math.tan(deg2rad(deg)), 1, 0, 0];
export const skewY = (deg) => [1, Math.tan(deg2rad(deg)), 0, 1, 0, 0];
export function apply(m, p) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return I();
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
export const matStr = (m) => `matrix(${m.map((v) => round(v, 5)).join(' ')})`;

// The linear part of an object's transform (rotation, slant, flips), about its centre.
export function linearPart(o) {
  let m = I();
  if (o.rot) m = mul(m, rotate(o.rot));
  if (o.skx) m = mul(m, skewX(o.skx));
  if (o.sky) m = mul(m, skewY(o.sky));
  if (o.fh || o.fv) m = mul(m, scale(o.fh ? -1 : 1, o.fv ? -1 : 1));
  return m;
}

// Local box (0..w, 0..h) -> page coordinates.
export function objMatrix(o) {
  const cx = o.w / 2, cy = o.h / 2;
  return mul(mul(translate(o.x + cx, o.y + cy), linearPart(o)), translate(-cx, -cy));
}

export function isAxisAligned(o) {
  return !o.rot && !o.skx && !o.sky;
}

export function objCorners(o) {
  const m = objMatrix(o);
  return [
    apply(m, { x: 0, y: 0 }),
    apply(m, { x: o.w, y: 0 }),
    apply(m, { x: o.w, y: o.h }),
    apply(m, { x: 0, y: o.h }),
  ];
}

export function boundsOfPoints(pts) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  if (x1 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function objBounds(o) {
  return boundsOfPoints(objCorners(o));
}

export function unionBounds(list) {
  const pts = [];
  for (const b of list) {
    pts.push({ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h });
  }
  return boundsOfPoints(pts);
}

export function rectContains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function normRect(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Snap an angle (degrees) to the nearest multiple of step.
export function snapAngle(deg, step) {
  return Math.round(deg / step) * step;
}

// Constrain point p relative to origin o so the direction is a multiple of step degrees.
export function constrainDirection(o, p, step = 45) {
  const ang = Math.atan2(p.y - o.y, p.x - o.x);
  const a = deg2rad(snapAngle(rad2deg(ang), step));
  const len = dist(o, p);
  return { x: o.x + Math.cos(a) * len, y: o.y + Math.sin(a) * len };
}

// Catmull-Rom spline through points, returned as SVG path commands (after an initial M).
export function smoothPath(pts, closed = false) {
  if (pts.length < 2) return '';
  if (pts.length === 2 && !closed) return `M${f(pts[0].x)} ${f(pts[0].y)} L${f(pts[1].x)} ${f(pts[1].y)}`;
  const n = pts.length;
  const get = (i) => {
    if (closed) return pts[(i + n) % n];
    return pts[clamp(i, 0, n - 1)];
  };
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  if (closed) d += ' Z';
  return d;
}

export const f = (v) => round(v, 2);

// Ramer–Douglas–Peucker simplification for freehand strokes.
export function simplify(points, tolerance = 1.5) {
  if (points.length < 3) return points.slice();
  const sqTol = tolerance * tolerance;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDistSq(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sqTol && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
function segDistSq(p, a, b) {
  let x = a.x, y = a.y, dx = b.x - x, dy = b.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b.x; y = b.y; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p.x - x; dy = p.y - y;
  return dx * dx + dy * dy;
}
