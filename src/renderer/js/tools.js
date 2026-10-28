// Mouse interaction for every tool.

import {
  apply, invert, objMatrix, objBounds, normRect, rectContains, constrainDirection, dist, rad2deg,
  snapAngle, simplify, fromCm, f,
} from './geometry.js';
import { History, createObject, clone, findObject } from './model.js';
import { SHAPE_INFO, LINE_INFO } from './shapes.js';
import {
  resizeObject, resizeMany, rotateObjects, slantObject, selectionBounds, setPagePoints, refitPoints,
  reId, centerOf,
} from './transform.js';
import { updateTextMetrics } from './render.js';

const DRAG_THRESHOLD = 3; // screen px

export class Tools {
  constructor(editor, app) {
    this.ed = editor;
    this.app = app;
    this.drag = null;
    this.click = null; // multi-click drawing in progress
    this.painterStyle = null;
    const svg = editor.svg;
    svg.addEventListener('pointerdown', (e) => this.down(e));
    svg.addEventListener('pointermove', (e) => this.move(e));
    svg.addEventListener('pointerup', (e) => this.up(e));
    svg.addEventListener('pointercancel', (e) => this.up(e));
    svg.addEventListener('dblclick', (e) => this.dblclick(e));
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    // Don't let a click on the canvas steal focus from the text editor.
    svg.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (document.activeElement && document.activeElement !== document.body && !this.app.textEditor.active) document.activeElement.blur();
    });
    svg.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
  }

  get tool() { return this.ed.tool; }

  page(e) { return this.ed.clientToPage(e.clientX, e.clientY); }

  hitObject(e) {
    const el = e.target.closest && e.target.closest('[data-id]');
    if (!el || el.closest('.locked')) return null;
    const o = findObject(this.ed.doc, el.dataset.id);
    return o && this.ed.isEditable(o) ? o : null;
  }

  // ---------- dispatch ----------
  down(e) {
    if (e.button !== 0 && e.button !== 2) return;
    if (this.app.textEditor.active) {
      this.app.textEditor.commit();
      if (this.tool.name === 'text') return;
    }
    this.app.closePopups();
    const p = this.page(e);
    this.ed.cursor = p;
    if (e.button === 2) {
      const o = this.hitObject(e);
      if (o && !this.ed.selection.includes(o.id)) this.ed.select(o.id);
      return;
    }
    this.ed.svg.setPointerCapture(e.pointerId);
    switch (this.tool.name) {
      case 'select': case 'rotate': case 'points': this.selectDown(e, p); break;
      case 'zoom': this.drag = { type: 'zoom', start: p, client: { x: e.clientX, y: e.clientY }, shift: e.shiftKey || e.altKey }; break;
      case 'text': this.textDown(e, p); break;
      case 'line': case 'connector': this.lineDown(e, p); break;
      case 'shape': this.shapeDown(e, p); break;
      case 'painter': this.painterDown(e); break;
      default: break;
    }
  }

  move(e) {
    const p = this.page(e);
    this.ed.cursor = p;
    this.ed.emit('cursor');
    if (this.click) { this.clickMove(e, p); return; }
    const d = this.drag;
    if (!d) return;
    if (!d.moved) {
      const dx = e.clientX - (d.client?.x ?? e.clientX), dy = e.clientY - (d.client?.y ?? e.clientY);
      if (d.client && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
    }
    switch (d.type) {
      case 'move': this.dragMove(e, p); break;
      case 'resize': this.dragResize(e, p); break;
      case 'rotate': this.dragRotate(e, p); break;
      case 'slant': this.dragSlant(e, p); break;
      case 'point': this.dragPoint(e, p); break;
      case 'marquee': case 'zoom': this.dragMarquee(e, p); break;
      case 'draw-shape': this.drawShapeMove(e, p); break;
      case 'draw-line': this.drawLineMove(e, p); break;
      default: break;
    }
    this.ed.invalidate();
  }

  up(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    try { this.ed.svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    switch (d.type) {
      case 'move': case 'resize': case 'rotate': case 'slant': case 'point':
        if (d.moved) this.ed.commitSnapshot(d.snap);
        this.ed.preview = null;
        this.app.setHint('');
        break;
      case 'marquee': this.finishMarquee(d, e); break;
      case 'zoom': this.finishZoom(d, e); break;
      case 'draw-shape': this.finishShape(d); break;
      case 'draw-line': this.finishLine(d); break;
      default: break;
    }
    this.ed.invalidate();
    this.ed.emit('selection');
  }

  dblclick(e) {
    if (this.click) { this.finishClick(); return; }
    if (!['select', 'rotate', 'points'].includes(this.tool.name)) return;
    const o = this.hitObject(e);
    if (!o) return;
    if (o.type === 'text') this.app.textEditor.start(o, 'text');
    else if (o.type === 'shape' || o.type === 'line' || o.type === 'path') this.app.textEditor.start(o, 'label');
  }

  wheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0025);
      this.ed.setZoom(this.ed.zoom * factor, null, { x: e.clientX, y: e.clientY });
    }
  }

  // ---------- select tool ----------
  selectDown(e, p) {
    const ed = this.ed;
    const handleEl = e.target.closest && e.target.closest('.handle');
    const snap = History.snapshot(ed.doc);
    const client = { x: e.clientX, y: e.clientY };
    if (handleEl) {
      const sel = ed.selected();
      const kind = handleEl.dataset.kind;
      const id = handleEl.dataset.handle;
      const originals = sel.map(clone);
      if (kind === 'size') {
        this.drag = { type: 'resize', handle: id, originals, objs: sel, bounds: selectionBounds(sel), snap, client };
      } else if (kind === 'rotate') {
        const b = selectionBounds(sel);
        const pivot = sel.length === 1 ? centerOf(sel[0]) : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        this.drag = { type: 'rotate', pivot, startAngle: Math.atan2(p.y - pivot.y, p.x - pivot.x), originals, objs: sel, snap, client };
      } else if (kind === 'slant') {
        this.drag = { type: 'slant', handle: id, start: p, originals, objs: sel, snap, client };
      } else if (kind === 'endpoint' || kind === 'point') {
        this.drag = { type: 'point', index: Number(handleEl.dataset.index), originals, objs: sel, snap, client };
      }
      return;
    }
    const o = this.hitObject(e);
    if (o) {
      if (e.shiftKey) { ed.select(o.id, true); return; }
      if (!ed.selection.includes(o.id)) {
        if (ed.prefs.blockSelect) {
          ed.deselect();
          this.drag = { type: 'marquee', start: p, client, add: false };
          return;
        }
        ed.select(o.id);
      }
      const sel = ed.selected();
      this.drag = { type: 'move', start: p, originals: sel.map(clone), objs: sel, bounds: selectionBounds(sel), snap, client, copy: e.altKey || e.ctrlKey };
      return;
    }
    if (!e.shiftKey) ed.deselect();
    this.drag = { type: 'marquee', start: p, client, add: e.shiftKey };
  }

  dragMove(e, p) {
    const d = this.drag;
    if (d.copy && !d.copied) {
      // Ctrl/Alt-drag leaves a copy behind.
      d.copied = true;
      const copies = d.originals.map((o) => reId(clone(o)));
      for (const c of copies) {
        const idx = this.ed.doc.objects.findIndex((x) => x.id === d.objs[0].id);
        this.ed.doc.objects.splice(Math.max(idx, 0), 0, c);
      }
    }
    let dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    if (this.ed.doc.grid.snap) {
      dx = this.ed.snapValue(d.bounds.x + dx) - d.bounds.x;
      dy = this.ed.snapValue(d.bounds.y + dy) - d.bounds.y;
      if (e.shiftKey) { if (Math.abs(p.x - d.start.x) > Math.abs(p.y - d.start.y)) dy = 0; else dx = 0; }
    }
    d.objs.forEach((o, i) => { o.x = d.originals[i].x + dx; o.y = d.originals[i].y + dy; });
    this.app.setHint(`Move: ${(dx / fromCm(1)).toFixed(2)}, ${(dy / fromCm(1)).toFixed(2)} cm`);
  }

  dragResize(e, p) {
    const d = this.drag;
    const q = this.ed.doc.grid.snap ? this.ed.snap(p) : p;
    if (d.objs.length === 1) {
      const o = d.objs[0], o0 = d.originals[0];
      const forced = o0.type === 'shape' && SHAPE_INFO[o0.kind]?.constrain;
      resizeObject(o, o0, d.handle, q, { keepRatio: e.shiftKey || forced, fromCenter: e.altKey || e.ctrlKey });
    } else {
      const ob = d.bounds;
      let l = ob.x, t = ob.y, r = ob.x + ob.w, b = ob.y + ob.h;
      if (d.handle.includes('w')) l = Math.min(q.x, r - 1);
      if (d.handle.includes('e')) r = Math.max(q.x, l + 1);
      if (d.handle.includes('n')) t = Math.min(q.y, b - 1);
      if (d.handle.includes('s')) b = Math.max(q.y, t + 1);
      if (e.shiftKey && ob.w && ob.h) {
        const s = Math.max((r - l) / ob.w, (b - t) / ob.h);
        if (d.handle.includes('w')) l = r - ob.w * s; else r = l + ob.w * s;
        if (d.handle.includes('n')) t = b - ob.h * s; else b = t + ob.h * s;
      }
      resizeMany(d.objs, d.originals, ob, { x: l, y: t, w: r - l, h: b - t });
    }
    const b = selectionBounds(d.objs);
    this.app.setHint(`Size: ${(b.w / fromCm(1)).toFixed(2)} x ${(b.h / fromCm(1)).toFixed(2)} cm`);
  }

  dragRotate(e, p) {
    const d = this.drag;
    let delta = rad2deg(Math.atan2(p.y - d.pivot.y, p.x - d.pivot.x) - d.startAngle);
    if (e.shiftKey) delta = snapAngle(delta, this.ed.prefs.constraintAngle || 15);
    rotateObjects(d.objs, d.originals, delta, d.pivot);
    this.app.setHint(`Rotate: ${Math.round(delta)}°`);
  }

  dragSlant(e, p) {
    const d = this.drag;
    slantObject(d.objs[0], d.originals[0], d.handle, d.start, p);
    const o = d.objs[0];
    this.app.setHint(`Slant: ${Math.round(o.skx || 0)}°, ${Math.round(o.sky || 0)}°`);
  }

  dragPoint(e, p) {
    const d = this.drag;
    const o = d.objs[0], o0 = d.originals[0];
    let q = this.ed.doc.grid.snap ? this.ed.snap(p) : p;
    const m0 = objMatrix(o0);
    if (e.shiftKey && o0.points.length >= 2) {
      const otherIdx = d.index === 0 ? 1 : d.index - 1;
      q = constrainDirection(apply(m0, o0.points[otherIdx]), q, this.ed.prefs.constraintAngle || 15);
    }
    const local = apply(invert(m0), q);
    const pts = o0.points.map((pt, i) => (i === d.index ? local : { ...pt }));
    Object.assign(o, clone(o0));
    refitPoints(o, pts);
  }

  dragMarquee(e, p) {
    const d = this.drag;
    const r = normRect(d.start, p);
    this.ed.marquee = r;
  }

  finishMarquee(d) {
    const r = this.ed.marquee;
    this.ed.marquee = null;
    if (!r || !d.moved) return;
    const ids = this.ed.doc.objects
      .filter((o) => this.ed.isEditable(o) && rectContains(r, objBounds(o)))
      .map((o) => o.id);
    if (d.add) {
      const set = new Set(this.ed.selection);
      ids.forEach((id) => set.add(id));
      this.ed.select([...set]);
    } else this.ed.select(ids);
  }

  finishZoom(d, e) {
    const r = this.ed.marquee;
    this.ed.marquee = null;
    if (r && d.moved && r.w * this.ed.zoom > 5 && r.h * this.ed.zoom > 5) {
      this.ed.zoomToRect(r);
    } else {
      this.ed.setZoom(this.ed.zoom * (d.shift || e.shiftKey || e.altKey ? 0.5 : 2), null, { x: e.clientX, y: e.clientY });
    }
  }

  // ---------- painter (pick up / apply style) ----------
  painterDown(e) {
    const o = this.hitObject(e);
    if (!o || !this.painterStyle) return;
    this.ed.checkpoint();
    const s = this.painterStyle;
    const applyTo = (x) => {
      if (x.type === 'group') { x.children.forEach(applyTo); return; }
      for (const k of ['fill', 'line', 'ends', 'shadow', 'text']) x[k] = clone(s[k]);
      if (x.type === 'text') updateTextMetrics(x);
    };
    applyTo(o);
    this.ed.select(o.id);
  }

  // ---------- text tool ----------
  textDown(e, p) {
    const hit = this.hitObject(e);
    if (hit && hit.type === 'text') { this.ed.select(hit.id); this.app.textEditor.start(hit, 'text'); return; }
    if (hit && this.ed.prefs.textToolLabel && hit.type !== 'group' && hit.type !== 'image') {
      this.ed.select(hit.id); this.app.textEditor.start(hit, 'label'); return;
    }
    const q = this.ed.snap(p);
    const snap = History.snapshot(this.ed.doc);
    const o = createObject(this.ed.doc, 'text', { kind: 'text', content: '', x: q.x, y: q.y });
    o.text.align = 'left';
    o.fill = { ...o.fill, style: 'none' };
    o.line = { ...o.line, style: 'none' };
    updateTextMetrics(o);
    // Put the click point at the text baseline-ish top-left.
    this.ed.addObjects([o]);
    this.app.textEditor.start(o, 'text', { isNew: true, snap });
  }

  // ---------- shapes ----------
  shapeDown(e, p) {
    const kind = this.tool.kind;
    if (SHAPE_INFO[kind]?.clicks) { this.clickDown(e, p, 'shape'); return; }
    const start = this.ed.snap(p);
    const snap = History.snapshot(this.ed.doc);
    const o = createObject(this.ed.doc, 'shape', { kind, x: start.x, y: start.y, w: 0, h: 0 });
    this.ed.doc.objects.push(o);
    this.ed.selection = [o.id];
    this.drag = { type: 'draw-shape', start, o, snap, client: { x: e.clientX, y: e.clientY } };
  }

  drawShapeMove(e, p) {
    const d = this.drag;
    const q = this.ed.snap(p);
    let dx = q.x - d.start.x, dy = q.y - d.start.y;
    if (e.shiftKey || SHAPE_INFO[d.o.kind]?.constrain) {
      const s = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * s; dy = Math.sign(dy || 1) * s;
    }
    let x = d.start.x, y = d.start.y, w = dx, h = dy;
    if (e.altKey || e.ctrlKey) { x -= dx; y -= dy; w = 2 * dx; h = 2 * dy; }
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    Object.assign(d.o, { x, y, w, h });
    this.app.setHint(`${(w / fromCm(1)).toFixed(2)} x ${(h / fromCm(1)).toFixed(2)} cm`);
  }

  finishShape(d) {
    const o = d.o;
    this.app.setHint('');
    if (!d.moved || (o.w < 3 && o.h < 3)) {
      // A single click: drop a shape of a friendly default size.
      const page = this.ed.doc.page;
      if (o.kind === 'borderframe') {
        const m = fromCm(0.6);
        Object.assign(o, { x: m, y: m, w: page.width - 2 * m, h: page.height - 2 * m });
      } else if (o.kind === 'borderline') {
        Object.assign(o, { w: fromCm(8), h: fromCm(0.6) });
      } else {
        const sq = SHAPE_INFO[o.kind]?.constrain;
        Object.assign(o, { w: fromCm(sq ? 2.5 : 3.5), h: fromCm(2.5) });
      }
    }
    o.w = Math.max(o.w, 1); o.h = Math.max(o.h, 1);
    this.ed.commitSnapshot(d.snap);
    this.ed.select(o.id);
  }

  // ---------- lines ----------
  lineDown(e, p) {
    const kind = this.tool.kind;
    if (LINE_INFO[kind]?.clicks) { this.clickDown(e, p, 'line'); return; }
    const start = kind === 'freehand' ? p : this.ed.snap(p);
    const snap = History.snapshot(this.ed.doc);
    const o = createObject(this.ed.doc, 'line', { kind, connector: this.tool.name === 'connector' });
    o.fill = { ...o.fill, style: 'none' };
    setPagePoints(o, [start, start]);
    this.ed.doc.objects.push(o);
    this.ed.selection = [o.id];
    this.drag = { type: 'draw-line', start, o, snap, raw: [start], client: { x: e.clientX, y: e.clientY } };
  }

  drawLineMove(e, p) {
    const d = this.drag;
    if (d.o.kind === 'freehand') {
      const last = d.raw[d.raw.length - 1];
      if (dist(last, p) * this.ed.zoom > 1.5) d.raw.push(p);
      setPagePoints(d.o, d.raw.length > 1 ? d.raw : [d.raw[0], p]);
      return;
    }
    let q = this.ed.snap(p);
    if (e.shiftKey) q = constrainDirection(d.start, q, this.ed.prefs.constraintAngle || 15);
    setPagePoints(d.o, [d.start, q]);
  }

  finishLine(d) {
    const o = d.o;
    if (o.kind === 'freehand' && d.raw.length > 2) {
      setPagePoints(o, simplify(d.raw, 1.2 / this.ed.zoom));
    }
    const pts = o.points;
    const len = pts.length >= 2 ? dist(pts[0], pts[pts.length - 1]) + (o.w + o.h) : 0;
    if (!d.moved || len < 2) {
      this.ed.removeObjects([o.id]);
      return;
    }
    this.ed.commitSnapshot(d.snap);
    this.ed.select(o.id);
  }

  // ---------- click-to-add-points drawing (polyline, curve, polygons) ----------
  clickDown(e, p, type) {
    const q = this.ed.snap(p);
    if (this.click) {
      if (e.detail >= 2) { this.finishClick(); return; }
      const last = this.click.pts[this.click.pts.length - 1];
      if (dist(last, q) < 1) return;
      this.click.pts.push(q);
      setPagePoints(this.click.o, [...this.click.pts, q]);
      this.ed.invalidate();
      return;
    }
    const snap = History.snapshot(this.ed.doc);
    const o = createObject(this.ed.doc, type, { kind: this.tool.kind, connector: this.tool.name === 'connector' });
    if (type === 'line') o.fill = { ...o.fill, style: 'none' };
    setPagePoints(o, [q, q]);
    this.ed.doc.objects.push(o);
    this.ed.selection = [o.id];
    this.click = { o, pts: [q], snap, type };
    this.app.setHint('Click to add points. Double-click, press Enter or click Finished to end.');
    this.ed.invalidate();
  }

  clickMove(e, p) {
    let q = this.ed.snap(p);
    const c = this.click;
    if (e.shiftKey) q = constrainDirection(c.pts[c.pts.length - 1], q, this.ed.prefs.constraintAngle || 15);
    setPagePoints(c.o, [...c.pts, q]);
    this.ed.invalidate();
  }

  finishClick() {
    const c = this.click;
    if (!c) return;
    this.click = null;
    this.app.setHint('');
    // remove consecutive duplicates
    const pts = [];
    for (const pt of c.pts) if (!pts.length || dist(pts[pts.length - 1], pt) > 0.5) pts.push(pt);
    const need = c.type === 'shape' ? 3 : 2;
    if (pts.length < need) { this.ed.removeObjects([c.o.id]); return; }
    setPagePoints(c.o, pts);
    this.ed.commitSnapshot(c.snap);
    this.ed.select(c.o.id);
  }

  cancelClick() {
    const c = this.click;
    if (!c) return false;
    this.click = null;
    this.app.setHint('');
    this.ed.removeObjects([c.o.id]);
    return true;
  }

  // Called when the tool changes or Finished is pressed.
  finishAll() {
    if (this.click) this.finishClick();
  }
}
