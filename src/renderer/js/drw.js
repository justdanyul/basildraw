// Reader for old .DRW drawings (the 1990s Windows drawing-program format).
//
// Written from scratch for Basil Draw. The record layout was worked out from sample
// files, using the Scribus DRW import plug-in (GPL) only as a reference for what the
// record and symbol types mean; no code was taken from it.
//
// A .DRW file is a flat list of records:
//   length (u8, or 0xFF then u16) · command (u8) · payload
// Payloads of commands below 96 or above 160 are run-length packed (0xFF, count, value).
// Numbers are little-endian. Drawing objects ("symbols", command 7) are followed by the
// records that belong to them: points (6), text (31/34/8), bitmap rows (32) and colour
// table (35). Groups and "complex objects" announce how many symbols they contain.
//
// parseDrw() turns the bytes into a plain tree in DRW units; drwToDocument() turns that
// into a Basil Draw document.

import { newDocument, createObject, newId } from './model.js';
import { PX_PER_CM, PX_PER_PT } from './geometry.js';

// ---------------------------------------------------------------- records
export function readRecords(bytes) {
  const recs = [];
  let pos = 0;
  const n = bytes.length;
  while (pos < n) {
    const offset = pos;
    let len = bytes[pos++];
    if (len === 0xff) { len = bytes[pos] | (bytes[pos + 1] << 8); pos += 2; }
    if (pos >= n) break;
    const cmd = bytes[pos++];
    let data;
    if (cmd < 96 || cmd > 160) {
      data = new Uint8Array(len);
      let k = 0;
      while (k < len && pos < n) {
        const b = bytes[pos++];
        if (b === 0xff) {
          const count = bytes[pos++], val = bytes[pos++];
          for (let i = 0; i < count && k < len; i++) data[k++] = val;
        } else data[k++] = b;
      }
    } else {
      data = bytes.subarray(pos, pos + len);
      pos += len;
    }
    recs.push({ cmd, data, offset });
    if (cmd === 254) break;
  }
  return recs;
}

class Reader {
  constructor(data) { this.d = data; this.p = 0; }
  seek(p) { this.p = p; return this; }
  get left() { return this.d.length - this.p; }
  u8() { return this.p < this.d.length ? this.d[this.p++] : 0; }
  u16() { const v = this.u8() | (this.u8() << 8); return v; }
  i16() { const v = this.u16(); return v >= 0x8000 ? v - 0x10000 : v; }
  u32() { return (this.u16() + this.u16() * 0x10000) >>> 0; }
  f64() {
    const b = new Uint8Array(8);
    for (let i = 0; i < 8; i++) b[i] = this.u8();
    return new DataView(b.buffer).getFloat64(0, true);
  }
  pt() { const x = this.i16(); return { x, y: this.i16() }; }
  color() {
    const r = this.u8(), g = this.u8(), b = this.u8(); this.u8();
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  cstr(max = 64) {
    let s = '';
    for (let i = 0; i < max && this.left; i++) { const c = this.u8(); if (!c) break; s += String.fromCharCode(c); }
    return s;
  }
}

// Windows-1252 bytes -> string (the program was a Windows 3.x/95 app).
const CP1252 = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–',
  0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ' };
function decodeText(bytes) {
  let s = '';
  for (const b of bytes) {
    if (b === 0) break;
    s += CP1252[b] || String.fromCharCode(b);
  }
  return s;
}

// Symbol type numbers.
export const SYM = {
  ARC: 0, POLYGON: 1, GROUP: 2, ELLIPSE: 3, TEXT: 5, LINE: 6, POLYLINE: 8, PIE: 9, RECT: 10, ROUNDRECT: 11,
  FILLED_ELLIPSE: 13, ARC_CW: 14, FILLED_PARABOLA: 15, FILLED_QSPLINE: 16, COMPLEX: 17, PARABOLA: 18,
  QSPLINE: 19, COMPLEX_OPEN: 20, BITMAP: 22, BEZIER: 23, FILLED_BEZIER: 24, RICHTEXT: 25,
};

// ---------------------------------------------------------------- symbols
function parseSymbol(data) {
  const r = new Reader(data);
  const s = { type: r.u8(), flags: r.u8() };
  r.pt(); // unused
  const a = r.pt(), b = r.pt();
  s.bbox = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  s.rot = r.i16() / 10; // degrees, counter-clockwise
  s.scaleX = r.i16(); s.scaleY = r.i16();
  s.lineColor = r.color();
  // 24..33: list handles
  const common = () => {
    const c = new Reader(data).seek(0x38);
    s.backColor = c.color();
    s.lineWidth = c.i16();
    c.u16();
    s.pivot = c.pt();
  };
  r.seek(34);
  const fillHead = () => { s.pattern = r.u8(); s.fillColor = r.color(); };
  const box = () => { const p = r.pt(), q = r.pt(); return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) }; };
  switch (s.type) {
    case SYM.ARC: case SYM.ARC_CW:
      fillHead(); s.start = r.pt(); s.end = r.pt(); s.obox = box(); common(); break;
    case SYM.POLYGON: case SYM.POLYLINE: case SYM.FILLED_QSPLINE: case SYM.QSPLINE:
    case SYM.BEZIER: case SYM.FILLED_BEZIER:
      fillHead(); r.u16(); s.nPoints = r.u16(); common(); break;
    case SYM.GROUP:
      common(); s.count = new Reader(data).seek(0x26).u16(); break;
    case SYM.ELLIPSE: case SYM.FILLED_ELLIPSE: case SYM.RECT: case SYM.ROUNDRECT:
      fillHead(); s.obox = box(); s.radius = r.i16(); common(); break;
    case SYM.TEXT:
      r.u16(); s.fontId = r.u8(); s.nChars = r.u16(); s.fontHeight = r.i16(); common(); break;
    case SYM.LINE:
      s.end = r.pt(); s.start = r.pt(); s.widthByte = r.u8(); common(); break;
    case SYM.FILLED_PARABOLA: case SYM.PARABOLA:
      fillHead(); s.start = r.pt(); s.mid = r.pt(); s.end = r.pt(); common(); break;
    case SYM.COMPLEX: case SYM.COMPLEX_OPEN: {
      fillHead();
      s.count = new Reader(data).seek(0x2b).u16();
      common(); break;
    }
    case SYM.BITMAP: {
      r.u16(); s.obox = box();
      s.bpp = r.u16(); s.stride = r.u16(); s.planes = r.u16(); s.imgH = r.u16(); s.imgW = r.u16();
      common(); break;
    }
    case SYM.RICHTEXT:
      common(); break;
    default:
      common(); break;
  }
  s.children = [];
  return s;
}

