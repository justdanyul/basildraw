// The Editor: owns the document, selection, view, history and drawing on screen.

import {
  objMatrix, objCorners, objBounds, apply, f, cm, fromCm, clamp, unionBounds,
} from './geometry.js';
import {
  newDocument, History, paintOrder, findObject, clone, typeName, layerOf, newId,
} from './model.js';
import { renderObject, updateTextMetrics, esc } from './render.js';
import { selectionBounds } from './transform.js';

const HANDLE_PX = 8;

export class Editor {
  constructor(root) {
    this.root = root;
    this.svg = root.querySelector('#canvas');
    this.scroller = root.querySelector('#scroller');
    this.pasteboard = root.querySelector('#pasteboard');
    this.gPage = this.svg.querySelector('#page-g');
    this.gObjects = this.svg.querySelector('#objects');
    this.gOverlay = this.svg.querySelector('#overlay');
    this.imgDefs = this.svg.querySelector('#imgdefs');
    this.listeners = new Set();
    this.prefs = {
      showStartup: true, blockSelect: false, undoLevels: 100, constraintAngle: 15,
      showFinished: true, textToolLabel: false, rulers: false, statusBar: true,
      toolbars: { standard: true, format: true, toolbox: true },
      wizard: { name: '', company: '', address: '', phone: '', email: '' },
    };
    this.doc = newDocument();
    this.history = new History(this.prefs.undoLevels);
    this.selection = [];
    this.zoom = 1;
    this.zoomMode = 'page';
    this.prevZoom = null;
    this.proof = true;
    this.handleMode = 'size'; // 'size' | 'rotate'
    this.tool = { name: 'select', kind: null };
    this.filePath = null;
    this.docName = 'Drawing1';
    this.dirty = false;
    this.cursor = null;
    this.marquee = null;
    this.preview = null; // extra overlay markup during tool interaction
    this.hiddenIds = new Set(); // objects hidden while their text is being edited
    this.renderedImages = new Set();
    this.uid = Math.random().toString(36).slice(2, 6);
    this._frame = null;
    this.resizeObserver = new ResizeObserver(() => { if (this.zoomMode) this.fitZoom(this.zoomMode); });
    this.resizeObserver.observe(this.scroller);
  }

  // ---------- events ----------
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { for (const fn of this.listeners) fn(what); }

  // ---------- document lifecycle ----------
  loadDocument(doc, filePath = null, name = null) {
    this.doc = doc;
    this.filePath = filePath;
    this.docName = name || (filePath ? filePath.split(/[\\/]/).pop().replace(/\.[bp]draw$/i, '') : 'Drawing1');
    this.history = new History(this.prefs.undoLevels);
    this.selection = [];
    this.dirty = false;
    this.renderedImages.clear();
    this.imgDefs.innerHTML = '';
    for (const o of this.doc.objects) this.refreshTextMetrics(o);
    this.fitZoom('page');
    this.invalidate();
    this.emit('document');
  }

  refreshTextMetrics(o) {
    if (o.type === 'text') updateTextMetrics(o);
    if (o.type === 'group') o.children.forEach((c) => this.refreshTextMetrics(c));
  }

  setDirty(d = true) {
    if (this.dirty !== d) { this.dirty = d; this.emit('dirty'); }
  }

  // Call before changing the document; records an undo step.
  checkpoint() {
    this.history.limit = this.prefs.undoLevels;
    this.history.record(this.doc);
    this.setDirty(true);
  }

  // Record a snapshot that was taken before an interactive change.
  commitSnapshot(snap) {
    this.history.limit = this.prefs.undoLevels;
    this.history.undoStack.push(snap);
    if (this.history.undoStack.length > this.history.limit) this.history.undoStack.shift();
    this.history.redoStack = [];
    this.setDirty(true);
  }

  undo() {
    const d = this.history.undo(this.doc);
    if (!d) return;
    this.doc = d;
    this.selection = this.selection.filter((id) => findObject(this.doc, id));
    this.setDirty(true);
    this.invalidate();
    this.emit('document');
  }

