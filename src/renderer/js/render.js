// Turns document objects into SVG markup.

import { objMatrix, matStr, f, PX_PER_PT } from './geometry.js';
import { shapeGeometry, linePath } from './shapes.js';

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- fills ----------
// 25 patterns, each drawn on an 8x8 tile. {fg} is replaced by the foreground colour.
export const PATTERNS = [
  '<path d="M0 2H8M0 6H8" stroke="{fg}" stroke-width="1"/>',
  '<path d="M0 0L8 8M8 0L0 8" stroke="{fg}" stroke-width="0.8"/>',
  '<path d="M0 0.5H8M0.5 0V8M0 4.5H8M4.5 0V8" stroke="{fg}" stroke-width="1"/>',
  '<path d="M-2 2L2 -2M-2 10L10 -2M6 10L10 6" stroke="{fg}" stroke-width="2.4"/>',
  '<circle cx="2" cy="2" r="0.8" fill="{fg}"/><circle cx="6" cy="6" r="0.8" fill="{fg}"/>',
  '<path d="M2 0V8M6 0V8" stroke="{fg}" stroke-width="1"/>',
  '<path d="M-1 1L1 -1M-1 5L5 -1M-1 9L9 -1M3 9L9 3M7 9L9 7" stroke="{fg}" stroke-width="0.8"/>',
  '<path d="M0 0.5H8M0.5 0V8M0 2.5H8M2.5 0V8M0 4.5H8M4.5 0V8M0 6.5H8M6.5 0V8" stroke="{fg}" stroke-width="0.7"/>',
  '<path d="M1 0V8M3 0V8M5 0V8M7 0V8" stroke="{fg}" stroke-width="1"/>',
  '<circle cx="2" cy="2" r="1.1" fill="{fg}"/><circle cx="6" cy="2" r="1.1" fill="{fg}"/><circle cx="2" cy="6" r="1.1" fill="{fg}"/><circle cx="6" cy="6" r="1.1" fill="{fg}"/>',
  '<path d="M-1 7L1 9M-1 3L5 9M-1 -1L9 9M3 -1L9 5M7 -1L9 1" stroke="{fg}" stroke-width="0.8"/>',
  '<path d="M-2 2L2 -2M-2 6L6 -2M-2 10L10 -2M2 10L10 2M6 10L10 6" stroke="{fg}" stroke-width="1.4"/>',
  '<path d="M0 0H4V4H0ZM4 4H8V8H4Z" fill="{fg}"/>',
  '<rect x="1" y="1" width="1" height="1" fill="{fg}"/><rect x="5" y="5" width="1" height="1" fill="{fg}"/><rect x="5" y="1" width="1" height="1" fill="{fg}"/><rect x="1" y="5" width="1" height="1" fill="{fg}"/>',
  '<circle cx="1.5" cy="2" r="1" fill="{fg}"/><circle cx="6" cy="1" r="0.9" fill="{fg}"/><circle cx="4" cy="5" r="1" fill="{fg}"/><circle cx="7" cy="7" r="0.9" fill="{fg}"/><circle cx="1" cy="7" r="0.8" fill="{fg}"/>',
  '<path d="M0 8L8 0" stroke="{fg}" stroke-width="0.8"/>',
  '<path d="M2 0V8M6 0V8" stroke="{fg}" stroke-width="2.2"/>',
  '<path d="M0 1H8M0 3H8M0 5H8M0 7H8" stroke="{fg}" stroke-width="0.8"/>',
  '<rect x="2" y="2" width="1" height="1" fill="{fg}"/><rect x="6" y="6" width="1" height="1" fill="{fg}"/>',
  '<path d="M0 2H3M5 2H8M1 6H6" stroke="{fg}" stroke-width="1"/>',
  '<path d="M0 1H8M1 0V8M0 5H8M5 0V8" stroke="{fg}" stroke-width="2"/>',
  '<path d="M1 0V8M5 0V8" stroke="{fg}" stroke-width="3"/>',
  '<path d="M0 0H2V2H0ZM4 0H6V2H4ZM2 2H4V4H2ZM6 2H8V4H6ZM0 4H2V6H0ZM4 4H6V6H4ZM2 6H4V8H2ZM6 6H8V8H6Z" fill="{fg}"/>',
  '<rect x="3" y="3" width="1" height="1" fill="{fg}"/>',
  '<path d="M0 0.5H8M0 4.5H8M4 0.5V4.5M0 4.5V8.5M8 4.5V8.5" stroke="{fg}" stroke-width="1" fill="none"/>',
];