// Device-independent bitmap (BITMAPINFOHEADER + palette + bottom-up rows) -> RGBA.
function decodeDib(bytes, off = 0) {
  const r = new Reader(bytes).seek(off);
  const hdr = r.u32();
  if (hdr < 40 || hdr > 124) return null;
  let w = r.u32() | 0; let h = r.u32() | 0;
  r.u16(); const bpp = r.u16(); const comp = r.u32();
  r.u32(); r.u32(); r.u32();
  let nColors = r.u32();
  if (comp !== 0 || w <= 0 || w > 20000 || !h || Math.abs(h) > 20000) return null;
  if (![1, 4, 8, 24, 32].includes(bpp)) return null;
  const topDown = h < 0; h = Math.abs(h);
  if (bpp <= 8 && !nColors) nColors = 1 << bpp;
  const palOff = off + hdr;
  const pal = [];
  for (let i = 0; i < (bpp <= 8 ? nColors : 0); i++) {
    const q = palOff + i * 4;
    pal.push([bytes[q + 2], bytes[q + 1], bytes[q]]);
  }
  const pix = palOff + pal.length * 4;
  const stride = Math.ceil((w * bpp) / 32) * 4;
  if (pix + stride * h > bytes.length) return null;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = pix + (topDown ? y : h - 1 - y) * stride;
    for (let x = 0; x < w; x++) {
      let rgb;
      if (bpp === 24 || bpp === 32) {
        const q = row + x * (bpp / 8);
        rgb = [bytes[q + 2], bytes[q + 1], bytes[q]];
      } else {
        const bit = x * bpp;
        const byte = bytes[row + (bit >> 3)];
        const idx = (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        rgb = pal[idx] || [0, 0, 0];
      }
      const o = (y * w + x) * 4;
      out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
    }
  }
  return { w, h, rgba: out };
}

