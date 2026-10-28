// Shape library. Every closed shape is generated for a local box (0..w, 0..h).
// A generator returns:
//   { main: d, pre?: [{d, shade}], post?: [{d, shade}], edges?: [d], open?: bool, evenodd?: bool }
// shade: positive = lighten (white overlay), negative = darken (black overlay).

import { smoothPath, f } from './geometry.js';

export const SHAPE_INFO = {
  // Shapes
  square: { name: 'Square', group: 'shapes', constrain: true },
  rect: { name: 'Rectangle', group: 'shapes' },
  polygon: { name: 'Polygon', group: 'shapes', clicks: true },
  circle: { name: 'Circle', group: 'shapes', constrain: true },
  roundsquare: { name: 'Rounded Square', group: 'shapes', constrain: true },
  roundrect: { name: 'Rounded Rectangle', group: 'shapes' },
  smoothpolygon: { name: 'Smoothed Polygon', group: 'shapes', clicks: true },
  ellipse: { name: 'Ellipse', group: 'shapes' },
  // CoolShapes
  triangle: { name: 'Triangle', group: 'cool' },
  pentagon: { name: 'Pentagon', group: 'cool' },
  hexagon: { name: 'Hexagon', group: 'cool' },
  star: { name: 'Star', group: 'cool' },
  starburst: { name: 'Starburst', group: 'cool' },
  blockarrow: { name: 'Arrow', group: 'cool' },
  cube: { name: 'Cube', group: 'cool' },
  pyramid: { name: 'Pyramid', group: 'cool' },
  cylinder: { name: 'Cylinder', group: 'cool' },
  prism: { name: 'Prism', group: 'cool' },
  cone: { name: 'Cone', group: 'cool' },
  megagon: { name: 'Megagon', group: 'cool' },
  curveygon: { name: 'Curveygon', group: 'cool' },
  // Borders
  borderframe: { name: 'Border Frame', group: 'borders' },
  borderline: { name: 'Border Line', group: 'borders' },
  // ArrowShapes
  arrow1: { name: 'One-way Arrow', group: 'arrows' },
  arrow1_3d: { name: 'One-way 3D Arrow', group: 'arrows' },
  arrow2: { name: 'Two-way Arrow', group: 'arrows' },
  arrow2_3d: { name: 'Two-way 3D Arrow', group: 'arrows' },
  angled: { name: 'Angled Arrow', group: 'arrows' },
  angled_3d: { name: 'Angled 3D Arrow', group: 'arrows' },
  curved: { name: 'Curved Arrow', group: 'arrows' },
  curved_3d: { name: 'Curved 3D Arrow', group: 'arrows' },
  arrow3way: { name: 'Three-way Arrow', group: 'arrows' },
  arrow4way: { name: 'Four-way Arrow', group: 'arrows' },
  notched: { name: 'Custom Arrow', group: 'arrows' },
};

export const LINE_INFO = {
  straight: { name: 'Straight Line' },
  polyline: { name: 'Polyline', clicks: true },
  rightangle: { name: 'Right-Angle Line' },
  arc: { name: 'Arc' },
  curve: { name: 'Curve', clicks: true },
  freehand: { name: 'Freehand Line' },
};

export const GROUPS = {
  lines: ['straight', 'polyline', 'rightangle', 'arc', 'curve', 'freehand'],
  shapes: ['square', 'rect', 'polygon', 'circle', 'roundsquare', 'roundrect', 'smoothpolygon', 'ellipse'],
  cool: ['triangle', 'pentagon', 'hexagon', 'star', 'starburst', 'blockarrow', 'cube', 'pyramid',
    'cylinder', 'prism', 'cone', 'megagon', 'curveygon'],
  borders: ['borderframe', 'borderline'],
  arrows: ['arrow1', 'arrow1_3d', 'arrow2', 'arrow2_3d', 'angled', 'angled_3d', 'curved', 'curved_3d',
    'arrow3way', 'arrow4way', 'notched'],
};

const poly = (pts) => 'M' + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L') + ' Z';