export const GRADIENTS = [
  { type: 'linear', x1: 0, y1: 0, x2: 0, y2: 1 },
  { type: 'reflect', x1: 0, y1: 0, x2: 0, y2: 1 },
  { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 1 },
  { type: 'radial', cx: 0.5, cy: 0.5, r: 0.7 },
  { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0 },
  { type: 'reflect', x1: 0, y1: 0, x2: 1, y2: 0 },
  { type: 'linear', x1: 1, y1: 0, x2: 0, y2: 1 },
  { type: 'radial', cx: 0, cy: 0, r: 1.3 },
];

export function patternDef(id, fill) {
  const p = PATTERNS[fill.pattern] || PATTERNS[0];
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8">` +
    `<rect width="8" height="8" fill="${fill.bg}"/>${p.replace(/\{fg\}/g, fill.fg)}</pattern>`;
}

export function gradientDef(id, fill) {
  const g = GRADIENTS[fill.gradient] || GRADIENTS[0];
  if (g.type === 'radial') {
    return `<radialGradient id="${id}" cx="${g.cx}" cy="${g.cy}" r="${g.r}">` +
      `<stop offset="0" stop-color="${fill.start}"/><stop offset="1" stop-color="${fill.end}"/></radialGradient>`;
  }
  const stops = g.type === 'reflect'
    ? `<stop offset="0" stop-color="${fill.end}"/><stop offset="0.5" stop-color="${fill.start}"/><stop offset="1" stop-color="${fill.end}"/>`
    : `<stop offset="0" stop-color="${fill.start}"/><stop offset="1" stop-color="${fill.end}"/>`;
  return `<linearGradient id="${id}" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${stops}</linearGradient>`;
}

// ---------- line ends ----------
// Glyphs drawn in a 10x10 box pointing right; refX is where the line ends.
export const LINE_ENDS = [
  null,
  { refX: 10, body: '<path d="M0 0.8L8 5L0 9.2" fill="none" stroke="{c}" stroke-width="1.3"/><path d="M9.3 0V10" stroke="{c}" stroke-width="1.4"/>' },
  { refX: 5, body: '<rect x="1" y="1" width="8" height="8" fill="#fff" stroke="{c}" stroke-width="1.3"/>' },
  { refX: 10, body: '<path d="M0.7 0.7L9.6 5L0.7 9.3Z" fill="#fff" stroke="{c}" stroke-width="1.2"/>' },
  { refX: 10, body: '<path d="M0.5 0.8L9.4 5L0.5 9.2" fill="none" stroke="{c}" stroke-width="1.4"/>' },
  { refX: 10, body: '<path d="M0 0L8.2 5L0 10Z" fill="{c}"/><path d="M9.3 0V10" stroke="{c}" stroke-width="1.4"/>' },
  { refX: 5, body: '<rect x="1" y="1" width="8" height="8" fill="{c}"/>' },
  { refX: 10, body: '<path d="M0 0L10 5L0 10Z" fill="{c}"/>' },
  { refX: 10, body: '<path d="M0 0L10 5L0 10L2.6 5Z" fill="{c}"/>' },
  { refX: 10, body: '<path d="M2 1.5L8 5L2 8.5" fill="none" stroke="{c}" stroke-width="1.3"/><path d="M9.3 1V9" stroke="{c}" stroke-width="1.4"/>' },
  { refX: 5, body: '<circle cx="5" cy="5" r="4" fill="#fff" stroke="{c}" stroke-width="1.3"/>' },
  { refX: 5, body: '<path d="M2.5 10L7.5 0" stroke="{c}" stroke-width="1.4"/>' },
  { refX: 10, body: '<path d="M0 2.6L9.5 5L0 7.4" fill="none" stroke="{c}" stroke-width="1.1"/>' },
  { refX: 8, body: '<path d="M8 0V10" stroke="{c}" stroke-width="1.6"/>' },
  { refX: 5, body: '<circle cx="5" cy="5" r="4.3" fill="{c}"/>' },
];

