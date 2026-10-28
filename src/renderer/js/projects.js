// Project Wizard templates: each project type builds a ready-made drawing
// from a style (theme) and the words the user typed in.

import { newDocument, createObject } from './model.js';
import { updateTextMetrics } from './render.js';
import { CLIPART } from './clipart.js';
import { PX_PER_PT } from './geometry.js';
import { pageSize } from './ui/dialogs.js';

export const THEMES = [
  { id: 'classic', name: 'Classic', bg: '#fdfaf3', primary: '#1f3a6e', secondary: '#b8862b', accent: '#efe4c8', text: '#1f2937',
    head: ['Georgia', 'Times New Roman'], body: ['Georgia', 'Times New Roman'], deco: 'frame', headBold: true },
  { id: 'bright', name: 'Bright & Fun', bg: '#ffffff', primary: '#e63946', secondary: '#1d7fd8', accent: '#ffd23f', text: '#222222',
    head: ['Chalkboard SE', 'Chalkboard', 'Comic Sans MS', 'Marker Felt', 'Arial Rounded MT Bold', 'Arial'], body: ['Avenir Next', 'Helvetica Neue', 'Segoe UI', 'Arial'], deco: 'confetti', headBold: true },
  { id: 'elegant', name: 'Elegant', bg: '#f7f4ee', primary: '#2f4f3e', secondary: '#9c7a3c', accent: '#e3ebe3', text: '#2b2b2b',
    head: ['Palatino', 'Book Antiqua', 'Palatino Linotype', 'Georgia'], body: ['Palatino', 'Book Antiqua', 'Palatino Linotype', 'Georgia'], deco: 'ornament', headItalic: true },
  { id: 'modern', name: 'Modern', bg: '#ffffff', primary: '#1f2937', secondary: '#f2545b', accent: '#eef0f3', text: '#1f2937',
    head: ['Avenir Next', 'Helvetica Neue', 'Futura', 'Segoe UI', 'Arial'], body: ['Avenir Next', 'Helvetica Neue', 'Segoe UI', 'Arial'], deco: 'band', headBold: true },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function today() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// fields: [key, label, default, multiline?]
export function projectTypes(w = {}) {
  const next = new Date(); next.setMonth(next.getMonth() + 1);
  const addr = (w.address || '').split('\n');
  return {
    greeting: { name: 'Greeting Card', desc: 'The front of a folded card', icon: 'Balloons', page: ['folded', 'half-a4', 'portrait'],
      fields: [['title', 'Front message', 'Happy Birthday!'], ['message', 'Smaller message', 'Wishing you a wonderful day'], ['from', 'From', w.name ? `With love from ${w.name}` : 'With love from all of us']] },
    invitation: { name: 'Invitation', desc: 'Parties, weddings and get-togethers', icon: 'Gift', page: ['folded', 'half-a4', 'portrait'],
      fields: [['title', 'Heading', "You're Invited!"], ['event', 'What', 'A Birthday Party'], ['when', 'When', 'Saturday 14 November at 7pm'], ['where', 'Where', 'The Village Hall'], ['rsvp', 'RSVP', w.phone ? `RSVP ${w.name || ''} ${w.phone}`.trim() : 'RSVP by 1 November']] },
    sign: { name: 'Sign or Poster', desc: 'Notices, sales and announcements (A4)', icon: 'Star', page: ['standard', 'A4', 'portrait'],
      fields: [['title', 'Big heading', 'GARAGE SALE'], ['sub', 'Sub-heading', 'Everything must go!'], ['details', 'Details', 'Saturday 9am – 2pm\n12 Oak Road', true]] },
    certificate: { name: 'Certificate', desc: 'Awards and thank-yous', icon: 'Star', page: ['standard', 'A4', 'landscape'],
      fields: [['title', 'Title', 'Certificate of Achievement'], ['name', 'Awarded to', 'Jane Smith'], ['reason', 'For', 'Outstanding effort in the village bake-off'], ['date', 'Date', today()], ['signed', 'Signed by', w.name || '']] },
    business: { name: 'Business Card', desc: 'Name, job and contact details', icon: 'Car', page: ['business', 'eu', 'landscape'],
      fields: [['name', 'Name', w.name || 'Your Name'], ['job', 'Job title', 'Proprietor'], ['company', 'Company', w.company || 'Company Name'], ['phone', 'Phone', w.phone || '01234 567890'], ['email', 'Email', w.email || 'hello@example.com'], ['address', 'Address', addr.join(', ') || '1 High Street, Town']] },
    banner: { name: 'Banner', desc: 'A long banner over several sheets', icon: 'Balloons', page: ['banner', '4', 'landscape'],
      fields: [['title', 'Banner text', 'WELCOME HOME!']] },
    label: { name: 'Label', desc: 'Address and jar labels', icon: 'House', page: ['labels', 'L7163', 'landscape'],
      fields: [['line1', 'Line 1', w.name || 'Mr & Mrs Smith'], ['line2', 'Line 2', addr[0] || '12 Oak Road'], ['line3', 'Line 3', addr.slice(1).join(', ') || 'Welwyn, AL1 2BC']] },
    postcard: { name: 'Post Card', desc: 'Holiday greetings (A6)', icon: 'Sun', page: ['postcard', 'a6', 'landscape'],
      fields: [['title', 'Greeting', 'Greetings from'], ['place', 'Place', 'Copenhagen'], ['message', 'Message', 'Having a lovely time!']] },
    calendar: { name: 'Calendar', desc: 'A month to print and pin up', icon: 'Flower', page: ['standard', 'A4', 'portrait'],
      fields: [['title', 'Title', 'Family Calendar'], ['month', 'Month', MONTHS[next.getMonth()]], ['year', 'Year', String(next.getFullYear())]] },
  };
}

export function clipByName(name) {
  return CLIPART.find((c) => c.name === name);
}
export function clipDataUrl(c) {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(c.svg)))}`;
}

function pick(list, fonts) {
  for (const f of list) if (fonts.includes(f)) return f;
  return list[list.length - 1];
}

// A tiny seeded random generator so the confetti is the same every time.
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

class Builder {
  constructor(typeId, type, theme, fonts) {
    this.doc = newDocument();
    const [layout, preset, orientation] = type.page;
    const size = pageSize(layout, preset, orientation || 'portrait', {});
    this.doc.page = { ...this.doc.page, layout, preset, orientation: orientation || 'portrait', ...size, background: theme.bg };
    this.doc.meta = { name: type.name, project: typeId, theme: theme.id };
    this.doc.grid.dots = 'never';
    this.W = size.width; this.H = size.height;
    this.t = theme;
    this.headFont = pick(theme.head, fonts);
    this.bodyFont = pick(theme.body, fonts);
  }
  add(o) { this.doc.objects.push(o); return o; }
  shape(kind, x, y, w, h, { fill = this.t.primary, line = 'none', lineColor = '#000', lineWidth = 1, shadow = false } = {}) {
    const o = createObject(this.doc, 'shape', { kind, x, y, w, h });
    o.fill = fill === 'none' ? { ...o.fill, style: 'none' } : { ...o.fill, style: 'solid', color: fill };
    o.line = line === 'none' ? { ...o.line, style: 'none' } : { ...o.line, style: line, width: lineWidth, color: lineColor };
    if (shadow) o.shadow = { style: 'soft', color: '#9a9a9a' };
    return this.add(o);
  }
  rect(x, y, w, h, opts) { return this.shape('rect', x, y, w, h, opts); }
  line(x1, y1, x2, y2, color = this.t.secondary, width = 1) {
    const o = createObject(this.doc, 'line', { kind: 'straight', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
    o.points = [{ x: x1 - o.x, y: y1 - o.y }, { x: x2 - o.x, y: y2 - o.y }];
    o.fill = { ...o.fill, style: 'none' };
    o.line = { ...o.line, style: width <= 1 ? 'hairline' : 'wide', width, color };
    return this.add(o);
  }
  // Text centred on cx (or starting at x when align is 'left'), top at y. sizeFrac is a fraction of page width.
  text(content, { x = this.W / 2, y, sizeFrac = 0.05, maxW = this.W * 0.86, head = false, bold, italic, color = this.t.text, align = 'center' } = {}) {
    if (!content) return null;
    const o = createObject(this.doc, 'text', { kind: 'text', content });
    o.fill = { ...o.fill, style: 'none' };
    o.line = { ...o.line, style: 'none' };
    o.text = {
      ...o.text, font: head ? this.headFont : this.bodyFont, size: Math.max(4, (this.W * sizeFrac) / PX_PER_PT),
      bold: bold ?? (head && !!this.t.headBold), italic: italic ?? (head && !!this.t.headItalic), color, align, bg: 'none',
    };
    updateTextMetrics(o);
    if (o.w > maxW) { o.text.size *= maxW / o.w; o.nw = null; o.w = 0; o.h = 0; updateTextMetrics(o); }
    o.y = y;
    o.x = align === 'left' ? x : align === 'right' ? x - o.w : x - o.w / 2;
    return this.add(o);
  }
  clip(name, x, y, w, h = w) {
    const c = clipByName(name);
    if (!c) return null;
    const id = `clip${name.replace(/\W/g, '')}`;
    this.doc.images[id] = clipDataUrl(c);
    const o = createObject(this.doc, 'image', { kind: 'image', imageId: id, name: c.name, x, y, w, h });
    o.fill = { ...o.fill, style: 'none' };
    o.line = { ...o.line, style: 'none' };
    return this.add(o);
  }
  decorate() {
    const { W, H, t } = this;
    const m = Math.min(W, H);
    switch (t.deco) {
      case 'frame': {
        const inset = m * 0.035;
        this.shape('borderframe', inset, inset, W - 2 * inset, H - 2 * inset, { fill: t.primary });
        const i2 = inset + m * 0.075;
        this.rect(i2, i2, W - 2 * i2, H - 2 * i2, { fill: 'none', line: 'wide', lineWidth: 0.75, lineColor: t.secondary });
        break;
      }
      case 'confetti': {
        const r = rng(7);
        const colors = [t.primary, t.secondary, t.accent, '#2ec4b6'];
        for (let i = 0; i < 26; i++) {
          const edge = i % 4;
          const s = m * (0.02 + r() * 0.03);
          let x = r() * (W - s), y = r() * (H - s);
          if (edge === 0) y = r() * H * 0.08; else if (edge === 1) y = H - s - r() * H * 0.08;
          else if (edge === 2) x = r() * W * 0.07; else x = W - s - r() * W * 0.07;
          const kind = i % 3 === 0 ? 'star' : i % 3 === 1 ? 'circle' : 'triangle';
          const o = this.shape(kind, x, y, s, s, { fill: colors[i % colors.length] });
          o.rot = Math.round(r() * 60 - 30);
        }
        break;
      }
      case 'ornament': {
        const i1 = m * 0.04, i2 = m * 0.055;
        this.rect(i1, i1, W - 2 * i1, H - 2 * i1, { fill: 'none', line: 'wide', lineWidth: 1.5, lineColor: t.primary });
        this.rect(i2, i2, W - 2 * i2, H - 2 * i2, { fill: 'none', line: 'hairline', lineColor: t.secondary });
        const bw = Math.min(W * 0.4, m * 0.7), bh = m * 0.03;
        this.shape('borderline', (W - bw) / 2, i2 + m * 0.03, bw, bh, { fill: t.secondary });
        this.shape('borderline', (W - bw) / 2, H - i2 - m * 0.03 - bh, bw, bh, { fill: t.secondary });
        break;
      }
      case 'band': {
        this.rect(0, 0, W, H * 0.035, { fill: t.primary });
        this.rect(0, H * 0.035, W * 0.3, H * 0.012, { fill: t.secondary });
        this.rect(0, H - H * 0.02, W, H * 0.02, { fill: t.primary });
        break;
      }
      default: break;
    }
  }
}

function parseMonth(v) {
  const s = String(v || '').trim().toLowerCase();
  const n = parseInt(s, 10);
  if (n >= 1 && n <= 12) return n - 1;
  const i = MONTHS.findIndex((m) => m.toLowerCase().startsWith(s.slice(0, 3)));
  return i >= 0 ? i : new Date().getMonth();
}

const LAYOUTS = {
  greeting(b, v) {
    const { W, H, t } = b;
    b.decorate();
    const s = Math.min(W, H) * 0.42;
    b.clip(b.clipName || 'Balloons', (W - s) / 2, H * 0.13, s);
    b.text(v.title, { y: H * 0.54, sizeFrac: 0.11, head: true, color: t.primary, maxW: W * 0.8 });
    b.text(v.message, { y: H * 0.7, sizeFrac: 0.045, maxW: W * 0.78 });
    b.text(v.from, { y: H * 0.8, sizeFrac: 0.04, italic: true, color: t.secondary, maxW: W * 0.78 });
  },
  invitation(b, v) {
    const { W, H, t } = b;
    b.decorate();
    b.text(v.title, { y: H * 0.11, sizeFrac: 0.1, head: true, color: t.primary, maxW: W * 0.8 });
    const s = Math.min(W, H) * 0.26;
    b.clip(b.clipName || 'Gift', (W - s) / 2, H * 0.24, s);
    b.text(v.event, { y: H * 0.47, sizeFrac: 0.06, bold: true, maxW: W * 0.8 });
    b.line(W * 0.3, H * 0.57, W * 0.7, H * 0.57, t.secondary, 1);
    b.text(v.when, { y: H * 0.6, sizeFrac: 0.042, maxW: W * 0.8 });
    b.text(v.where, { y: H * 0.67, sizeFrac: 0.042, maxW: W * 0.8 });
    b.text(v.rsvp, { y: H * 0.8, sizeFrac: 0.034, italic: true, color: t.secondary, maxW: W * 0.8 });
  },
  sign(b, v) {
    const { W, H, t } = b;
    b.decorate();
    b.text(v.title, { y: H * 0.11, sizeFrac: 0.14, head: true, color: t.primary, maxW: W * 0.82 });
    b.text(v.sub, { y: H * 0.27, sizeFrac: 0.06, color: t.secondary, bold: true, maxW: W * 0.8 });
    const s = W * 0.32;
    b.clip(b.clipName || 'Star', (W - s) / 2, H * 0.37, s);
    b.text(v.details, { y: H * 0.66, sizeFrac: 0.055, maxW: W * 0.8 });
  },
  certificate(b, v) {
    const { W, H, t } = b;
    const keep = t.deco;
    if (t.deco === 'confetti' || t.deco === 'band') { b.t = { ...t, deco: 'ornament' }; }
    b.decorate();
    b.t = { ...b.t, deco: keep };
    b.text(v.title, { y: H * 0.15, sizeFrac: 0.055, head: true, color: t.primary, maxW: W * 0.75 });
    b.text('This certificate is presented to', { y: H * 0.31, sizeFrac: 0.022, italic: true });
    b.text(v.name, { y: H * 0.38, sizeFrac: 0.065, head: true, italic: true, color: t.secondary, maxW: W * 0.7 });
    b.line(W * 0.25, H * 0.53, W * 0.75, H * 0.53, t.secondary, 1);
    b.text(v.reason, { y: H * 0.57, sizeFrac: 0.026, maxW: W * 0.7 });
    const yb = H * 0.8;
    b.line(W * 0.14, yb, W * 0.38, yb, t.text, 0.75);
    b.line(W * 0.62, yb, W * 0.86, yb, t.text, 0.75);
    b.text(v.date, { x: W * 0.26, y: yb - H * 0.055, sizeFrac: 0.02 });
    b.text('Date', { x: W * 0.26, y: yb + H * 0.012, sizeFrac: 0.016, color: '#666666' });
    b.text(v.signed, { x: W * 0.74, y: yb - H * 0.055, sizeFrac: 0.022, italic: true, head: true });
    b.text('Signature', { x: W * 0.74, y: yb + H * 0.012, sizeFrac: 0.016, color: '#666666' });
    const s = H * 0.16;
    b.shape('starburst', (W - s) / 2, yb - s * 0.7, s, s, { fill: t.secondary });
    b.shape('circle', (W - s * 0.62) / 2, yb - s * 0.7 + s * 0.19, s * 0.62, s * 0.62, { fill: t.primary });
  },
  business(b, v) {
    const { W, H, t } = b;
    b.rect(0, 0, W * 0.035, H, { fill: t.primary });
    b.rect(W * 0.035, 0, W * 0.012, H, { fill: t.secondary });
    const x = W * 0.1;
    b.text(v.name, { x, y: H * 0.14, sizeFrac: 0.075, head: true, color: t.primary, align: 'left', maxW: W * 0.82 });
    b.text(v.job, { x, y: H * 0.33, sizeFrac: 0.042, color: t.secondary, align: 'left', italic: true, maxW: W * 0.82 });
    b.text(v.company, { x, y: H * 0.5, sizeFrac: 0.05, bold: true, align: 'left', maxW: W * 0.82 });
    b.line(x, H * 0.66, W * 0.92, H * 0.66, t.accent === '#ffffff' ? '#dddddd' : t.secondary, 0.75);
    const contact = [v.phone, v.email].filter(Boolean).join('   ·   ');
    b.text(contact, { x, y: H * 0.71, sizeFrac: 0.034, align: 'left', maxW: W * 0.82 });
    b.text(v.address, { x, y: H * 0.83, sizeFrac: 0.03, align: 'left', color: '#555555', maxW: W * 0.82 });
  },
  banner(b, v) {
    const { W, H, t } = b;
    b.decorate();
    b.text(v.title, { y: H * 0.24, sizeFrac: 0.09, head: true, color: t.primary, maxW: W * 0.78 });
    const s = H * 0.42;
    b.shape('star', W * 0.035, (H - s) / 2, s, s, { fill: t.secondary });
    b.shape('star', W - W * 0.035 - s, (H - s) / 2, s, s, { fill: t.secondary });
  },
  label(b, v) {
    const { W, H, t } = b;
    b.rect(0, 0, W, H, { fill: t.accent === '#eef0f3' ? '#ffffff' : t.bg, line: 'hairline', lineColor: '#cccccc' });
    b.rect(W * 0.05, H * 0.18, W * 0.018, H * 0.64, { fill: t.primary });
    const x = W * 0.11;
    b.text(v.line1, { x, y: H * 0.17, sizeFrac: 0.07, head: true, color: t.primary, align: 'left', maxW: W * 0.82 });
    b.text(v.line2, { x, y: H * 0.47, sizeFrac: 0.05, align: 'left', maxW: W * 0.82 });
    b.text(v.line3, { x, y: H * 0.66, sizeFrac: 0.05, align: 'left', maxW: W * 0.82 });
  },
  postcard(b, v) {
    const { W, H, t } = b;
    b.decorate();
    const s = H * 0.36;
    b.clip(b.clipName || 'Sun', W * 0.68, H * 0.12, s);
    b.text(v.title, { x: W * 0.1, y: H * 0.2, sizeFrac: 0.055, italic: true, color: t.secondary, align: 'left', maxW: W * 0.55 });
    b.text(v.place, { x: W * 0.1, y: H * 0.33, sizeFrac: 0.12, head: true, color: t.primary, align: 'left', maxW: W * 0.6 });
    b.text(v.message, { x: W * 0.1, y: H * 0.68, sizeFrac: 0.04, align: 'left', maxW: W * 0.8 });
  },
  calendar(b, v) {
    const { W, H, t } = b;
    const month = parseMonth(v.month);
    const year = parseInt(v.year, 10) || new Date().getFullYear();
    if (t.deco === 'band' || t.deco === 'confetti') b.decorate();
    b.text(v.title, { y: H * 0.05, sizeFrac: 0.06, head: true, color: t.primary, maxW: W * 0.7 });
    b.text(`${MONTHS[month]} ${year}`, { y: H * 0.12, sizeFrac: 0.05, color: t.secondary, bold: true });
    const s = W * 0.14;
    b.clip(b.clipName || 'Flower', W * 0.82 - s / 2, H * 0.045, s);
    const mx = W * 0.06, top = H * 0.22, gw = W - 2 * mx, gh = H * 0.72;
    const cw = gw / 7, hh = H * 0.035;
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d, i) => {
      b.rect(mx + i * cw, top, cw, hh, { fill: t.primary, line: 'hairline', lineColor: t.primary });
      b.text(d, { x: mx + i * cw + cw / 2, y: top + hh * 0.18, sizeFrac: 0.022, color: '#ffffff', bold: true });
    });
    const first = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const rows = Math.ceil((first + days) / 7);
    const ch = (gh - hh) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 7; c++) {
        const day = r * 7 + c - first + 1;
        const x = mx + c * cw, y = top + hh + r * ch;
        b.rect(x, y, cw, ch, { fill: c >= 5 ? t.accent : '#ffffff', line: 'hairline', lineColor: '#9aa0a6' });
        if (day >= 1 && day <= days) b.text(String(day), { x: x + cw * 0.08, y: y + ch * 0.06, sizeFrac: 0.026, align: 'left', bold: true, color: c >= 5 ? t.secondary : t.text });
      }
    }
  },
};

export function buildProject(typeId, themeId, values, fonts, wizardDefaults = {}) {
  const types = projectTypes(wizardDefaults);
  const type = types[typeId];
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const v = {};
  for (const [key, , def] of type.fields) v[key] = values && values[key] != null ? values[key] : def;
  const b = new Builder(typeId, type, theme, fonts);
  b.clipName = type.icon;
  LAYOUTS[typeId](b, v);
  return b.doc;
}
