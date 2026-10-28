// Every menu / toolbar / keyboard command.

import { clone, findObject, createObject, newDocument, serialize, deserialize } from './model.js';
import {
  flipObjects, rotateBy, alignObjects, spaceObjects, centerOnPage, makeGroup, ungroup, reId, toCurves,
  moveObjects, selectionBounds,
} from './transform.js';
import { objBounds, fromCm, rad2deg } from './geometry.js';
import { updateTextMetrics } from './render.js';
import {
  objectPropertiesDialog, pageSetupDialog, pageBackgroundDialog, optionsDialog, layerManagerDialog,
  chooseLayerDialog, rotateAngleDialog, aboutDialog, helpDialog, clipArtDialog,
} from './ui/dialogs.js';
import { promptBox } from './ui/widgets.js';
import { api } from './io.js';
import { blendObjects, canBlend } from './blend.js';
import { blendDialog, wizardDefaultsDialog } from './ui/dialogs.js';
import { projectWizard } from './ui/wizard.js';

const CLIP_KEY = 'basil.clipboard';

export class Commands {
  constructor(app) {
    this.app = app;
    this.ed = app.editor;
    this.pasteCount = 0;
  }

  get sel() { return this.ed.selected(); }
  hasSel() { return this.ed.selection.length > 0; }

  // Return false to show a command as disabled.
  enabled(cmd) {
    const n = this.ed.selection.length;
    const sel = this.sel;
    switch (cmd) {
      case 'undo': return this.ed.history.canUndo();
      case 'redo': return this.ed.history.canRedo();
      case 'cut': case 'copy': case 'delete': case 'deselectAll': case 'saveSelection': case 'zoomSelection':
      case 'toBack': case 'toFront': case 'backward': case 'forward': case 'flipH': case 'flipV':
      case 'rotL': case 'rotR': case 'rotAngle': case 'moveToLayer': case 'layerBack': case 'layerForward':
      case 'centerSel': case 'applyDefaults': case 'pickupDefaults':
        return n > 0;
      case 'paste': case 'pasteNew': return !!this.clipboard();
      case 'group': return n > 1;
      case 'blend': return n === 2 && sel.every(canBlend);
      case 'ungroup': return sel.some((o) => o.type === 'group');
      case 'separateLabel': return sel.some((o) => o.label);
      case 'toCurves': return sel.some((o) => o.type === 'shape' || o.type === 'line');
      case 'moveSize': return n === 1;
      case 'align:left': case 'align:center': case 'align:right': case 'align:top': case 'align:middle': case 'align:bottom':
      case 'align:pagecenter': case 'align:pagemiddle':
        return n > 0;
      case 'space:edgesH': case 'space:edgesV': case 'space:centersH': case 'space:centersV': return n > 2;
      case 'centerAll': return this.ed.doc.objects.length > 0;
      case 'zoomPrevious': return !!this.ed.prevZoom;
      default: return true;
    }
  }

  checked(cmd) {
    const ed = this.ed;
    switch (cmd) {
      case 'selectMode': return ed.handleMode === 'size' && ed.tool.name === 'select';
      case 'rotateMode': return ed.handleMode === 'rotate';
      case 'snap': return ed.doc.grid.snap;
      case 'proof': return ed.proof;
      case 'statusBar': return ed.prefs.statusBar;
      case 'rulers': return ed.prefs.rulers;
      case 'tb:standard': return ed.prefs.toolbars.standard;
      case 'tb:format': return ed.prefs.toolbars.format;
      case 'tb:toolbox': return ed.prefs.toolbars.toolbox;
      case 'editAllLayers': return ed.doc.editAllLayers;
      default: {
        if (cmd.startsWith('justify:')) return ed.currentStyle().text.align === cmd.split(':')[1];
        if (cmd.startsWith('labelpos:')) return (ed.currentStyle().text.labelPos || 'center') === cmd.split(':')[1];
        return false;
      }
    }
  }