function markerDef(id, index, color, size) {
  const e = LINE_ENDS[index];
  if (!e) return '';
  return `<marker id="${id}" viewBox="0 0 10 10" refX="${e.refX}" refY="5" markerUnits="userSpaceOnUse" ` +
    `markerWidth="${f(size)}" markerHeight="${f(size)}" orient="auto-start-reverse" overflow="visible">` +
    `${e.body.replace(/\{c\}/g, color)}</marker>`;
}

// ---------- strokes ----------
export function strokeWidthPx(line) {
  if (!line || line.style === 'none') return 0;
  if (line.style === 'hairline') return 1;
  return Math.max(0.5, (line.width || 1) * PX_PER_PT);
}

export function dashArray(line, sw) {
  const u = Math.max(sw, 1);
  switch (line.dash) {
    case 'dash': return [6, 4].map((v) => v * u);
    case 'dot': return [1, 2.5].map((v) => v * u);
    case 'dashdot': return [6, 3, 1, 3].map((v) => v * u);
    case 'dashdotdot': return [6, 3, 1, 3, 1, 3].map((v) => v * u);
    default: return null;
  }
}

function endSize(ends, sw) {
  const s = { small: 6 + 1.5 * sw, medium: 10 + 2 * sw, large: 15 + 3 * sw }[ends.size || 'medium'];
  return s || 10;
}

// ---------- text measurement ----------
let measureCtx = null;
export function fontCss(t, sizePx) {
  return `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${f(sizePx)}px "${t.font}", serif`;
}
export function measureLines(lines, t) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  const sizePx = t.size * PX_PER_PT;
  measureCtx.font = fontCss(t, sizePx);
  let w = 0;
  for (const line of lines) w = Math.max(w, measureCtx.measureText(line || ' ').width);
  return { w: Math.max(w, sizePx * 0.3), h: lines.length * sizePx * 1.2, sizePx };
}

// Word-wrap a label to a width (px) at the given text style.
export function wrapText(text, t, maxW) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = fontCss(t, t.size * PX_PER_PT);
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const test = line + word;
      if (line && measureCtx.measureText(test.trimEnd()).width > maxW && word.trim()) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else line = test;
    }
    out.push(line.trimEnd());
  }
  return out;
}

// Re-measure a text object after its text or font changed, keeping any stretch
// the user applied by resizing it.
export function updateTextMetrics(o) {
  const sx = o.nw && o.w ? o.w / o.nw : 1;
  const sy = o.nh && o.h ? o.h / o.nh : 1;
  const lines = String(o.content || '').split('\n');
  const m = measureLines(lines, o.text);
  o.nw = m.w + 4;
  o.nh = m.h;
  o.w = o.nw * sx;
  o.h = o.nh * sy;
}

function textDecoration(t) {
  const d = [];
  if (t.underline) d.push('underline');
  if (t.strike) d.push('line-through');
  return d.length ? ` text-decoration="${d.join(' ')}"` : '';
}

function textBlock(lines, t, x, yTop, align, color) {
  const sizePx = t.size * PX_PER_PT;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const attrs = `font-family="${esc(t.font)}, serif" font-size="${f(sizePx)}"` +
    `${t.bold ? ' font-weight="bold"' : ''}${t.italic ? ' font-style="italic"' : ''}${textDecoration(t)}` +
    ` text-anchor="${anchor}" fill="${color}" xml:space="preserve"`;
  const spans = lines.map((line, i) =>
    `<tspan x="${f(x)}" y="${f(yTop + sizePx * (i * 1.2 + 0.92))}">${esc(line || ' ')}</tspan>`).join('');
  return `<text ${attrs}>${spans}</text>`;
}

