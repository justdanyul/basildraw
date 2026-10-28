// Geometric operations on objects: resize, rotate, slant, flip, align, group…

import {
  objMatrix, linearPart, apply, invert, mul, translate, rotate as rotM, objBounds, unionBounds,
  deg2rad, rad2deg, clamp, scale as scaleM,
} from './geometry.js';
import { clone, newId } from './model.js';
import { shapeGeometry, linePath } from './shapes.js';
import { updateTextMetrics } from './render.js';

const HANDLE_EDGES = {
  nw: ['l', 't'], n: [null, 't'], ne: ['r', 't'], e: ['r', null],
  se: ['r', 'b'], s: [null, 'b'], sw: ['l', 'b'], w: ['l', null],
};

// Scale the drawable content of an object when its box changes size.
export function scaleContent(o, sx, sy) {
  if (o.points) o.points = o.points.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

// Place an object whose local box changed from (0,0,w0,h0) to (l,t,r,b) in old local coords,
// keeping rotation/slant/flip and keeping the rest of the object fixed on the page.
export function placeLocalBox(o0, l, t, w, h) {
  const L = linearPart(o0);
  const c0 = { x: o0.w / 2, y: o0.h / 2 };
  const c1 = { x: w / 2, y: h / 2 };
  const v = apply(L, { x: l - c0.x + c1.x, y: t - c0.y + c1.y });
  return { x: v.x + o0.x + c0.x - c1.x, y: v.y + o0.y + c0.y - c1.y };
}

// Resize a single object by dragging a handle to page point p.
export function resizeObject(o, o0, handle, p, { keepRatio = false, fromCenter = false, minSize = 1 } = {}) {
  const P = apply(invert(objMatrix(o0)), p);
  const [ex, ey] = HANDLE_EDGES[handle];
  let l = 0, t = 0, r = o0.w, b = o0.h;
  const isLine = o0.type === 'line';
  const min = isLine ? 0 : minSize;
  if (ex === 'l') l = Math.min(P.x, r - min);
  if (ex === 'r') r = Math.max(P.x, l + min);
  if (ey === 't') t = Math.min(P.y, b - min);
  if (ey === 'b') b = Math.max(P.y, t + min);
  if (fromCenter) {
    if (ex === 'l') r = o0.w + (0 - l);
    if (ex === 'r') l = -(r - o0.w);
    if (ey === 't') b = o0.h + (0 - t);
    if (ey === 'b') t = -(b - o0.h);
  }
  let w = r - l, h = b - t;
  if (keepRatio && o0.w > 0 && o0.h > 0) {
    const ratio = o0.w / o0.h;
    if (ex && ey) {
      const s = Math.max(w / o0.w, h / o0.h);
      w = o0.w * s; h = o0.h * s;
    } else if (ex) {
      h = w / ratio;
    } else {
      w = h * ratio;
    }
    if (ex === 'l') l = r - w; else if (!ex) l = (o0.w - w) / 2;
    if (ey === 't') t = b - h; else if (!ey) t = (o0.h - h) / 2;
    if (fromCenter) { l = (o0.w - w) / 2; t = (o0.h - h) / 2; }
  }
  const pos = placeLocalBox(o0, l, t, w, h);
  o.x = pos.x; o.y = pos.y; o.w = w; o.h = h;
  if (o0.points) {
    const sx = o0.w ? w / o0.w : 1, sy = o0.h ? h / o0.h : 1;
    o.points = o0.points.map((pt) => ({ x: pt.x * sx, y: pt.y * sy }));
  }
}

// Resize several objects as a block, given old and new selection bounds.
export function resizeMany(objs, originals, ob, nb) {
  const sx = ob.w ? nb.w / ob.w : 1, sy = ob.h ? nb.h / ob.h : 1;
  objs.forEach((o, i) => {
    const o0 = originals[i];
    const cx = o0.x + o0.w / 2, cy = o0.y + o0.h / 2;
    const ncx = nb.x + (cx - ob.x) * sx, ncy = nb.y + (cy - ob.y) * sy;
    o.w = o0.w * sx; o.h = o0.h * sy;
    o.x = ncx - o.w / 2; o.y = ncy - o.h / 2;
    if (o0.points) o.points = o0.points.map((pt) => ({ x: pt.x * sx, y: pt.y * sy }));
  });
}

export function centerOf(o) {
  return apply(objMatrix(o), { x: o.w / 2, y: o.h / 2 });
}

export function moveCenterTo(o, c) {
  const cur = centerOf(o);
  o.x += c.x - cur.x;
  o.y += c.y - cur.y;
}

// Rotate objects by delta degrees about pivot.
export function rotateObjects(objs, originals, delta, pivot) {
  const R = mul(mul(translate(pivot.x, pivot.y), rotM(delta)), translate(-pivot.x, -pivot.y));
  objs.forEach((o, i) => {
    const o0 = originals[i];
    o.rot = normAngle((o0.rot || 0) + delta);
    o.x = o0.x; o.y = o0.y;
    const c = apply(R, centerOf(o0));
    moveCenterTo(o, c);
  });
}

export function normAngle(a) {
  a %= 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return Math.round(a * 1000) / 1000;
}

// Slant a single object by dragging a side handle (in Rotate/Slant mode).
export function slantObject(o, o0, handle, start, p) {
  const back = rotM(-(o0.rot || 0));
  const d = apply(back, { x: p.x - start.x, y: p.y - start.y });
  if (handle === 'n' || handle === 's') {
    const sign = handle === 'n' ? -1 : 1;
    const t0 = Math.tan(deg2rad(o0.skx || 0));
    o.skx = clamp(rad2deg(Math.atan(t0 + sign * d.x / Math.max(o0.h / 2, 1))), -80, 80);
  } else {
    const sign = handle === 'w' ? -1 : 1;
    const t0 = Math.tan(deg2rad(o0.sky || 0));
    o.sky = clamp(rad2deg(Math.atan(t0 + sign * d.y / Math.max(o0.w / 2, 1))), -80, 80);
  }
}

export function selectionBounds(objs) {
  return unionBounds(objs.map(objBounds));
}

export function flipObjects(objs, horizontal) {
  const b = selectionBounds(objs);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  for (const o of objs) {
    const c = centerOf(o);
    o.rot = normAngle(-(o.rot || 0));
    o.skx = -(o.skx || 0);
    o.sky = -(o.sky || 0);
    if (horizontal) o.fh = !o.fh; else o.fv = !o.fv;
    moveCenterTo(o, horizontal ? { x: 2 * cx - c.x, y: c.y } : { x: c.x, y: 2 * cy - c.y });
  }
}

export function rotateBy(objs, delta) {
  const b = selectionBounds(objs);
  const pivot = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const originals = objs.map(clone);
  rotateObjects(objs, originals, delta, pivot);
}

export function moveObjects(objs, dx, dy) {
  for (const o of objs) { o.x += dx; o.y += dy; }
}

// ---------- align / space / center ----------
export function alignObjects(objs, how, page) {
  if (!objs.length) return;
  const sel = selectionBounds(objs);
  const ref = objs.length === 1 || how === 'pagecenter' || how === 'pagemiddle'
    ? { x: 0, y: 0, w: page.width, h: page.height }
    : sel;
  for (const o of objs) {
    const b = objBounds(o);
    let dx = 0, dy = 0;
    switch (how) {
      case 'left': dx = ref.x - b.x; break;
      case 'center': case 'pagecenter': dx = ref.x + ref.w / 2 - (b.x + b.w / 2); break;
      case 'right': dx = ref.x + ref.w - (b.x + b.w); break;
      case 'top': dy = ref.y - b.y; break;
      case 'middle': case 'pagemiddle': dy = ref.y + ref.h / 2 - (b.y + b.h / 2); break;
      case 'bottom': dy = ref.y + ref.h - (b.y + b.h); break;
      default: break;
    }
    o.x += dx; o.y += dy;
  }
}

export function spaceObjects(objs, how) {
  if (objs.length < 3) return;
  const horizontal = how.endsWith('H');
  const items = objs.map((o) => ({ o, b: objBounds(o) }));
  items.sort((a, b) => (horizontal ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = items[0].b, last = items[items.length - 1].b;
  if (how.startsWith('centers')) {
    const c1 = horizontal ? first.x + first.w / 2 : first.y + first.h / 2;
    const c2 = horizontal ? last.x + last.w / 2 : last.y + last.h / 2;
    const step = (c2 - c1) / (items.length - 1);
    items.forEach((it, i) => {
      const c = horizontal ? it.b.x + it.b.w / 2 : it.b.y + it.b.h / 2;
      const d = c1 + step * i - c;
      if (horizontal) it.o.x += d; else it.o.y += d;
    });
  } else {
    const start = horizontal ? first.x : first.y;
    const end = horizontal ? last.x + last.w : last.y + last.h;
    const total = items.reduce((s, it) => s + (horizontal ? it.b.w : it.b.h), 0);
    const gap = (end - start - total) / (items.length - 1);
    let pos = start;
    for (const it of items) {
      const cur = horizontal ? it.b.x : it.b.y;
      if (horizontal) it.o.x += pos - cur; else it.o.y += pos - cur;
      pos += (horizontal ? it.b.w : it.b.h) + gap;
    }
  }
}

export function centerOnPage(objs, page) {
  if (!objs.length) return;
  const b = selectionBounds(objs);
  const dx = page.width / 2 - (b.x + b.w / 2), dy = page.height / 2 - (b.y + b.h / 2);
  moveObjects(objs, dx, dy);
}

// ---------- grouping ----------
export function makeGroup(objs, layer) {
  const b = selectionBounds(objs);
  const children = objs.map((o) => {
    const c = clone(o);
    c.x -= b.x; c.y -= b.y;
    return c;
  });
  return {
    id: newId('g'), type: 'group', kind: 'group', layer, name: '',
    x: b.x, y: b.y, w: Math.max(b.w, 1), h: Math.max(b.h, 1), baseW: Math.max(b.w, 1), baseH: Math.max(b.h, 1),
    rot: 0, skx: 0, sky: 0, fh: false, fv: false, children,
    fill: clone(objs[0].fill), line: clone(objs[0].line), ends: clone(objs[0].ends),
    shadow: { style: 'none', color: '#808080' }, text: clone(objs[0].text), label: '',
  };
}

export function ungroup(g) {
  const sx = g.w / (g.baseW || 1), sy = g.h / (g.baseH || 1);
  const Gm = mul(objMatrix(g), scaleM(sx, sy));
  const sameSign = (g.fh ? -1 : 1) * (g.fv ? -1 : 1);
  return g.children.map((c0) => {
    const c = clone(c0);
    const center = apply(Gm, { x: c0.x + c0.w / 2, y: c0.y + c0.h / 2 });
    const k = Math.abs(sx), m = Math.abs(sy);
    c.w = c0.w * k; c.h = c0.h * m;
    scaleContent(c, k, m);
    if (c.type === 'text') { /* nw/nh stay; scale comes from w/nw */ }
    if (c.type === 'path' || c.type === 'group') { /* baseW/H stay */ }
    c.rot = normAngle(sameSign * (c0.rot || 0) + (g.rot || 0));
    if (g.fh) c.fh = !c.fh;
    if (g.fv) c.fv = !c.fv;
    c.skx = (c0.skx || 0) + (g.skx || 0);
    c.sky = (c0.sky || 0) + (g.sky || 0);
    c.layer = g.layer;
    c.x = center.x - c.w / 2; c.y = center.y - c.h / 2;
    return c;
  });
}

// Give every object (and nested child) a fresh id.
export function reId(o) {
  o.id = newId(o.type === 'group' ? 'g' : 'o');
  if (o.children) o.children.forEach(reId);
  return o;
}

// ---------- convert to curves ----------
export function toCurves(o) {
  if (o.type === 'shape') {
    const g = shapeGeometry(o);
    let d = g.main;
    for (const e of g.edges || []) d += ' ' + e;
    return { ...o, type: 'path', kind: 'path', d, baseW: Math.max(o.w, 0.01), baseH: Math.max(o.h, 0.01), closed: true, evenodd: !!g.evenodd, points: undefined };
  }
  if (o.type === 'line') {
    return { ...o, type: 'path', kind: 'path', d: linePath(o), baseW: Math.max(o.w, 0.01), baseH: Math.max(o.h, 0.01), closed: false, points: undefined };
  }
  return o;
}

// Re-fit an object's box around a new set of local points (after editing points).
export function refitPoints(o, localPts) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of localPts) {
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
  }
  const w = x2 - x1, h = y2 - y1;
  const pos = placeLocalBox(o, x1, y1, w, h);
  o.x = pos.x; o.y = pos.y; o.w = w; o.h = h;
  o.points = localPts.map((p) => ({ x: p.x - x1, y: p.y - y1 }));
}

// Build a line/polygon object from page-space points.
export function setPagePoints(o, pts) {
  const x1 = Math.min(...pts.map((p) => p.x)), y1 = Math.min(...pts.map((p) => p.y));
  const x2 = Math.max(...pts.map((p) => p.x)), y2 = Math.max(...pts.map((p) => p.y));
  o.x = x1; o.y = y1; o.w = x2 - x1; o.h = y2 - y1;
  o.rot = 0; o.skx = 0; o.sky = 0; o.fh = false; o.fv = false;
  o.points = pts.map((p) => ({ x: p.x - x1, y: p.y - y1 }));
}

export function pagePoints(o) {
  const m = objMatrix(o);
  return (o.points || []).map((p) => apply(m, p));
}

export { updateTextMetrics };