  redo() {
    const d = this.history.redo(this.doc);
    if (!d) return;
    this.doc = d;
    this.selection = this.selection.filter((id) => findObject(this.doc, id));
    this.setDirty(true);
    this.invalidate();
    this.emit('document');
  }

  // ---------- selection ----------
  selected() {
    return this.selection.map((id) => findObject(this.doc, id)).filter(Boolean);
  }
  select(ids, add = false) {
    const list = Array.isArray(ids) ? ids : [ids];
    if (add) {
      for (const id of list) {
        if (this.selection.includes(id)) this.selection = this.selection.filter((s) => s !== id);
        else this.selection.push(id);
      }
    } else this.selection = list.slice();
    this.invalidate();
    this.emit('selection');
  }
  deselect() {
    if (!this.selection.length) return;
    this.selection = [];
    this.invalidate();
    this.emit('selection');
  }
  isEditable(o) {
    const layer = layerOf(this.doc, o.layer);
    if (layer && (!layer.visible || layer.locked)) return false;
    if (!this.doc.editAllLayers && o.layer !== this.doc.activeLayer && layer) return false;
    return true;
  }
  selectAll() {
    this.select(this.doc.objects.filter((o) => this.isEditable(o)).map((o) => o.id));
  }

  // ---------- coordinates ----------
  get margin() {
    const { width, height } = this.doc.page;
    return Math.round(Math.max(width, height) * 0.35 + 60);
  }
  clientToPage(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    return {
      x: (clientX - r.left) / this.zoom - this.margin,
      y: (clientY - r.top) / this.zoom - this.margin,
    };
  }
  pageToClient(p) {
    const r = this.svg.getBoundingClientRect();
    return { x: r.left + (p.x + this.margin) * this.zoom, y: r.top + (p.y + this.margin) * this.zoom };
  }
  // Position relative to the pasteboard element (for overlays like the text editor)
  pageToBoard(p) {
    return { x: (p.x + this.margin) * this.zoom, y: (p.y + this.margin) * this.zoom };
  }

  gridStep() { return fromCm(this.doc.grid.spacing || 0.5); }
  snap(p, force = false) {
    if (!this.doc.grid.snap && !force) return { ...p };
    const s = this.gridStep();
    return { x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s };
  }
  snapValue(v) {
    if (!this.doc.grid.snap) return v;
    const s = this.gridStep();
    return Math.round(v / s) * s;
  }