// ---------- objects ----------
// ctx: { doc, uid, strokeScale, silhouette, forExport }
function fillAttr(o, ctx, defs, idBase) {
  if (ctx.silhouette) return ctx.silhouette;
  const fl = o.fill;
  if (!fl || fl.style === 'none') return 'none';
  if (fl.style === 'solid') return fl.color;
  if (fl.style === 'pattern') { defs.push(patternDef(`${idBase}p`, fl)); return `url(#${idBase}p)`; }
  if (fl.style === 'gradient') { defs.push(gradientDef(`${idBase}g`, fl)); return `url(#${idBase}g)`; }
  return 'none';
}

function strokeAttrs(o, ctx, extra = '') {
  const ln = o.line;
  const sw = strokeWidthPx(ln) * (ctx.strokeScale || 1);
  if (!sw) return ' stroke="none"';
  const color = ctx.silhouette || ln.color;
  let s = ` stroke="${color}" stroke-width="${f(sw)}" stroke-linejoin="round"`;
  const da = dashArray(ln, sw);
  if (da) s += ` stroke-dasharray="${da.map(f).join(' ')}"`;
  if (ln.dash === 'dot') s += ' stroke-linecap="round"';
  return s + extra;
}

function shadeOverlay(d, shade, transform = '') {
  if (!shade) return '';
  const color = shade > 0 ? '#ffffff' : '#000000';
  const t = transform ? ` transform="${transform}"` : '';
  return `<path d="${d}"${t} fill="${color}" fill-opacity="${Math.abs(shade)}" stroke="none"/>`;
}

function renderShapeBody(o, ctx, defs, idBase) {
  const g = shapeGeometry(o);
  const fill = fillAttr(o, ctx, defs, idBase);
  const stroke = strokeAttrs(o, ctx);
  const rule = g.evenodd ? ' fill-rule="evenodd"' : '';
  let s = '';
  const face = (item) => {
    const t = item.transform ? ` transform="${item.transform}"` : '';
    let out = `<path d="${item.d}"${t} fill="${fill}"${rule}${item.noStroke ? ' stroke="none"' : stroke}/>`;
    if (!ctx.silhouette) out += shadeOverlay(item.d, item.shade, item.transform);
    return out;
  };
  for (const item of g.pre || []) s += face(item);
  const mt = g.mainTransform ? ` transform="${g.mainTransform}"` : '';
  s += `<path class="main" d="${g.main}"${mt} fill="${fill}"${rule}${stroke}/>`;
  for (const item of g.post || []) {
    if (!ctx.silhouette) s += shadeOverlay(item.d, item.shade, item.transform);
    if (!item.noStroke) s += `<path d="${item.d}" fill="none"${stroke}/>`;
  }
  for (const e of g.edges || []) s += `<path d="${e}" fill="none"${stroke}/>`;
  return { body: s, hitD: g.main, hitTransform: g.mainTransform };
}

function renderLineBody(o, ctx, defs, idBase) {
  const d = linePath(o);
  const sw = strokeWidthPx(o.line) * (ctx.strokeScale || 1);
  let markers = '';
  if (sw && o.ends && !ctx.silhouette) {
    const size = endSize(o.ends, sw);
    if (o.ends.start) { defs.push(markerDef(`${idBase}ms`, o.ends.start, o.line.color, size)); markers += ` marker-start="url(#${idBase}ms)"`; }
    if (o.ends.end) { defs.push(markerDef(`${idBase}me`, o.ends.end, o.line.color, size)); markers += ` marker-end="url(#${idBase}me)"`; }
  }
  const body = `<path class="main" d="${d}" fill="none"${strokeAttrs(o, ctx)} stroke-linecap="round"${markers}/>`;
  return { body, hitD: d };
}