  async run(cmd) {
    const app = this.app;
    const ed = this.ed;
    if (app.textEditor.active && !['undo', 'redo'].includes(cmd)) app.textEditor.commit();
    const [head, arg, arg2] = cmd.split(':');
    switch (head) {
      // ----- File -----
      case 'new': return api.newWindow();
      case 'newProject': return this.newProject();
      case 'open': return app.files.open();
      case 'close': return window.close();
      case 'closeAll': return api.closeAll();
      case 'save': return app.files.save();
      case 'saveAs': return app.files.saveAs();
      case 'saveSelection': return app.files.saveSelection();
      case 'exportPng': return app.files.exportAs('png');
      case 'exportSvg': return app.files.exportAs('svg');
      case 'exportPdf': return app.files.exportAs('pdf');
      case 'pageSetup': return this.pageSetup();
      case 'pageBackground': return this.pageBackground();
      case 'printPreview': return app.files.printPreview();
      case 'print': return app.files.print();
      case 'recent': return app.files.open(cmd.slice('recent:'.length));
      case 'exit': return api.quit();
      case 'saveAndClose': { const ok = await app.files.save(); if (ok) api.forceClose(); return ok; }

      // ----- Edit -----
      case 'undo': return ed.undo();
      case 'redo': return ed.redo();
      case 'cut': this.copy(); return this.deleteSel();
      case 'copy': return this.copy();
      case 'paste': return this.paste();
      case 'pasteNew': return this.pasteNew();
      case 'delete': return this.deleteSel();
      case 'selectAll': return ed.selectAll();
      case 'deselectAll': return ed.deselect();
      case 'selectMode': return app.setTool('select');
      case 'rotateMode': return app.setTool(ed.handleMode === 'rotate' ? 'select' : 'rotate');

      // ----- View -----
      case 'zoomIn': return ed.setZoom(ed.zoom * 1.5, null, this.viewCenter());
      case 'zoomOut': return ed.setZoom(ed.zoom / 1.5, null, this.viewCenter());
      case 'zoomArea': return app.setTool('zoom');
      case 'zoomPage': return ed.fitZoom('page');
      case 'zoomWidth': return ed.fitZoom('width');
      case 'zoomSelection': return ed.zoomToRect(this.padRect(selectionBounds(this.sel)));
      case 'zoomActual': { ed.setZoom(1, null); return ed.centerOn({ x: ed.doc.page.width / 2, y: ed.doc.page.height / 2 }); }
      case 'zoomPrevious': return ed.zoomPrevious();
      case 'zoom': return this.setZoomLevel(arg);
      case 'redraw': ed.renderedImages.clear(); ed.imgDefs.innerHTML = ''; return ed.invalidate();
      case 'proof': ed.proof = !ed.proof; return ed.invalidate();
      case 'tb': ed.prefs.toolbars[arg] = !ed.prefs.toolbars[arg]; return app.applyPrefs(true);
      case 'statusBar': ed.prefs.statusBar = !ed.prefs.statusBar; return app.applyPrefs(true);
      case 'rulers': ed.prefs.rulers = !ed.prefs.rulers; return app.applyPrefs(true);

      // ----- Insert -----
      case 'insertPicture': return app.files.insertPicture();
      case 'clipArt': return this.clipArt();
      case 'insertText': return app.setTool('text');
      case 'insertTextFile': return app.files.insertTextFile();
      case 'tool': return app.setTool(arg, arg2);

      // ----- Format -----
      case 'fmtFill': return this.objectProps('fill');
      case 'fmtLine': return this.objectProps('line');
      case 'fmtEnds': return this.objectProps('ends');
      case 'fmtShadow': return this.objectProps('shadow');
      case 'fmtText': return this.objectProps('text');
      case 'fmtObject': return this.objectProps(this.ed.selection.length === 1 ? 'general' : 'fill');
      case 'defaults': return this.defaultProps();
      case 'labelpos': return ed.applyStyle('text', { labelPos: arg });
      case 'justify': return ed.applyStyle('text', { align: arg });
      case 'pickupDefaults': return this.pickupDefaults();
      case 'applyDefaults': return this.applyDefaults();
      case 'painter': return this.painter();

      // ----- Tools -----
      case 'group': return this.group();
      case 'ungroup': return this.ungroup();
      case 'separateLabel': return this.separateLabel();
      case 'toCurves': return this.toCurves();
      case 'options': return this.options(0);
      case 'blend': return this.blend();
      case 'wizardDefaults': return this.wizardDefaults();

      // ----- Draw -----
      case 'gridOptions': return this.options(3);
      case 'snap': ed.checkpoint(); ed.doc.grid.snap = !ed.doc.grid.snap; return ed.invalidate();
      case 'toBack': return this.order('back');
      case 'toFront': return this.order('front');
      case 'backward': return this.order('backward');
      case 'forward': return this.order('forward');
      case 'layerManager': return this.layerManager();
      case 'editAllLayers': ed.doc.editAllLayers = !ed.doc.editAllLayers; ed.invalidate(); return app.refreshChrome();
      case 'addLayer': return this.addLayer();
      case 'moveToLayer': return this.moveToLayer();
      case 'layerBack': return this.shiftLayer(-1);
      case 'layerForward': return this.shiftLayer(1);
      case 'setLayer': ed.doc.activeLayer = arg; ed.selection = ed.selection.filter((id) => ed.isEditable(findObject(ed.doc, id))); ed.invalidate(); return app.refreshChrome();
      case 'align': return this.mutate(() => alignObjects(this.sel, arg, ed.doc.page));
      case 'space': return this.mutate(() => spaceObjects(this.sel, arg));
      case 'centerAll': return this.mutate(() => centerOnPage(ed.doc.objects.filter((o) => ed.isEditable(o)), ed.doc.page));
      case 'centerSel': return this.mutate(() => centerOnPage(this.sel, ed.doc.page));
      case 'moveSize': return this.objectProps('general');
      case 'flipH': return this.mutate(() => flipObjects(this.sel, true));
      case 'flipV': return this.mutate(() => flipObjects(this.sel, false));
      case 'rotL': return this.mutate(() => rotateBy(this.sel, -90));
      case 'rotR': return this.mutate(() => rotateBy(this.sel, 90));
      case 'rotAngle': { const a = await rotateAngleDialog(); if (a != null) this.mutate(() => rotateBy(this.sel, a)); return; }
      case 'rotOptions': return this.options(2);
      case 'nudge': return this.nudge(Number(arg), Number(arg2));

      // ----- Window -----
      case 'win': return arg === 'new' ? api.newWindow() : api.focusWindow(Number(arg));

      // ----- Help -----
      case 'help': return helpDialog(app.shortcutList(), 0);
      case 'shortcuts': return helpDialog(app.shortcutList(), 1);
      case 'about': return aboutDialog(await api.version());
      default:
        console.warn('Unknown command', cmd);
        return null;
    }
  }