  // ---------- zoom ----------
  setZoom(z, mode = null, anchorClient = null) {
    const old = this.zoom;
    z = clamp(z, 0.1, 16);
    if (Math.abs(old - z) > 1e-6) this.prevZoom = { zoom: old, mode: this.zoomMode };
    let anchorPage = null;
    if (anchorClient) anchorPage = this.clientToPage(anchorClient.x, anchorClient.y);
    this.zoom = z;
    this.zoomMode = mode;
    this.layoutCanvas();
    if (anchorPage) {
      const r = this.scroller.getBoundingClientRect();
      const board = this.pageToBoard(anchorPage);
      this.scroller.scrollLeft = board.x - (anchorClient.x - r.left);
      this.scroller.scrollTop = board.y - (anchorClient.y - r.top);
    }
    this.invalidate();
    this.emit('zoom');
  }
  fitZoom(mode) {
    const { width, height } = this.doc.page;
    const sw = this.scroller.clientWidth - 40, sh = this.scroller.clientHeight - 40;
    if (sw <= 0 || sh <= 0) return;
    let z = mode === 'width' ? sw / width : Math.min(sw / width, sh / height);
    this.setZoom(z, mode);
    this.centerOn({ x: width / 2, y: mode === 'width' ? 0 : height / 2 }, mode === 'width');
  }
  zoomToRect(r) {
    if (r.w < 2 || r.h < 2) return;
    const sw = this.scroller.clientWidth - 30, sh = this.scroller.clientHeight - 30;
    this.setZoom(Math.min(sw / r.w, sh / r.h), null);
    this.centerOn({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  }
  centerOn(p, top = false) {
    const b = this.pageToBoard(p);
    this.scroller.scrollLeft = b.x - this.scroller.clientWidth / 2;
    this.scroller.scrollTop = top ? (this.margin * this.zoom - 15) : b.y - this.scroller.clientHeight / 2;
  }
  zoomPrevious() {
    if (!this.prevZoom) return;
    const p = this.prevZoom;
    if (p.mode) this.fitZoom(p.mode); else this.setZoom(p.zoom, null);
  }

  layoutCanvas() {
    const { width, height } = this.doc.page;
    const m = this.margin;
    const W = (width + 2 * m) * this.zoom, H = (height + 2 * m) * this.zoom;
    this.pasteboard.style.width = `${W}px`;
    this.pasteboard.style.height = `${H}px`;
    this.svg.setAttribute('width', W);
    this.svg.setAttribute('height', H);
    this.svg.setAttribute('viewBox', `${-m} ${-m} ${width + 2 * m} ${height + 2 * m}`);
  }

  // ---------- rendering ----------
  invalidate() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this.renderNow();
    });
  }

  renderNow() {
    this.layoutCanvas();
    this.renderPage();
    this.renderImages();
    this.renderObjects();
    this.renderOverlay();
    this.svg.classList.toggle('wireframe', !this.proof);
    this.emit('render');
  }

  renderPage() {
    const { width, height, background } = this.doc.page;
    const g = this.doc.grid;
    const showDots = g.dots === 'always' || (g.dots === 'snapping' && g.snap);
    const step = this.gridStep();
    let dotStep = step;
    while (dotStep * this.zoom < 8) dotStep *= 2;
    const r = 0.9 / this.zoom;
    const dots = showDots
      ? `<pattern id="griddots-${this.uid}" patternUnits="userSpaceOnUse" width="${f(dotStep)}" height="${f(dotStep)}">` +
        `<rect x="${f(-r)}" y="${f(-r)}" width="${f(r * 2)}" height="${f(r * 2)}" fill="#b4b9c4"/>` +
        `<rect x="${f(dotStep - r)}" y="${f(-r)}" width="${f(r * 2)}" height="${f(r * 2)}" fill="#b4b9c4"/>` +
        `<rect x="${f(-r)}" y="${f(dotStep - r)}" width="${f(r * 2)}" height="${f(r * 2)}" fill="#b4b9c4"/>` +
        `<rect x="${f(dotStep - r)}" y="${f(dotStep - r)}" width="${f(r * 2)}" height="${f(r * 2)}" fill="#b4b9c4"/></pattern>`
      : '';
    const z = this.zoom;
    this.gPage.innerHTML =
      `<defs>${dots}<filter id="pageshadow-${this.uid}" x="-10%" y="-10%" width="120%" height="120%">` +
      `<feDropShadow dx="0" dy="${f(2 / z)}" stdDeviation="${f(6 / z)}" flood-color="#1b2335" flood-opacity="0.16"/></filter></defs>` +
      `<rect x="0" y="0" width="${width}" height="${height}" fill="${background || '#fff'}" filter="url(#pageshadow-${this.uid})"/>` +
      `<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#d5d8de" stroke-width="${f(1 / z)}"/>` +
      (showDots ? `<rect class="grid" x="0" y="0" width="${width}" height="${height}" fill="url(#griddots-${this.uid})" pointer-events="none"/>` : '');
  }

  renderImages() {
    for (const [id, url] of Object.entries(this.doc.images || {})) {
      if (this.renderedImages.has(id)) continue;
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('id', `img-${id}`);
      img.setAttribute('width', '1');
      img.setAttribute('height', '1');
      img.setAttribute('preserveAspectRatio', 'none');
      img.setAttribute('href', url);
      this.imgDefs.appendChild(img);
      this.renderedImages.add(id);
    }
  }

  renderObjects() {
    const ctx = { doc: this.doc, uid: this.uid, hitWidth: 8 / this.zoom, skipLabelId: this.editingLabelId };
    let html = '';
    for (const o of paintOrder(this.doc)) {
      const layer = layerOf(this.doc, o.layer);
      if (layer && !layer.visible) continue;
      if (this.hiddenIds.has(o.id)) continue;
      let s = renderObject(o, ctx);
      if (!this.isEditable(o)) s = `<g class="locked">${s}</g>`;
      html += s;
    }
    this.gObjects.innerHTML = html;
  }

  handleSize() { return HANDLE_PX / this.zoom; }

  // Handles for the current selection, in page coordinates.
  handles() {
    const sel = this.selected();
    if (!sel.length) return [];
    const out = [];
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (this.tool.name === 'points' && sel.length === 1 && sel[0].points) {
      const m = objMatrix(sel[0]);
      sel[0].points.forEach((p, i) => out.push({ id: `pt${i}`, kind: 'point', index: i, p: apply(m, p) }));
      return out;
    }
    if (sel.length === 1 && sel[0].type === 'line' && sel[0].points && this.handleMode === 'size') {
      const o = sel[0];
      const m = objMatrix(o);
      const pts = o.points;
      out.push({ id: 'p0', kind: 'endpoint', index: 0, p: apply(m, pts[0]) });
      out.push({ id: 'p1', kind: 'endpoint', index: pts.length - 1, p: apply(m, pts[pts.length - 1]) });
      return out;
    }
    let c;
    if (sel.length === 1) c = objCorners(sel[0]);
    else {
      const b = selectionBounds(sel);
      c = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
    }
    const pos = { nw: c[0], n: mid(c[0], c[1]), ne: c[1], e: mid(c[1], c[2]), se: c[2], s: mid(c[2], c[3]), sw: c[3], w: mid(c[3], c[0]) };
    if (this.handleMode === 'rotate') {
      for (const k of ['nw', 'ne', 'se', 'sw']) out.push({ id: k, kind: 'rotate', p: pos[k] });
      if (sel.length === 1) for (const k of ['n', 'e', 's', 'w']) out.push({ id: k, kind: 'slant', p: pos[k] });
      const center = mid(c[0], c[2]);
      out.push({ id: 'center', kind: 'center', p: center });
    } else {
      for (const k of Object.keys(pos)) out.push({ id: k, kind: 'size', p: pos[k] });
    }
    return out;
  }

  renderOverlay() {
    const z = this.zoom;
    const hs = this.handleSize();
    const sw = 1 / z;
    let s = '';
    const sel = this.selected();
    // outline of each selected object
    for (const o of sel) {
      const c = objCorners(o);
      if (o.type === 'line' && this.handleMode === 'size') continue;
      s += `<path d="M${c.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L')} Z" fill="none" stroke="#3b5bdb" stroke-width="${f(sw)}" stroke-dasharray="${f(3 / z)} ${f(2 / z)}" pointer-events="none"/>`;
    }
    for (const h of this.handles()) {
      const x = h.p.x, y = h.p.y;
      if (h.kind === 'rotate') {
        s += `<circle class="handle" data-handle="${h.id}" data-kind="rotate" cx="${f(x)}" cy="${f(y)}" r="${f(hs * 0.7)}" fill="#fff" stroke="#3b5bdb" stroke-width="${f(sw * 1.5)}"/>`;
      } else if (h.kind === 'slant') {
        const r = hs * 0.7;
        s += `<path class="handle" data-handle="${h.id}" data-kind="slant" d="M${f(x)} ${f(y - r)} L${f(x + r)} ${f(y)} L${f(x)} ${f(y + r)} L${f(x - r)} ${f(y)} Z" fill="#3b5bdb" stroke="#fff" stroke-width="${f(sw)}"/>`;
      } else if (h.kind === 'center') {
        const r = hs * 0.6;
        s += `<path d="M${f(x - r)} ${f(y)} H${f(x + r)} M${f(x)} ${f(y - r)} V${f(y + r)}" stroke="#000" stroke-width="${f(sw)}" pointer-events="none"/>`;
      } else {
        const fill = h.kind === 'point' ? '#3b5bdb' : h.kind === 'endpoint' ? '#fff' : '#fff';
        s += `<rect class="handle" data-handle="${h.id}" data-kind="${h.kind}" data-index="${h.index ?? ''}" x="${f(x - hs / 2)}" y="${f(y - hs / 2)}" width="${f(hs)}" height="${f(hs)}" rx="${f(hs * 0.2)}" fill="${fill}" stroke="#3b5bdb" stroke-width="${f(sw * 1.5)}"/>`;
      }
    }
    if (this.marquee) {
      const m = this.marquee;
      s += `<rect x="${f(m.x)}" y="${f(m.y)}" width="${f(m.w)}" height="${f(m.h)}" fill="rgba(59,91,219,0.08)" stroke="#3b5bdb" stroke-width="${f(sw)}" stroke-dasharray="${f(4 / z)} ${f(3 / z)}" pointer-events="none"/>`;
    }
    if (this.preview) s += this.preview;
    this.gOverlay.innerHTML = s;
  }

  // ---------- helpers for UI ----------
  statusInfo() {
    const sel = this.selected();
    let type = 'No Objects Selected';
    if (sel.length === 1) type = sel[0].name || typeName(sel[0]);
    else if (sel.length > 1) type = `${sel.length} Objects Selected`;
    let size = '';
    if (sel.length) {
      const b = sel.length === 1 && sel[0].rot === 0 ? { w: sel[0].w, h: sel[0].h } : unionBounds(sel.map(objBounds));
      size = `${cm(b.w).toFixed(1)} x ${cm(b.h).toFixed(1)} cm`;
    }
    const pos = this.cursor ? `${cm(this.cursor.x).toFixed(2)} , ${cm(this.cursor.y).toFixed(2)} cm` : '';
    return { type, size, pos };
  }

  // Style shown in the status bar / used by toolbars: first selected object, else defaults.
  currentStyle() {
    const sel = this.selected();
    const src = sel.length ? sel[0] : this.doc.defaults;
    return { fill: src.fill || this.doc.defaults.fill, line: src.line || this.doc.defaults.line,
      ends: src.ends || this.doc.defaults.ends, shadow: src.shadow || this.doc.defaults.shadow,
      text: src.text || this.doc.defaults.text };
  }

  // Apply a style change to the selection (or to the defaults if nothing selected).
  applyStyle(part, changes) {
    const sel = this.selected();
    this.checkpoint();
    if (!sel.length) {
      Object.assign(this.doc.defaults[part], changes);
    } else {
      const applyTo = (o) => {
        if (o.type === 'group') { o.children.forEach(applyTo); }
        if (!o[part]) o[part] = clone(this.doc.defaults[part]);
        Object.assign(o[part], changes);
        if (part === 'text' && o.type === 'text') updateTextMetrics(o);
      };
      sel.forEach(applyTo);
    }
    this.invalidate();
    this.emit('style');
  }

  addObjects(objs, select = true) {
    for (const o of objs) {
      this.refreshTextMetrics(o);
      this.doc.objects.push(o);
    }
    if (select) this.selection = objs.map((o) => o.id);
    this.invalidate();
    this.emit('selection');
  }

  removeObjects(ids) {
    const set = new Set(ids);
    this.doc.objects = this.doc.objects.filter((o) => !set.has(o.id));
    this.selection = this.selection.filter((id) => !set.has(id));
    this.invalidate();
    this.emit('selection');
  }

  addImage(dataUrl) {
    for (const [id, url] of Object.entries(this.doc.images)) if (url === dataUrl) return id;
    const id = newId('i');
    this.doc.images[id] = dataUrl;
    return id;
  }

  setTool(name, kind = null) {
    this.tool = { name, kind };
    if (name === 'select' || name === 'rotate') this.handleMode = name === 'rotate' ? 'rotate' : 'size';
    this.svg.dataset.tool = name;
    this.preview = null;
    this.invalidate();
    this.emit('tool');
  }
}

export { esc };
