// Unit test for the .DRW reader: builds a small synthetic drawing with the main
// object kinds, reads it back and converts it. Usage: node test/drw-unit.mjs
import { parseDrw, drwToDocument, readRecords, SYM } from '../src/renderer/js/drw.js';

let failed = 0;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) failed++; };

// ---- a tiny DRW writer -------------------------------------------------------
const bytes = [];
function record(cmd, payload) {
  const enc = [];
  const packed = cmd < 96 || cmd > 160;
  for (const b of payload) { if (packed && b === 0xff) enc.push(0xff, 1, 0xff); else enc.push(b); }
  const len = payload.length;
  if (len >= 0xff) bytes.push(0xff, len & 0xff, len >> 8); else bytes.push(len);
  bytes.push(cmd, ...enc);
}
const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];
const rgb = (r, g, b) => [r, g, b, 0];
function symbol(type, { flags = 0x80, box, rot = 0, line = rgb(0, 0, 0), extra = {} }) {
  const d = new Array(85).fill(0);
  const put = (off, arr) => arr.forEach((b, i) => { d[off + i] = b; });
  put(0, [type, flags]);
  put(6, [...u16(box[0]), ...u16(box[1]), ...u16(box[2]), ...u16(box[3])]);
  put(14, u16(Math.round(rot * 10) & 0xffff));
  put(16, u16(1));
  put(20, line);
  for (const [off, arr] of Object.entries(extra)) put(Number(off), arr);
  record(7, d);
}

record(255, [2]);
record(25, u16(100));                 // 100 units per inch
record(26, [0, 0, 10, 0, 10, 0, 1, 0]); // inch rulers
record(27, [...u16(850), ...u16(1100), 0, 0, 0, 0, 0, 0, 0, 0]);
record(1, rgb(255, 255, 240));
record(30, [1, 1, 0, 0, ...u16(0)]); // gradient 1: linear
const fontRec = new Array(0x13).fill(0); fontRec[0] = 1;
record(21, [...fontRec, ...Array.from('Arial', (c) => c.charCodeAt(0)), 0]);

// 1 red rectangle
symbol(SYM.RECT, { box: [100, 100, 300, 200], extra: { 34: [0x40, ...rgb(255, 0, 0)], 39: [0, 0, 0, 0, ...u16(200), ...u16(100)], 60: u16(5) } });
// 2 ellipse with a gradient
symbol(SYM.FILLED_ELLIPSE, { box: [400, 100, 500, 300], extra: { 34: [0x41, ...rgb(0, 0, 255)], 39: [0, 0, 0, 0, ...u16(100), ...u16(200)], 56: rgb(255, 255, 255) } });
// 3 group of a polyline and a line
symbol(SYM.GROUP, { box: [100, 400, 400, 600], extra: { 0x26: u16(2) } });
symbol(SYM.POLYLINE, { box: [0, 0, 300, 100], extra: { 34: [0], 41: u16(3) } });
record(6, [...u16(0), ...u16(0), ...u16(150), ...u16(100), ...u16(300), ...u16(0)]);
symbol(SYM.LINE, { box: [0, 150, 300, 200], extra: { 34: [...u16(0), ...u16(200), ...u16(300), ...u16(150)], 42: [3] } });
// 4 bezier
symbol(SYM.FILLED_BEZIER, { box: [500, 400, 700, 600], rot: 30, extra: { 34: [0x40, ...rgb(0, 128, 0)], 41: u16(4) } });
record(6, [...u16(0), ...u16(0), ...u16(100), ...u16(200), ...u16(200), ...u16(0), ...u16(0), ...u16(0)]);
// 5 complex object made of two arcs
symbol(SYM.COMPLEX, { box: [100, 700, 300, 900], extra: { 34: [0x40, ...rgb(200, 200, 0)], 0x2b: u16(2) } });
symbol(SYM.ARC, { box: [0, 0, 200, 100], extra: { 34: [0], 39: [...u16(200), ...u16(100), ...u16(0), ...u16(100), 0, 0, 0, 0, ...u16(200), ...u16(200)] } });
symbol(SYM.LINE, { box: [0, 100, 200, 100], extra: { 34: [...u16(0), ...u16(100), ...u16(200), ...u16(100)], 42: [0] } });
// 6 simple text
symbol(SYM.TEXT, { box: [400, 700, 700, 760], line: rgb(0, 0, 128), extra: { 34: [0, 0, 1, ...u16(11), ...u16(40)] } });
record(8, Array.from('Hello\rworld', (c) => c.charCodeAt(0)));
// 7 an 8-bit 2x2 bitmap stored as bands
symbol(SYM.BITMAP, { box: [700, 900, 800, 1000], extra: { 36: [0, 0, 0, 0, 1, 0, 1, 0], 44: [...u16(8), ...u16(2), ...u16(1), ...u16(2), ...u16(2)] } });
record(32, [...u16(0), ...u16(0), ...u16(2), ...u16(2), 0, 1, 2, 3]);
const pal = []; for (let i = 0; i < 256; i++) pal.push(i * 50 & 0xff, 0, 0, 0);
record(35, pal);
record(254, []);

// ---- read it back ----------------------------------------------------------------
const file = new Uint8Array(bytes);
if (process.argv[2]) (await import('node:fs')).writeFileSync(process.argv[2], file);
check(readRecords(file).length > 20, 'records decode');
const drw = parseDrw(file);
check(drw.width === 850 && drw.height === 1100 && drw.metric === false, 'page size and units');
check(drw.items.length === 7, `7 top-level objects (got ${drw.items.length})`);
check(drw.items[2].children.length === 2, 'group holds its two members');
check(drw.items[4].children.length === 2, 'complex object holds its two parts');
check(drw.items[5].text === 'Hello\rworld', 'simple text read');
check(drw.items[6].bands && drw.items[6].palette, 'bitmap bands and colour table read');

const { doc } = await drwToDocument(drw, { encodeImage: (rgba, w, h) => `data:test;${w}x${h};${rgba[4]}` });
check(Math.round(doc.page.width) === 816 && Math.round(doc.page.height) === 1056, 'page is 8.5 x 11 inches');
check(doc.page.background === '#fffff0', 'background colour');
const [rect, ell, grp, bez, cpx, txt, img] = doc.objects;
check(rect.type === 'shape' && rect.kind === 'rect' && rect.fill.color === '#ff0000' && Math.round(rect.w) === 192, 'red rectangle');
check(rect.line.style === 'wide' && rect.line.width === 3.5, `5-unit outline becomes a 3.5 pt line (got ${rect.line.style} ${rect.line.width})`);
check(ell.kind === 'ellipse' && ell.fill.style === 'gradient', 'gradient ellipse');
check(grp.type === 'group' && grp.children.length === 2 && Math.round(grp.x) === 96, 'group');
check(bez.type === 'path' && /C/.test(bez.d), 'rotated bezier becomes a curve object');
check(cpx.type === 'path' && cpx.closed && cpx.fill.color === '#c8c800', 'complex object becomes one filled curve');
check(txt.type === 'text' && txt.content === 'Hello\nworld' && txt.text.font === 'Arial' && txt.text.color === '#000080', 'text');
check(img.type === 'image' && doc.images[img.imageId] === 'data:test;2x2;50', 'bitmap from bands');
const nan = JSON.stringify(doc).includes('NaN');
check(!nan, 'no NaN anywhere');
process.exit(failed ? 1 : 0);