  // ---------- helpers ----------
  mutate(fn) {
    if (!this.hasSel() && !fn.allowEmpty) { /* some commands work on all */ }
    this.ed.checkpoint();
    fn();
    this.ed.invalidate();
    this.ed.emit('selection');
  }

  viewCenter() {
    const r = this.ed.scroller.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  padRect(r) {
    const p = Math.max(r.w, r.h) * 0.1 + 10;
    return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p };
  }

  setZoomLevel(v) {
    if (v === 'page') return this.ed.fitZoom('page');
    if (v === 'width') return this.ed.fitZoom('width');
    const z = Number(v) / 100;
    if (z > 0) this.ed.setZoom(z, null, this.viewCenter());
    return null;
  }

  nudge(dx, dy) {
    const sel = this.sel;
    if (!sel.length) return;
    this.ed.checkpoint();
    moveObjects(sel, dx, dy);
    this.ed.invalidate();
    this.ed.emit('selection');
  }

  // ---------- clipboard ----------
  clipboard() {
    try { return JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); } catch { return null; }
  }

  copy() {
    const sel = this.sel;
    if (!sel.length) return;
    const ordered = this.ed.doc.objects.filter((o) => this.ed.selection.includes(o.id));
    const data = JSON.parse(serialize(this.ed.doc, clone(ordered)));
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify({ objects: data.objects, images: data.images, src: this.ed.uid, t: Date.now() }));
    } catch (err) {
      this.app.alert('Copy', 'That selection is too big to copy (it probably contains large pictures).');
    }
    this.pasteCount = 0;
  }

  paste() {
    const clip = this.clipboard();
    if (!clip || !clip.objects?.length) return;
    const ed = this.ed;
    ed.checkpoint();
    const idMap = {};
    for (const [id, url] of Object.entries(clip.images || {})) idMap[id] = ed.addImage(url);
    const remapImages = (o) => { if (o.type === 'image' && idMap[o.imageId]) o.imageId = idMap[o.imageId]; (o.children || []).forEach(remapImages); };
    this.pasteCount += 1;
    const off = clip.src === ed.uid ? fromCm(0.5) * this.pasteCount : 0;
    const objs = clip.objects.map((o) => {
      const c = reId(clone(o));
      remapImages(c);
      c.layer = ed.doc.activeLayer;
      c.x += off; c.y += off;
      return c;
    });
    ed.addObjects(objs);
  }

  pasteNew() {
    localStorage.setItem('basil.pasteAsNew', String(Date.now()));
    api.newWindow();
  }

  deleteSel() {
    if (!this.hasSel()) return;
    this.ed.checkpoint();
    this.ed.removeObjects(this.ed.selection.slice());
  }

  // ---------- z-order ----------
  order(how) {
    const ed = this.ed;
    if (!this.hasSel()) return;
    ed.checkpoint();
    const set = new Set(ed.selection);
    let objs = ed.doc.objects;
    if (how === 'front') objs = [...objs.filter((o) => !set.has(o.id)), ...objs.filter((o) => set.has(o.id))];
    else if (how === 'back') objs = [...objs.filter((o) => set.has(o.id)), ...objs.filter((o) => !set.has(o.id))];
    else if (how === 'forward') {
      objs = objs.slice();
      for (let i = objs.length - 2; i >= 0; i--) {
        if (set.has(objs[i].id) && !set.has(objs[i + 1].id)) [objs[i], objs[i + 1]] = [objs[i + 1], objs[i]];
      }
    } else if (how === 'backward') {
      objs = objs.slice();
      for (let i = 1; i < objs.length; i++) {
        if (set.has(objs[i].id) && !set.has(objs[i - 1].id)) [objs[i], objs[i - 1]] = [objs[i - 1], objs[i]];
      }
    }
    ed.doc.objects = objs;
    ed.invalidate();
  }

  // ---------- grouping ----------
  group() {
    const ed = this.ed;
    const sel = ed.doc.objects.filter((o) => ed.selection.includes(o.id));
    if (sel.length < 2) return;
    ed.checkpoint();
    const g = makeGroup(sel, sel[sel.length - 1].layer);
    const lastIdx = ed.doc.objects.indexOf(sel[sel.length - 1]);
    const set = new Set(ed.selection);
    const before = ed.doc.objects.slice(0, lastIdx + 1).filter((o) => !set.has(o.id));
    const after = ed.doc.objects.slice(lastIdx + 1);
    ed.doc.objects = [...before, g, ...after];
    ed.select(g.id);
  }

  ungroup() {
    const ed = this.ed;
    const groups = this.sel.filter((o) => o.type === 'group');
    if (!groups.length) return;
    ed.checkpoint();
    const newSel = [];
    for (const g of groups) {
      const kids = ungroup(g);
      const idx = ed.doc.objects.indexOf(g);
      ed.doc.objects.splice(idx, 1, ...kids);
      newSel.push(...kids.map((k) => k.id));
    }
    ed.select(newSel);
  }

  separateLabel() {
    const ed = this.ed;
    const withLabel = this.sel.filter((o) => o.label);
    if (!withLabel.length) return;
    ed.checkpoint();
    const created = [];
    for (const o of withLabel) {
      const t = createObject(ed.doc, 'text', { kind: 'text', content: o.label, layer: o.layer });
      t.text = clone(o.text);
      t.fill = { ...t.fill, style: 'none' };
      t.line = { ...t.line, style: 'none' };
      t.shadow = { ...t.shadow, style: 'none' };
      updateTextMetrics(t);
      const b = objBounds(o);
      t.x = b.x + b.w / 2 - t.w / 2;
      t.y = b.y + b.h / 2 - t.h / 2;
      o.label = '';
      ed.doc.objects.splice(ed.doc.objects.indexOf(o) + 1, 0, t);
      created.push(t.id);
    }
    ed.select(created);
  }

  toCurves() {
    const ed = this.ed;
    ed.checkpoint();
    ed.doc.objects = ed.doc.objects.map((o) => (ed.selection.includes(o.id) ? toCurves(o) : o));
    ed.invalidate();
    ed.emit('selection');
  }

  // ---------- blend ----------
  async blend() {
    const ed = this.ed;
    const pair = ed.doc.objects.filter((o) => ed.selection.includes(o.id));
    if (pair.length !== 2 || !pair.every(canBlend)) {
      this.app.alert('Blend', 'Select exactly two shapes or lines to blend between (text, pictures and groups can\'t be blended).');
      return;
    }
    const opts = await blendDialog();
    if (!opts) return;
    ed.checkpoint();
    const [back, front] = pair;
    const steps = blendObjects(back, front, opts);
    const idx = ed.doc.objects.indexOf(back) + 1;
    let inserted = steps;
    if (opts.group) {
      const g = makeGroup(steps, back.layer);
      g.name = 'Blend';
      inserted = [g];
    }
    ed.doc.objects.splice(idx, 0, ...inserted);
    ed.select(inserted.map((o) => o.id));
  }

  // ---------- project wizard ----------
  async newProject() {
    const doc = await projectWizard(this.app);
    if (!doc) return;
    const ed = this.ed;
    if (!ed.dirty && !ed.doc.objects.length && !ed.filePath) {
      ed.loadDocument(doc, null, doc.meta?.name || 'Project1');
      ed.setDirty(true);
      this.app.files.updateWindowState();
    } else {
      try { localStorage.setItem('basil.newDoc', JSON.stringify({ t: Date.now(), doc })); } catch { /* too big */ }
      api.newWindow();
    }
  }

  async wizardDefaults() {
    const res = await wizardDefaultsDialog(this.ed.prefs.wizard || {});
    if (!res) return;
    this.ed.prefs.wizard = res;
    this.app.savePrefs();
  }

  // ---------- layers ----------
  async layerManager() {
    const ed = this.ed;
    const res = await layerManagerDialog(ed.doc, { promptName: (t, v) => promptBox(t, 'Layer name:', v) });
    if (!res) return;
    ed.checkpoint();
    const ids = new Set(res.layers.map((l) => l.id));
    for (const o of ed.doc.objects) if (!ids.has(o.layer)) o.layer = res.layers[0].id;
    ed.doc.layers = res.layers;
    ed.doc.activeLayer = res.active;
    ed.selection = ed.selection.filter((id) => ed.isEditable(findObject(ed.doc, id)));
    ed.invalidate();
    this.app.refreshChrome();
  }

  async addLayer() {
    const ed = this.ed;
    const name = await promptBox('Add Layer', 'Layer name:', `Layer${ed.doc.layers.length + 1}`);
    if (!name) return;
    ed.checkpoint();
    const id = `L${Date.now().toString(36)}`;
    ed.doc.layers.push({ id, name, visible: true, locked: false });
    ed.doc.activeLayer = id;
    ed.deselect();
    ed.invalidate();
    this.app.refreshChrome();
  }

  async moveToLayer() {
    const ed = this.ed;
    const id = await chooseLayerDialog(ed.doc);
    if (!id) return;
    ed.checkpoint();
    for (const o of this.sel) o.layer = id;
    if (!ed.doc.editAllLayers && id !== ed.doc.activeLayer) ed.deselect();
    ed.invalidate();
  }

  shiftLayer(dir) {
    const ed = this.ed;
    const layers = ed.doc.layers;
    ed.checkpoint();
    for (const o of this.sel) {
      const i = layers.findIndex((l) => l.id === o.layer);
      const j = Math.max(0, Math.min(layers.length - 1, i + dir));
      o.layer = layers[j].id;
    }
    ed.selection = ed.selection.filter((id) => ed.isEditable(findObject(ed.doc, id)));
    ed.invalidate();
    ed.emit('selection');
  }

  // ---------- format ----------
  async objectProps(tab) {
    const ed = this.ed;
    const sel = this.sel;
    const style = ed.currentStyle();
    const single = sel.length === 1 ? sel[0] : null;
    const general = single ? { name: single.name, x: single.x, y: single.y, w: single.w, h: single.h, rot: single.rot || 0, layer: single.layer } : null;
    await objectPropertiesDialog({
      style, general, layers: ed.doc.layers, fonts: this.app.fonts, initialTab: tab,
      title: sel.length ? 'Object Properties' : 'Object Properties (defaults for new objects)',
      onHelp: () => helpDialog(this.app.shortcutList(), 0),
      onApply: (st, gen) => {
        ed.checkpoint();
        const targets = ed.selected();
        if (!targets.length) {
          ed.doc.defaults = { ...ed.doc.defaults, ...st };
        }
        const applyTo = (o) => {
          if (o.type === 'group') { o.children.forEach(applyTo); return; }
          for (const k of ['fill', 'line', 'ends', 'shadow', 'text']) o[k] = clone(st[k]);
          if (o.type === 'text') updateTextMetrics(o);
        };
        targets.forEach(applyTo);
        if (gen && targets.length === 1) {
          const o = targets[0];
          o.name = gen.name;
          if (o.w !== gen.w || o.h !== gen.h) {
            const sx = o.w ? gen.w / o.w : 1, sy = o.h ? gen.h / o.h : 1;
            if (o.points) o.points = o.points.map((p) => ({ x: p.x * sx, y: p.y * sy }));
            const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
            o.w = gen.w; o.h = gen.h;
            o.x = cx - o.w / 2; o.y = cy - o.h / 2;
          }
          o.x = gen.x; o.y = gen.y;
          o.rot = gen.rot;
          o.layer = gen.layer;
        }
        ed.invalidate();
        ed.emit('style');
      },
    });
  }

  async defaultProps() {
    const ed = this.ed;
    const saved = ed.selection;
    ed.selection = [];
    await this.objectProps('fill');
    ed.selection = saved.filter((id) => findObject(ed.doc, id));
    ed.invalidate();
  }

  pickupDefaults() {
    const o = this.sel[0];
    if (!o) return;
    const ed = this.ed;
    ed.checkpoint();
    for (const k of ['fill', 'line', 'ends', 'shadow', 'text']) if (o[k]) ed.doc.defaults[k] = clone(o[k]);
    this.app.setHint('New objects will now look like the selected object.');
  }

  applyDefaults() {
    const ed = this.ed;
    if (!this.hasSel()) return;
    ed.checkpoint();
    for (const o of this.sel) {
      for (const k of ['fill', 'line', 'ends', 'shadow', 'text']) o[k] = clone(ed.doc.defaults[k]);
      if (o.type === 'text') updateTextMetrics(o);
    }
    ed.invalidate();
  }

  painter() {
    const ed = this.ed;
    if (ed.tool.name === 'painter') { this.app.setTool('select'); return; }
    const o = this.sel[0];
    if (!o) { this.app.alert('Copy Style', 'First select the object whose look you want to copy, then click the brush.'); return; }
    const src = o.type === 'group' ? o.children[0] : o;
    this.app.tools.painterStyle = { fill: clone(src.fill), line: clone(src.line), ends: clone(src.ends), shadow: clone(src.shadow), text: clone(src.text) };
    this.app.setTool('painter');
    this.app.setHint('Click the objects you want to paint with this style. Press Esc when done.');
  }

  // ---------- page ----------
  async pageSetup() {
    const ed = this.ed;
    const res = await pageSetupDialog(ed.doc.page);
    if (!res) return;
    ed.checkpoint();
    const { custom, ...page } = res;
    ed.doc.page = { ...ed.doc.page, ...page };
    ed.fitZoom('page');
    ed.invalidate();
  }

  async pageBackground() {
    const ed = this.ed;
    const c = await pageBackgroundDialog(ed.doc.page.background || '#ffffff');
    if (!c) return;
    ed.checkpoint();
    ed.doc.page.background = c;
    ed.invalidate();
  }

  async options(tab) {
    const ed = this.ed;
    const res = await optionsDialog(ed.prefs, ed.doc.grid, tab);
    if (!res) return;
    ed.prefs = { ...ed.prefs, ...res.prefs };
    if (JSON.stringify(res.grid) !== JSON.stringify(ed.doc.grid)) {
      ed.checkpoint();
      ed.doc.grid = res.grid;
    }
    this.app.applyPrefs(true);
    ed.invalidate();
  }

  async clipArt() {
    const c = await clipArtDialog();
    if (!c) return;
    const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(c.svg)))}`;
    this.app.files.insertImageDataUrl(url, c.name);
  }
}

export { newDocument, deserialize, rad2deg };