// Points of a star/regular polygon fitted exactly to the box.
function radial(n, w, h, inner = null, start = -90) {
  const raw = [];
  const steps = inner == null ? n : n * 2;
  for (let i = 0; i < steps; i++) {
    const a = ((start + (360 / steps) * i) * Math.PI) / 180;
    const r = inner != null && i % 2 === 1 ? inner : 1;
    raw.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return fit(raw, w, h);
}
function fit(raw, w, h) {
  const xs = raw.map((p) => p[0]), ys = raw.map((p) => p[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
  const sx = x2 - x1 || 1, sy = y2 - y1 || 1;
  return raw.map(([x, y]) => [((x - x1) / sx) * w, ((y - y1) / sy) * h]);
}

function rectPath(x, y, w, h) {
  return `M${f(x)} ${f(y)} H${f(x + w)} V${f(y + h)} H${f(x)} Z`;
}
function roundRectPath(w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${f(r)} 0 H${f(w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} V${f(h - r)} ` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)} H${f(r)} A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)} ` +
    `V${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`;
}
function ellipsePath(w, h) {
  const rx = w / 2, ry = h / 2;
  return `M0 ${f(ry)} A${f(rx)} ${f(ry)} 0 1 1 ${f(w)} ${f(ry)} A${f(rx)} ${f(ry)} 0 1 1 0 ${f(ry)} Z`;
}

// Block arrows -----------------------------------------------------------
function oneWay(w, h) {
  const hx = w - Math.min(w * 0.4, h * 0.9);
  return [[0, h * 0.27], [hx, h * 0.27], [hx, 0], [w, h / 2], [hx, h], [hx, h * 0.73], [0, h * 0.73]];
}
function twoWay(w, h) {
  const hl = Math.min(w * 0.3, h * 0.9);
  return [[0, h / 2], [hl, 0], [hl, h * 0.27], [w - hl, h * 0.27], [w - hl, 0], [w, h / 2],
    [w - hl, h], [w - hl, h * 0.73], [hl, h * 0.73], [hl, h]];
}
function angled(w, h) {
  const hw = w * 0.35, hh = h * 0.28, t = h * 0.22, tv = w * 0.26;
  return [[0, h], [0, hh - t / 2], [w - hw, hh - t / 2], [w - hw, 0], [w, hh], [w - hw, 2 * hh],
    [w - hw, hh + t / 2], [tv, hh + t / 2], [tv, h]];
}
function curvedArrowPath(w, h) {
  const hw = w * 0.35, hh = h * 0.28, t = h * 0.22, tv = w * 0.26;
  const top = hh - t / 2, bot = hh + t / 2;
  const R = Math.min(w - hw, h - top) * 0.8;
  const r = Math.max(R - Math.min(tv, t), 0);
  return `M0 ${f(h)} V${f(top + R)} Q0 ${f(top)} ${f(R)} ${f(top)} H${f(w - hw)} V0 L${f(w)} ${f(hh)} ` +
    `L${f(w - hw)} ${f(2 * hh)} V${f(bot)} H${f(tv + r)} Q${f(tv)} ${f(bot)} ${f(tv)} ${f(bot + r)} V${f(h)} Z`;
}
function multiWay(w, h, arms) {
  const s = Math.min(w, h);
  const t = s * 0.11, hl = s * 0.24, hw = s * 0.21;
  const cx = w / 2;
  const cy = arms === 3 ? h - t : h / 2;
  const pts = [];
  // right arm
  pts.push([w - hl, cy - t], [w - hl, cy - hw], [w, cy], [w - hl, cy + hw], [w - hl, cy + t]);
  if (arms === 4) {
    pts.push([cx + t, cy + t], [cx + t, h - hl], [cx + hw, h - hl], [cx, h], [cx - hw, h - hl],
      [cx - t, h - hl], [cx - t, cy + t]);
  }
  // left arm
  pts.push([hl, cy + t], [hl, cy + hw], [0, cy], [hl, cy - hw], [hl, cy - t]);
  // top arm
  pts.push([cx - t, cy - t], [cx - t, hl], [cx - hw, hl], [cx, 0], [cx + hw, hl], [cx + t, hl], [cx + t, cy - t]);
  return pts;
}
function notched(w, h) {
  const hx = w - Math.min(w * 0.4, h * 0.9);
  const n = Math.min(w * 0.18, h * 0.4);
  return [[0, h * 0.2], [hx, h * 0.2], [hx, 0], [w, h / 2], [hx, h], [hx, h * 0.8], [0, h * 0.8], [n, h / 2]];
}

// Extrude a polygon (given as a function of w,h) to look 3D.
function extruded(fn, w, h) {
  const d = Math.min(w, h) * 0.14;
  const front = fn(w - d, h - d).map(([x, y]) => [x, y + d]);
  const back = front.map(([x, y]) => [x + d, y - d]);
  const pre = [{ d: poly(back), shade: -0.35 }];
  for (let i = 0; i < front.length; i++) {
    const j = (i + 1) % front.length;
    pre.push({ d: poly([front[i], front[j], back[j], back[i]]), shade: -0.25 });
  }
  return { main: poly(front), pre };
}
// 3D solids ----------------------------------------------------------------
function cube(w, h) {
  const d = Math.min(w, h) * 0.28;
  return {
    main: poly([[0, d], [d, 0], [w, 0], [w, h - d], [w - d, h], [0, h]]),
    post: [
      { d: poly([[0, d], [d, 0], [w, 0], [w - d, d]]), shade: 0.35 },
      { d: poly([[w - d, d], [w, 0], [w, h - d], [w - d, h]]), shade: -0.3 },
    ],
    edges: [`M0 ${f(d)} H${f(w - d)} V${f(h)} M${f(w - d)} ${f(d)} L${f(w)} 0`],
  };
}
function pyramid(w, h) {
  const apex = [w * 0.45, 0], fl = [0, h * 0.82], fr = [w * 0.68, h], br = [w, h * 0.74];
  return {
    main: poly([apex, fl, fr, br]),
    post: [{ d: poly([apex, fr, br]), shade: -0.3 }],
    edges: [`M${f(apex[0])} ${f(apex[1])} L${f(fr[0])} ${f(fr[1])}`],
  };
}
function cylinder(w, h) {
  const ry = Math.min(h * 0.14, w * 0.25), rx = w / 2;
  return {
    main: `M0 ${f(ry)} A${f(rx)} ${f(ry)} 0 0 1 ${f(w)} ${f(ry)} V${f(h - ry)} A${f(rx)} ${f(ry)} 0 0 1 0 ${f(h - ry)} Z`,
    post: [{ d: `M0 ${f(ry)} A${f(rx)} ${f(ry)} 0 0 1 ${f(w)} ${f(ry)} A${f(rx)} ${f(ry)} 0 0 1 0 ${f(ry)} Z`, shade: 0.35 },
      { d: `M${f(w * 0.62)} ${f(ry * 1.9)} H${f(w)} V${f(h - ry)} A${f(rx)} ${f(ry)} 0 0 1 ${f(w * 0.62)} ${f(h - ry * 0.05)} Z`, shade: -0.18, noStroke: true }],
  };
}
function prism(w, h) {
  const A = [0, h], B = [w * 0.62, h], C = [w * 0.31, h * 0.22];
  const B2 = [w, h * 0.78], C2 = [w * 0.69, 0];
  return {
    main: poly([A, C, C2, B2, B]),
    post: [{ d: poly([C, C2, B2, B]), shade: -0.28 }],
    edges: [`M${f(C[0])} ${f(C[1])} L${f(B[0])} ${f(B[1])}`],
  };
}
function cone(w, h) {
  const ry = Math.min(h * 0.14, w * 0.25), rx = w / 2;
  return {
    main: `M${f(w / 2)} 0 L${f(w)} ${f(h - ry)} A${f(rx)} ${f(ry)} 0 0 1 0 ${f(h - ry)} Z`,
    post: [{ d: `M${f(w / 2)} 0 L${f(w)} ${f(h - ry)} A${f(rx)} ${f(ry)} 0 0 1 ${f(w * 0.62)} ${f(h - ry * 0.05)} Z`, shade: -0.2, noStroke: true }],
  };
}
function curveygon(w, h) {
  const raw = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r = 0.62 + 0.38 * Math.abs(Math.cos(2 * a));
    raw.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return fit(raw, w, h);
}

function borderFrame(w, h) {
  const b = Math.max(4, Math.min(30, Math.min(w, h) * 0.06));
  const i2 = b * 1.6;
  const edges = [];
  if (w > i2 * 2 && h > i2 * 2) edges.push(rectPath(i2, i2, w - 2 * i2, h - 2 * i2));
  // corner squares
  const c = b * 0.9;
  edges.push(rectPath(b * 0.05, b * 0.05, c, c), rectPath(w - c - b * 0.05, b * 0.05, c, c),
    rectPath(b * 0.05, h - c - b * 0.05, c, c), rectPath(w - c - b * 0.05, h - c - b * 0.05, c, c));
  return {
    main: rectPath(0, 0, w, h) + ' ' + rectPath(b, b, Math.max(w - 2 * b, 0), Math.max(h - 2 * b, 0)),
    evenodd: true,
    edges,
  };
}
function borderLine(w, h) {
  const t = Math.max(1, h * 0.1), cy = h / 2, r = h / 2;
  const diamond = (cx, rr) => poly([[cx, cy - rr], [cx + rr, cy], [cx, cy + rr], [cx - rr, cy]]);
  return {
    main: rectPath(r * 0.6, cy - t, Math.max(w - r * 1.2, 0), 2 * t) + ' ' + diamond(w / 2, r) + ' ' +
      diamond(r * 0.6, r * 0.6) + ' ' + diamond(w - r * 0.6, r * 0.6),
  };
}

export function shapeGeometry(o) {
  const w = Math.max(o.w, 0.01), h = Math.max(o.h, 0.01);
  switch (o.kind) {
    case 'rect': case 'square': return { main: rectPath(0, 0, w, h) };
    case 'roundrect': case 'roundsquare': return { main: roundRectPath(w, h, Math.min(w, h) * 0.18) };
    case 'ellipse': case 'circle': return { main: ellipsePath(w, h) };
    case 'polygon': return { main: pointsPath(o.points, true, false) };
    case 'smoothpolygon': return { main: pointsPath(o.points, true, true) };
    case 'triangle': return { main: poly([[w / 2, 0], [w, h], [0, h]]) };
    case 'pentagon': return { main: poly(radial(5, w, h)) };
    case 'hexagon': return { main: poly(radial(6, w, h, null, 0)) };
    case 'star': return { main: poly(radial(5, w, h, 0.4)) };
    case 'starburst': return { main: poly(radial(16, w, h, 0.68)) };
    case 'megagon': return { main: poly(radial(12, w, h, 0.55, -90)) };
    case 'curveygon': return { main: poly(curveygon(w, h)) };
    case 'blockarrow': case 'arrow1': return { main: poly(oneWay(w, h)) };
    case 'arrow1_3d': return extruded(oneWay, w, h);
    case 'arrow2': return { main: poly(twoWay(w, h)) };
    case 'arrow2_3d': return extruded(twoWay, w, h);
    case 'angled': return { main: poly(angled(w, h)) };
    case 'angled_3d': return extruded(angled, w, h);
    case 'curved': return { main: curvedArrowPath(w, h) };
    case 'curved_3d': {
      // Curved outline can't be extruded edge-by-edge, so stack copies back to front.
      const d = Math.min(w, h) * 0.14;
      const front = curvedArrowPath(w - d, h - d);
      const pre = [];
      const steps = Math.max(8, Math.ceil(d * 1.5));
      for (let i = steps; i >= 1; i--) {
        const t = i / steps;
        pre.push({ d: front, shade: i === steps ? -0.35 : -0.25, noStroke: i !== steps,
          transform: `translate(${f(d * t)} ${f(d * (1 - t))})` });
      }
      return { main: front, mainTransform: `translate(0 ${f(d)})`, pre };
    }
    case 'arrow3way': return { main: poly(multiWay(w, h, 3)) };
    case 'arrow4way': return { main: poly(multiWay(w, h, 4)) };
    case 'notched': return { main: poly(notched(w, h)) };
    case 'cube': return cube(w, h);
    case 'pyramid': return pyramid(w, h);
    case 'cylinder': return cylinder(w, h);
    case 'prism': return prism(w, h);
    case 'cone': return cone(w, h);
    case 'borderframe': return borderFrame(w, h);
    case 'borderline': return borderLine(w, h);
    default: return { main: rectPath(0, 0, w, h) };
  }
}

export function pointsPath(points, closed, smooth) {
  if (!points || points.length === 0) return 'M0 0';
  if (smooth && points.length > 2) return smoothPath(points, closed);
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < points.length; i++) d += ` L${f(points[i].x)} ${f(points[i].y)}`;
  if (closed) d += ' Z';
  return d;
}

export function linePath(o) {
  const p = o.points || [];
  if (p.length < 2) return pointsPath(p, false, false);
  switch (o.kind) {
    case 'rightangle': {
      const a = p[0], b = p[p.length - 1];
      const mx = (a.x + b.x) / 2;
      return `M${f(a.x)} ${f(a.y)} H${f(mx)} V${f(b.y)} H${f(b.x)}`;
    }
    case 'arc': {
      const a = p[0], b = p[p.length - 1];
      const rx = Math.abs(b.x - a.x) || 0.01, ry = Math.abs(b.y - a.y) || 0.01;
      const sweep = (b.x - a.x) * (b.y - a.y) >= 0 ? 1 : 0;
      return `M${f(a.x)} ${f(a.y)} A${f(rx)} ${f(ry)} 0 0 ${sweep} ${f(b.x)} ${f(b.y)}`;
    }
    case 'curve': case 'freehand': return pointsPath(p, false, true);
    default: return pointsPath(p, false, false);
  }
}