// The full-quality picture is kept in an embedded data block (commands 51/52) that
// comes just before the bitmap symbol: an 80-byte header (placement matrix) and a DIB.
function decodeBlob(bytes) {
  for (const off of [80, 0]) {
    const img = decodeDib(bytes, off);
    if (img) return img;
  }
  // Search for a BITMAPINFOHEADER further in.
  for (let i = 4; i < Math.min(bytes.length - 40, 4096); i++) {
    if (bytes[i] === 40 && !bytes[i + 1] && !bytes[i + 2] && !bytes[i + 3] && bytes[i + 12] === 1 && !bytes[i + 13]) {
      const img = decodeDib(bytes, i);
      if (img) return img;
    }
  }
  return null;
}

export function parseDrw(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const recs = readRecords(bytes);
  if (!recs.length || recs[0].cmd !== 255) throw new Error('This is not a DRW drawing.');
  const out = {
    width: 0, height: 0, resolution: 0, metric: null, background: '#ffffff',
    fonts: {}, gradients: {}, items: [], unsupported: new Set(), title: '',
  };
  const root = { children: out.items, count: Infinity };
  const stack = [root];
  let cur = null;
  let blob = null; // { chunks: [] } being collected
  let pendingBlob = null;
  let textHdr = null;

  const closeFinished = () => {
    while (stack.length > 1 && stack[stack.length - 1].children.length >= stack[stack.length - 1].count) stack.pop();
  };

  for (const { cmd, data } of recs) {
    const r = new Reader(data);
    switch (cmd) {
      case 1: out.background = r.color(); break;
      case 19: out.title = decodeText(data); break;
      case 21: {
        const id = r.u8();
        out.fonts[id] = decodeText(data.subarray(0x13)).trim().replace(/'/g, ' ');
        break;
      }
      case 25: out.resolution = r.u16(); break;
      case 26: out.metric = r.u16() === 1; break;
      case 27: out.width = r.i16(); out.height = r.i16(); break;
      case 30: {
        const idx = r.u8();
        out.gradients[idx] = { type: r.u8(), xoff: r.u8() / 100, yoff: r.u8() / 100, angle: r.u16() / 10 };
        break;
      }
      case 51: blob = { chunks: [] }; break;
      case 52: if (blob) blob.chunks.push(data.slice()); break;
      case 7: {
        if (blob) { pendingBlob = blob; blob = null; }
        closeFinished();
        const s = parseSymbol(data);
        stack[stack.length - 1].children.push(s);
        cur = s;
        if ((s.type === SYM.GROUP || s.type === SYM.COMPLEX || s.type === SYM.COMPLEX_OPEN) && s.count > 0) stack.push(s);
        if (s.type === SYM.BITMAP && pendingBlob) {
          const total = pendingBlob.chunks.reduce((n, c) => n + c.length, 0);
          const all = new Uint8Array(total);
          let k = 0;
          for (const c of pendingBlob.chunks) { all.set(c, k); k += c.length; }
          s.full = decodeBlob(all);
          pendingBlob = null;
        }
        if (s.type === SYM.BITMAP && (s.bpp === 8 || s.bpp === 24) && s.imgW > 0 && s.imgH > 0 && s.imgW * s.imgH < 50e6) {
          s.bands = new Uint8Array(s.imgW * s.imgH * (s.bpp / 8));
        }
        if (![0, 1, 2, 3, 5, 6, 8, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25].includes(s.type)) out.unsupported.add(s.type);
        break;
      }
      case 6: {
        if (!cur || !cur.nPoints) break;
        cur.points = [];
        for (let i = 0; i < cur.nPoints && r.left >= 4; i++) cur.points.push(r.pt());
        break;
      }
      case 8: {
        if (cur && cur.type === SYM.TEXT) cur.text = decodeText(data.subarray(0, cur.nChars || data.length));
        break;
      }
      case 31: {
        if (!cur || cur.type !== SYM.RICHTEXT) break;
        r.u8(); const valign = r.u8(); r.u16(); const textRot = r.i16();
        const fontId = r.u8(), style = r.u8(), fontWidth = r.i16(), fontHeight = r.i16(), nParas = r.u16();
        const paras = [];
        for (let i = 0; i < nParas && r.left >= 31; i++) {
          const base = r.p;
          r.seek(base + 6); const align = r.u8();
          r.seek(base + 25); const len = r.u16();
          r.seek(base + 31);
          paras.push({ align, len: Math.max(0, len - 17) });
        }
        textHdr = { valign, textRot, fontId, style, fontWidth, fontHeight, paras };
        cur.rich = { ...textHdr, text: [] };
        break;
      }
      case 34: {
        if (!cur || !cur.rich) break;
        const n = new Reader(data).seek(15).u16();
        cur.rich.text.push(decodeText(data.subarray(17, 17 + n)));
        break;
      }
      case 32: {
        if (!cur || !cur.bands) break;
        const xo = r.u16(); const yo = r.u16(); const stride = r.u16(); const count = r.u16();
        const bpp = cur.bpp / 8;
        const rowBytes = cur.imgW * bpp;
        for (let y = 0; y < count; y++) {
          const row = yo + y;
          const src = 8 + y * stride;
          if (row >= cur.imgH || src + rowBytes > data.length) break;
          cur.bands.set(data.subarray(src, src + rowBytes), (row * cur.imgW + xo) * bpp);
        }
        break;
      }
      case 35: {
        if (cur && cur.type === SYM.BITMAP) {
          cur.palette = [];
          for (let i = 0; i < 256 && r.left >= 4; i++) { const c = [r.u8(), r.u8(), r.u8()]; r.u8(); cur.palette.push(c); }
        }
        break;
      }
      default: break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- geometry
// Paths are arrays of segments: ['M', x, y] ['L', x, y] ['C', x1, y1, x2, y2, x, y] ['Z'].
const KAPPA = 0.5522847498;

function rectSegs(b) {
  const { x, y, w, h } = b;
  return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
}

function roundRectSegs(b, rad) {
  const { x, y, w, h } = b;
  const r = Math.max(0, Math.min(Math.abs(rad), w / 2, h / 2));
  if (!r) return rectSegs(b);
  const k = r * (1 - KAPPA);
  return [['M', x + r, y], ['L', x + w - r, y], ['C', x + w - k, y, x + w, y + k, x + w, y + r],
    ['L', x + w, y + h - r], ['C', x + w, y + h - k, x + w - k, y + h, x + w - r, y + h],
    ['L', x + r, y + h], ['C', x + k, y + h, x, y + h - k, x, y + h - r],
    ['L', x, y + r], ['C', x, y + k, x + k, y, x + r, y], ['Z']];
}

// Elliptical arc around box b from angle a0 sweeping by `sweep` (radians, y-down screen angles).
function arcSegs(b, a0, sweep, moveTo = true) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const step = sweep / n;
  const t = (4 / 3) * Math.tan(step / 4);
  const pt = (a) => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  const segs = [];
  let a = a0;
  const [sx, sy] = pt(a);
  if (moveTo) segs.push(['M', sx, sy]);
  for (let i = 0; i < n; i++) {
    const a2 = a + step;
    const [x1, y1] = pt(a), [x2, y2] = pt(a2);
    segs.push(['C', x1 - t * rx * Math.sin(a), y1 + t * ry * Math.cos(a), x2 + t * rx * Math.sin(a2), y2 - t * ry * Math.cos(a2), x2, y2]);
    a = a2;
  }
  return segs;
}

function ellipseSegs(b) {
  return [...arcSegs(b, 0, Math.PI * 2), ['Z']];
}

function mapSegs(segs, fn) {
  return segs.map((s) => {
    if (s[0] === 'Z') return s;
    const o = [s[0]];
    for (let i = 1; i < s.length; i += 2) { const p = fn(s[i], s[i + 1]); o.push(p[0], p[1]); }
    return o;
  });
}

function segBounds(segs) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const s of segs) {
    for (let i = 1; i < s.length; i += 2) {
      x1 = Math.min(x1, s[i]); x2 = Math.max(x2, s[i]);
      y1 = Math.min(y1, s[i + 1]); y2 = Math.max(y2, s[i + 1]);
    }
  }
  if (x1 === Infinity) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// Tight bounds, taking the true extent of curves into account (sampled).
function tightBounds(segs) {
  const pts = [];
  let px = 0, py = 0;
  for (const s of segs) {
    if (s[0] === 'C') {
      for (let k = 1; k <= 12; k++) {
        const t = k / 12, u = 1 - t;
        pts.push([u * u * u * px + 3 * u * u * t * s[1] + 3 * u * t * t * s[3] + t * t * t * s[5],
          u * u * u * py + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6]]);
      }
      px = s[5]; py = s[6];
    } else if (s[0] !== 'Z') { pts.push([s[1], s[2]]); px = s[1]; py = s[2]; }
  }
  return segBounds(pts.map((p) => ['L', p[0], p[1]]));
}

// Rotate (DRW angles are counter-clockwise on screen) then fit into the symbol's box.
function placeSegs(segs, sym, origin, fit = true) {
  let out = segs;
  if (sym.rot) {
    const a = (-sym.rot * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    out = mapSegs(out, (x, y) => [x * c - y * s, x * s + y * c]);
  }
  const b = tightBounds(out);
  if (!b) return out;
  const box = sym.bbox;
  const sx = fit && b.w > 0.5 && box.w > 0 ? box.w / b.w : 1;
  const sy = fit && b.h > 0.5 && box.h > 0 ? box.h / b.h : 1;
  return mapSegs(out, (x, y) => [origin.x + box.x + (x - b.x) * sx, origin.y + box.y + (y - b.y) * sy]);
}

function pointsToSegs(points, closedType) {
  const segs = [];
  if (!points || !points.length) return segs;
  let start = null;
  for (const p of points) {
    if (!start) { segs.push(['M', p.x, p.y]); start = p; continue; }
    if (closedType && p.x === start.x && p.y === start.y) { segs.push(['Z']); start = null; continue; }
    segs.push(['L', p.x, p.y]);
  }
  return segs;
}

function bezierSegs(points) {
  const segs = [];
  if (!points || !points.length) return segs;
  segs.push(['M', points[0].x, points[0].y]);
  for (let i = 1; i + 2 < points.length; i += 3) {
    const a = points[i], b = points[i + 1], c = points[i + 2];
    segs.push(['C', a.x, a.y, b.x, b.y, c.x, c.y]);
  }
  return segs;
}

function quadSegs(points) {
  const segs = [];
  if (!points || !points.length) return segs;
  let p0 = points[0];
  segs.push(['M', p0.x, p0.y]);
  for (let i = 1; i + 1 < points.length; i += 2) {
    const q = points[i], p = points[i + 1];
    segs.push(['C', p0.x + (2 / 3) * (q.x - p0.x), p0.y + (2 / 3) * (q.y - p0.y),
      p.x + (2 / 3) * (q.x - p.x), p.y + (2 / 3) * (q.y - p.y), p.x, p.y]);
    p0 = p;
  }
  return segs;
}

const screenAngle = (c, p) => Math.atan2(p.y - c.y, p.x - c.x);

// The outline of a symbol in its own (unplaced) coordinates. Returns { segs, closed }.
function rawOutline(s) {
  switch (s.type) {
    case SYM.RECT: return { segs: rectSegs(s.obox), closed: true };
    case SYM.ROUNDRECT: return { segs: roundRectSegs(s.obox, s.radius), closed: true };
    case SYM.ELLIPSE: case SYM.FILLED_ELLIPSE: return { segs: ellipseSegs(s.obox), closed: true };
    case SYM.POLYGON: return { segs: pointsToSegs(s.points, true), closed: true };
    case SYM.POLYLINE: return { segs: pointsToSegs(s.points, true), closed: false };
    case SYM.BEZIER: return { segs: bezierSegs(s.points), closed: false };
    case SYM.FILLED_BEZIER: return { segs: [...bezierSegs(s.points), ['Z']], closed: true };
    case SYM.QSPLINE: return { segs: quadSegs(s.points), closed: false };
    case SYM.FILLED_QSPLINE: return { segs: [...quadSegs(s.points), ['Z']], closed: true };
    case SYM.LINE: return { segs: [['M', s.start.x, s.start.y], ['L', s.end.x, s.end.y]], closed: false };
    case SYM.PARABOLA: case SYM.FILLED_PARABOLA: {
      const { start: a, mid: m, end: e } = s;
      const segs = [['M', a.x, a.y], ['C', a.x + (2 / 3) * (m.x - a.x), a.y + (2 / 3) * (m.y - a.y),
        e.x + (2 / 3) * (m.x - e.x), e.y + (2 / 3) * (m.y - e.y), e.x, e.y]];
      if (s.type === SYM.FILLED_PARABOLA) segs.push(['Z']);
      return { segs, closed: s.type === SYM.FILLED_PARABOLA };
    }
    case SYM.ARC: case SYM.ARC_CW: {
      const b = s.obox;
      const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      // Angles on the unit circle of the ellipse.
      const norm = (p) => ({ x: c.x + (p.x - c.x) / (b.w / 2 || 1), y: c.y + (p.y - c.y) / (b.h / 2 || 1) });
      const a0 = screenAngle(c, norm(s.start)), a1 = screenAngle(c, norm(s.end));
      let sweep;
      if (s.type === SYM.ARC) { sweep = a1 - a0; while (sweep >= 0) sweep -= Math.PI * 2; } // counter-clockwise on screen
      else { sweep = a1 - a0; while (sweep <= 0) sweep += Math.PI * 2; }
      const segs = arcSegs(b, a0, sweep);
      const filled = s.pattern && s.pattern !== 0;
      if (filled) segs.push(['L', c.x, c.y], ['Z']);
      return { segs, closed: !!filled };
    }
    default: return { segs: [], closed: false };
  }
}

// ---------------------------------------------------------------- conversion
const PATH_TYPES = new Set([SYM.ARC, SYM.ARC_CW, SYM.POLYGON, SYM.POLYLINE, SYM.BEZIER, SYM.FILLED_BEZIER,
  SYM.QSPLINE, SYM.FILLED_QSPLINE, SYM.LINE, SYM.PARABOLA, SYM.FILLED_PARABOLA, SYM.RECT, SYM.ROUNDRECT,
  SYM.ELLIPSE, SYM.FILLED_ELLIPSE]);

const DASHES = { 1: 'dash', 2: 'dot', 3: 'dashdot', 4: 'dashdotdot' };

const fmt = (v) => Math.round(v * 100) / 100;
function segsToD(segs, dx = 0, dy = 0) {
  return segs.map((s) => {
    if (s[0] === 'Z') return 'Z';
    const nums = [];
    for (let i = 1; i < s.length; i += 2) nums.push(fmt(s[i] - dx), fmt(s[i + 1] - dy));
    return s[0] + nums.join(' ');
  }).join(' ');
}

/**
 * Convert a parsed DRW drawing to a Basil Draw document.
 * encodeImage(rgba, w, h) must return a PNG data URL (it may be async).
 */
export async function drwToDocument(drw, { encodeImage, measureText } = {}) {
  const doc = newDocument();
  // Units: the resolution record says how many drawing units make up one inch, or one
  // centimetre when the rulers are metric.
  let res = drw.resolution || 1000;
  let metric = drw.metric;
  if (metric == null) {
    // Unknown ruler: pick whichever gives a page size that looks like real paper.
    const asIn = Math.max(drw.width, drw.height) / res;
    metric = asIn > 20;
  }
  const pxPerUnit = metric ? PX_PER_CM / res : 96 / res;
  const px = (v) => v * pxPerUnit;

  const pw = Math.max(1, px(drw.width || res * 8.5)), ph = Math.max(1, px(drw.height || res * 11));
  doc.page = { ...doc.page, layout: 'paper', preset: 'custom', width: pw, height: ph,
    orientation: pw > ph ? 'landscape' : 'portrait', background: drw.background || '#ffffff' };
  doc.grid.snap = false;
  const layer = doc.activeLayer;
  const warnings = new Set();

  const lineOf = (s) => {
    const kind = s.flags & 0x0f;
    if (kind === 5) return { style: 'none', width: 1, dash: 'solid', color: s.lineColor };
    const wpt = px(Math.abs(s.lineWidth || 0)) / PX_PER_PT;
    return {
      style: wpt >= 0.75 ? 'wide' : 'hairline',
      width: Math.round(Math.max(wpt, 0.25) * 4) / 4,
      dash: DASHES[kind] || 'solid',
      color: s.lineColor,
    };
  };

  const fillOf = (s) => {
    const base = doc.defaults.fill;
    const p = s.pattern || 0;
    if (!p) return { ...base, style: 'none' };
    const color = s.fillColor || '#000000';
    if (p > 0x40 && p < 0x80) {
      const g = drw.gradients[p - 0x40] || { type: 1 };
      // 0: vertical, 3: centred radial, 7: radial from a corner (see render.js GRADIENTS)
      const idx = g.type === 1 ? 0 : (g.xoff > 0.3 && g.xoff < 0.7 ? 3 : 7);
      return { ...base, style: 'gradient', gradient: idx, start: color, end: s.backColor || '#ffffff', color };
    }
    if (p > 0x80) warnings.add('Some pattern fills were replaced with solid colours.');
    return { ...base, style: 'solid', color };
  };

  const shadowNone = { style: 'none', color: '#808080' };

  function pathObject(s, segs, closed, origin, styleFrom = s) {
    const placed = placeSegs(segs, s, origin);
    const b = tightBounds(placed);
    if (!b) return null;
    const pb = { x: px(b.x), y: px(b.y), w: Math.max(px(b.w), 0.01), h: Math.max(px(b.h), 0.01) };
    const scaled = mapSegs(placed, (x, y) => [px(x), px(y)]);
    const isRectLike = !s.rot || Math.abs(s.rot % 90) < 1e-6;
    const fill = closed ? fillOf(styleFrom) : { ...doc.defaults.fill, style: 'none' };
    const line = lineOf(styleFrom);
    const common = { layer, fill, line, shadow: { ...shadowNone }, ends: { ...doc.defaults.ends } };
    if (isRectLike && (s.type === SYM.RECT || (s.type === SYM.ROUNDRECT && !s.radius))) {
      return createObject(doc, 'shape', { ...common, kind: 'rect', ...pb });
    }
    if (isRectLike && (s.type === SYM.ELLIPSE || s.type === SYM.FILLED_ELLIPSE)) {
      return createObject(doc, 'shape', { ...common, kind: 'ellipse', ...pb });
    }
    return createObject(doc, 'path', { ...common, kind: 'path', ...pb, baseW: pb.w, baseH: pb.h,
      d: segsToD(scaled, pb.x, pb.y), closed, evenodd: true });
  }

  function textObject(s, origin) {
    let content = '', fontId, height, style = 0, align = 0;
    if (s.type === SYM.RICHTEXT && s.rich) {
      content = s.rich.text.join('\n');
      ({ fontId, style } = s.rich);
      height = s.rich.fontHeight;
      align = (s.rich.paras[0] && s.rich.paras[0].align) || 0;
    } else {
      content = (s.text || '').split('\r').map((l) => l.replace(/\n/g, '')).join('\n');
      fontId = s.fontId; height = s.fontHeight;
    }
    content = content.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    if (!content) return null;
    // Positive heights are the line ("cell") height; negative ones the character height.
    const cell = Math.abs(height || 0);
    const sizePt = Math.max(4, Math.round(((px(cell) / PX_PER_PT) / (height < 0 ? 1 : 1.18)) * 2) / 2);
    const fontName = drw.fonts[fontId] || 'Times New Roman';
    const alignName = ['left', 'center', 'right', 'left'][align] || 'left';
    const box = { x: px(origin.x + s.bbox.x), y: px(origin.y + s.bbox.y), w: px(s.bbox.w), h: px(s.bbox.h) };
    const o = createObject(doc, 'text', {
      kind: 'text', layer, content,
      fill: { ...doc.defaults.fill, style: 'none' }, line: { ...doc.defaults.line, style: 'none' },
      shadow: { ...shadowNone },
      text: { ...doc.defaults.text, font: fontName, size: sizePt, color: s.lineColor,
        bold: !!(style & 1), italic: !!(style & 2), underline: !!(style & 4), align: alignName },
      x: box.x, y: box.y, w: box.w, h: box.h,
    });
    if (measureText) {
      measureText(o); // sets nw/nh and w/h to the natural size
      const dx = alignName === 'left' ? 0 : alignName === 'right' ? box.w - o.w : (box.w - o.w) / 2;
      o.x = box.x + dx;
      o.y = box.y + Math.max(0, (box.h - o.h) / 2) * (s.rich && s.rich.valign === 1 ? 1 : 0);
    } else { o.nw = box.w; o.nh = box.h; }
    if (s.rot) o.rot = -s.rot;
    return o;
  }

  async function imageObject(s, origin) {
    let img = s.full;
    if (!img && s.bands) {
      const { imgW: w, imgH: h } = s;
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        let rgb;
        if (s.bpp === 8) { const c = (s.palette && s.palette[s.bands[i]]) || [s.bands[i], s.bands[i], s.bands[i]]; rgb = c; }
        else rgb = [s.bands[i * 3], s.bands[i * 3 + 1], s.bands[i * 3 + 2]];
        rgba[i * 4] = rgb[0]; rgba[i * 4 + 1] = rgb[1]; rgba[i * 4 + 2] = rgb[2]; rgba[i * 4 + 3] = 255;
      }
      img = { w, h, rgba };
    }
    if (!img || !encodeImage) { warnings.add('Some pictures could not be read.'); return null; }
    const url = await encodeImage(img.rgba, img.w, img.h);
    const id = newId('i');
    doc.images[id] = url;
    const box = { x: px(origin.x + s.bbox.x), y: px(origin.y + s.bbox.y), w: px(s.bbox.w), h: px(s.bbox.h) };
    const o = createObject(doc, 'image', { kind: 'image', imageId: id, layer, ...box,
      fill: { ...doc.defaults.fill, style: 'none' }, line: { ...doc.defaults.line, style: 'none' }, shadow: { ...shadowNone } });
    if (s.rot && Math.abs(s.rot % 360) > 1e-6) {
      // The box is the rotated picture's bounds; recover the unrotated size.
      const a = (s.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
      const det = c * c - sn * sn;
      if (Math.abs(det) > 0.2) {
        const w = (box.w * c - box.h * sn) / det, h = (box.h * c - box.w * sn) / det;
        if (w > 0 && h > 0) { o.w = w; o.h = h; o.x = box.x + (box.w - w) / 2; o.y = box.y + (box.h - h) / 2; }
      }
      o.rot = -s.rot;
    }
    return o;
  }

  // Combine the outlines of a complex object's parts into one path (in the parent frame).
  function complexSegs(s) {
    const all = [];
    let open = false;
    for (const c of s.children) {
      let segs;
      if (c.type === SYM.COMPLEX || c.type === SYM.COMPLEX_OPEN) segs = placeSegs(complexSegs(c), c, { x: 0, y: 0 });
      else if (PATH_TYPES.has(c.type)) segs = placeSegs(rawOutline(c).segs, c, { x: 0, y: 0 });
      else continue;
      segs = segs.filter((sg) => sg[0] !== 'Z');
      if (!segs.length) continue;
      if (open && all.length) {
        // Join onto the previous open piece unless it starts where that one began.
        segs = [['L', segs[0][1], segs[0][2]], ...segs.slice(1)];
      }
      all.push(...segs);
      const first = segs[0], last = segs[segs.length - 1];
      const lx = last[last.length - 2], ly = last[last.length - 1];
      open = !(Math.abs(lx - first[1]) < 1 && Math.abs(ly - first[2]) < 1);
      if (!open) all.push(['Z']);
    }
    if (s.type === SYM.COMPLEX && all.length && all[all.length - 1][0] !== 'Z') all.push(['Z']);
    return all;
  }

  async function convert(s, origin) {
    switch (s.type) {
      case SYM.GROUP: {
        const inner = { x: origin.x + s.bbox.x, y: origin.y + s.bbox.y };
        const kids = [];
        for (const c of s.children) { const o = await convert(c, inner); if (o) kids.push(o); }
        if (!kids.length) return null;
        if (kids.length === 1) return kids[0];
        return groupOf(kids, s);
      }
      case SYM.COMPLEX: case SYM.COMPLEX_OPEN: {
        const segs = complexSegs(s);
        if (!segs.length) return null;
        return pathObject(s, segs, s.type === SYM.COMPLEX, origin);
      }
      case SYM.TEXT: case SYM.RICHTEXT: return textObject(s, origin);
      case SYM.BITMAP: return imageObject(s, origin);
      default: {
        if (!PATH_TYPES.has(s.type)) { warnings.add('Some objects of a kind Basil Draw does not know yet were left out.'); return null; }
        const { segs, closed } = rawOutline(s);
        if (!segs.length) return null;
        return pathObject(s, segs, closed, origin);
      }
    }
  }

  function groupOf(kids, s) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const k of kids) { x1 = Math.min(x1, k.x); y1 = Math.min(y1, k.y); x2 = Math.max(x2, k.x + k.w); y2 = Math.max(y2, k.y + k.h); }
    const w = Math.max(x2 - x1, 1), h = Math.max(y2 - y1, 1);
    const children = kids.map((k) => ({ ...k, x: k.x - x1, y: k.y - y1 }));
    const g = {
      id: newId('g'), type: 'group', kind: 'group', layer, name: '',
      x: x1, y: y1, w, h, baseW: w, baseH: h, rot: 0, skx: 0, sky: 0, fh: false, fv: false, children,
      fill: { ...kids[0].fill }, line: { ...kids[0].line }, ends: { ...kids[0].ends },
      shadow: { ...shadowNone }, text: { ...kids[0].text }, label: '',
    };
    if (s.rot) g.rot = -s.rot;
    return g;
  }

  for (const s of drw.items) {
    const o = await convert(s, { x: 0, y: 0 });
    if (o) doc.objects.push(o);
  }
  for (const t of drw.unsupported) if (t !== undefined) warnings.add('Some objects of a kind Basil Draw does not know yet were left out.');
  return { doc, warnings: [...warnings] };
}

// Browser helpers -------------------------------------------------------------
export function rgbaToPngDataUrl(rgba, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return c.toDataURL('image/png');
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