function labelMarkup(o, ctx) {
  if (!o.label || ctx.skipLabelId === o.id) return '';
  const t = o.text;
  const color = ctx.silhouette || t.color;
  const pad = 4;
  const sizePx = t.size * PX_PER_PT;
  const isLine = o.type === 'line';
  const maxW = isLine ? 10000 : Math.max(o.w - pad * 2, sizePx);
  const lines = wrapText(o.label, t, maxW);
  const blockH = lines.length * sizePx * 1.2;
  const align = t.align || 'center';
  let x = align === 'left' ? pad : align === 'right' ? o.w - pad : o.w / 2;
  let y = (o.h - blockH) / 2;
  switch (t.labelPos) {
    case 'top': y = pad; break;
    case 'bottom': y = o.h - blockH - pad; break;
    case 'above': y = -blockH - pad; break;
    case 'below': y = o.h + pad; break;
    case 'left': x = pad; break;
    case 'right': x = o.w - pad; break;
    default: break;
  }
  const effAlign = t.labelPos === 'left' ? 'left' : t.labelPos === 'right' ? 'right' : align;
  if (isLine && (!t.labelPos || t.labelPos === 'center')) y = o.h / 2 - blockH - 2;
  let bg = '';
  if (t.bg && t.bg !== 'none' && !ctx.silhouette) {
    const m = measureLines(lines, t);
    const bx = effAlign === 'left' ? x : effAlign === 'right' ? x - m.w : x - m.w / 2;
    bg = `<rect x="${f(bx - 2)}" y="${f(y)}" width="${f(m.w + 4)}" height="${f(blockH)}" fill="${t.bg}"/>`;
  }
  return `<g class="label">${bg}${textBlock(lines, t, x, y, effAlign, color)}</g>`;
}

function renderTextBody(o, ctx) {
  const t = o.text;
  const lines = String(o.content || '').split('\n');
  const nw = o.nw || o.w || 1, nh = o.nh || o.h || 1;
  const sx = o.w / nw, sy = o.h / nh;
  const align = t.align || 'center';
  const x = align === 'left' ? 2 : align === 'right' ? nw - 2 : nw / 2;
  let bg = '';
  if (t.bg && t.bg !== 'none' && !ctx.silhouette) bg = `<rect width="${f(nw)}" height="${f(nh)}" fill="${t.bg}"/>`;
  const body = `<g transform="scale(${f(sx)} ${f(sy)})">${bg}${textBlock(lines, t, x, 0, align, ctx.silhouette || t.color)}</g>` +
    `<rect class="textbox" width="${f(o.w)}" height="${f(o.h)}" fill="transparent" stroke="none"/>`;
  return { body, hitD: `M0 0H${f(o.w)}V${f(o.h)}H0Z` };
}

function renderImageBody(o, ctx) {
  if (ctx.silhouette) {
    return { body: `<rect width="${f(o.w)}" height="${f(o.h)}" fill="${ctx.silhouette}"/>`, hitD: '' };
  }
  const href = ctx.forExport
    ? ` href="${(ctx.doc.images || {})[o.imageId] || ''}"`
    : '';
  const body = ctx.forExport
    ? `<image${href} width="${f(o.w)}" height="${f(o.h)}" preserveAspectRatio="none"/>`
    : `<use href="#img-${o.imageId}" transform="scale(${f(o.w)} ${f(o.h)})"/>`;
  return { body, hitD: `M0 0H${f(o.w)}V${f(o.h)}H0Z` };
}

function renderPathBody(o, ctx, defs, idBase) {
  const sx = o.w / (o.baseW || 1), sy = o.h / (o.baseH || 1);
  const fill = fillAttr(o, ctx, defs, idBase);
  const subCtx = { ...ctx, strokeScale: (ctx.strokeScale || 1) / Math.sqrt(Math.abs(sx * sy) || 1) };
  const stroke = strokeAttrs(o, subCtx);
  const t = `scale(${f(sx)} ${f(sy)})`;
  return {
    body: `<path class="main" d="${o.d}" transform="${t}" fill="${o.closed === false ? 'none' : fill}"${o.evenodd ? ' fill-rule="evenodd"' : ''}${stroke}/>`,
    hitD: o.d, hitTransform: t,
  };
}

function renderGroupBody(o, ctx) {
  const sx = o.w / (o.baseW || 1), sy = o.h / (o.baseH || 1);
  // Strokes inside a group scale along with it.
  const sub = { ...ctx };
  let inner = '';
  for (const c of o.children) inner += renderObject(c, sub, false);
  return { body: `<g transform="scale(${f(sx)} ${f(sy)})">${inner}</g>`, hitD: `M0 0H${f(o.w)}V${f(o.h)}H0Z`, groupHitBox: true };
}

function renderBody(o, ctx, defs, idBase) {
  switch (o.type) {
    case 'shape': return renderShapeBody(o, ctx, defs, idBase);
    case 'line': return renderLineBody(o, ctx, defs, idBase);
    case 'text': return renderTextBody(o, ctx);
    case 'image': return renderImageBody(o, ctx);
    case 'path': return renderPathBody(o, ctx, defs, idBase);
    case 'group': return renderGroupBody(o, ctx);
    default: return { body: '', hitD: '' };
  }
}

export function renderShadow(o, ctx) {
  const sh = o.shadow;
  if (!sh || sh.style === 'none' || o.type === 'group') return '';
  const m = matStr(objMatrix(o));
  const color = sh.color || '#808080';
  const sctx = { ...ctx, silhouette: color };
  const defs = [];
  const { body } = renderBody(o, sctx, defs, `s${ctx.uid}${o.id}`);
  const label = labelMarkup(o, sctx);
  const off = Math.max(3, Math.min(10, Math.min(o.w || 40, o.h || 40) * 0.06 + 2));
  if (sh.style === 'simple') {
    return `<g class="shadow" transform="translate(${f(off)} ${f(off)}) ${m}">${body}${label}</g>`;
  }
  if (sh.style === 'soft') {
    const fid = `sf${ctx.uid}${o.id}`;
    return `<filter id="${fid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${f(off * 0.7)}"/></filter>` +
      `<g class="shadow" opacity="0.6" filter="url(#${fid})" transform="translate(${f(off * 1.2)} ${f(off * 1.2)})"><g transform="${m}">${body}${label}</g></g>`;
  }
  // block: solid extrusion
  let s = '';
  const steps = Math.ceil(off * 1.4);
  for (let i = steps; i >= 1; i--) {
    s += `<g transform="translate(${f(i)} ${f(i)}) ${m}">${body}${label}</g>`;
  }
  return `<g class="shadow">${s}</g>`;
}

// Render one object (with shadow if top-level).
export function renderObject(o, ctx, topLevel = true) {
  const defs = [];
  const idBase = `d${ctx.uid || ''}${o.id}`;
  const { body, hitD, hitTransform } = renderBody(o, ctx, defs, idBase);
  const label = o.type === 'text' || o.type === 'group' || o.type === 'image' ? '' : labelMarkup(o, ctx);
  const ht = hitTransform ? ` transform="${hitTransform}"` : '';
  const hit = topLevel && hitD && !ctx.forExport
    ? `<path class="hit" d="${hitD}"${ht} fill="none" stroke="transparent" stroke-width="${f(ctx.hitWidth || 8)}"/>`
    : '';
  const shadow = topLevel || o.type !== 'group' ? renderShadow(o, ctx) : '';
  const defsStr = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  const dataAttr = topLevel && !ctx.forExport ? ` data-id="${o.id}" class="obj"` : '';
  return `${shadow}<g${dataAttr} transform="${matStr(objMatrix(o))}">${defsStr}${body}${label}${hit}</g>`;
}

// ---------- whole page (for export/print) ----------
export function renderPageSVG(doc, objects, opts = {}) {
  const { width, height, background } = doc.page;
  const ctx = { doc, uid: 'x', forExport: true };
  let content = '';
  for (const o of objects) {
    const layer = doc.layers.find((l) => l.id === o.layer);
    if (layer && !layer.visible) continue;
    content += renderObject(o, ctx);
  }
  const w = opts.width || width, h = opts.height || height;
  const vb = opts.viewBox || `0 0 ${width} ${height}`;
  const bg = opts.transparent ? '' : `<rect x="0" y="0" width="${width}" height="${height}" fill="${background || '#fff'}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${vb}">${bg}${content}</svg>`;
}
