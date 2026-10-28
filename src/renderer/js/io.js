// Files: open, save, export, print — via the Electron bridge (window.basil),
// with a browser fallback so the drawing window also runs in a plain browser.

import { serialize, deserialize, newDocument, createObject, clone } from './model.js';
import { renderPageSVG } from './render.js';
import { objBounds, unionBounds, cm } from './geometry.js';
import { printSizeInches } from './ui/dialogs.js';

// ---------- browser fallback ----------
const browserApi = {
  platform: 'browser',
  async openFile(opts = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (opts.accept) input.accept = opts.accept;
      input.onchange = () => {
        const file = input.files[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(opts.asDataUrl ? { path: file.name, dataUrl: reader.result } : { path: file.name, content: reader.result });
        if (opts.asDataUrl) reader.readAsDataURL(file); else reader.readAsText(file);
      };
      input.click();
    });
  },
  async readFile() { return null; },
  async saveDialog(opts = {}) { return opts.defaultPath || 'Drawing.bdraw'; },
  async writeFile(p, data, encoding) {
    const blob = encoding === 'base64'
      ? new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))])
      : new Blob([data], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = p.split(/[\\/]/).pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  },
  async getRecent() { return []; },
  async addRecent() { return []; },
  async getPrefs() { try { return JSON.parse(localStorage.getItem('basil.prefs') || '{}'); } catch { return {}; } },
  async setPrefs(p) { try { localStorage.setItem('basil.prefs', JSON.stringify(p)); } catch { /* ignore */ } return true; },
  async print() { window.print(); return { success: true }; },
  async savePdf() { window.print(); return true; },
  async previewPdf() { window.print(); return true; },
  async message(opts) { return window.confirm(opts.message) ? 0 : 1; },
  async newWindow() { window.open(location.href.split('?')[0] + '?nowelcome=1'); return true; },
  async listWindows() { return [{ id: 1, title: document.title }]; },
  async focusWindow() { return true; },
  async closeAll() { window.close(); return true; },
  async quit() { window.close(); return true; },
  async version() { return '0.3.0'; },
  setWindowState() {},
  forceClose() { window.close(); },
  editRole(role) { document.execCommand(role); },
  onCommand() {},
  onWindowsChanged() {},
};

export const api = window.basil || browserApi;
export const isMac = api.platform === 'darwin';

const drawingFilters = [{ name: 'Basil Draw drawings', extensions: ['bdraw', 'bdraw'] }];

export class FileOps {
  constructor(app) {
    this.app = app;
    this.ed = app.editor;
  }

  updateWindowState() {
    const ed = this.ed;
    document.title = `${ed.dirty ? '• ' : ''}${ed.docName} — Basil Draw`;
    const t = document.getElementById('doc-title');
    if (t) t.innerHTML = `<span class="dt-name"></span><span class="dt-dirty">${ed.dirty ? ' — Edited' : ''}</span>`;
    if (t) t.querySelector('.dt-name').textContent = ed.docName;
    api.setWindowState({ dirty: ed.dirty, title: ed.docName, filePath: ed.filePath || '' });
  }

  async open(path = null) {
    let res;
    if (path) res = await api.readFile(path);
    else res = await api.openFile({ title: 'Open Drawing', filters: [...drawingFilters, { name: 'All files', extensions: ['*'] }], accept: '.bdraw,.bdraw' });
    if (!res) return false;
    let doc;
    try { doc = deserialize(res.content); } catch (err) {
      this.app.alert('Open', `Sorry, "${res.path.split(/[\\/]/).pop()}" could not be opened.\n\n${err.message}`);
      return false;
    }
    // Open in this window if it's an untouched empty drawing, otherwise in a new one.
    if (this.ed.dirty || this.ed.doc.objects.length || this.ed.filePath) {
      if (window.basil) { await api.newWindow(res.path); return true; }
    }
    this.ed.loadDocument(doc, res.path);
    api.addRecent(res.path);
    this.updateWindowState();
    return true;
  }

  async save() {
    if (!this.ed.filePath) return this.saveAs();
    return this.writeTo(this.ed.filePath);
  }

  async saveAs() {
    const p = await api.saveDialog({ title: 'Save As', defaultPath: `${this.ed.docName}.bdraw`, filters: drawingFilters });
    if (!p) return false;
    const path = /\.bdraw$/i.test(p) ? p : `${p}.bdraw`;
    return this.writeTo(path);
  }

  async writeTo(path) {
    try {
      await api.writeFile(path, serialize(this.ed.doc));
    } catch (err) {
      this.app.alert('Save', `Sorry, the drawing could not be saved.\n\n${err.message}`);
      return false;
    }
    this.ed.filePath = path;
    this.ed.docName = path.split(/[\\/]/).pop().replace(/\.[bp]draw$/i, '');
    this.ed.setDirty(false);
    api.addRecent(path);
    this.updateWindowState();
    this.app.setHint('Saved.');
    return true;
  }

  async saveSelection() {
    const sel = this.ed.selected();
    if (!sel.length) return;
    const p = await api.saveDialog({ title: 'Save Selection', defaultPath: `${this.ed.docName} (selection).bdraw`, filters: drawingFilters });
    if (!p) return;
    await api.writeFile(/\.bdraw$/i.test(p) ? p : `${p}.bdraw`, serialize(this.ed.doc, clone(sel)));
  }

  // ---------- export ----------
  pageSvg(opts = {}) {
    const ed = this.ed;
    const objs = ed.doc.layers.flatMap((l) => ed.doc.objects.filter((o) => o.layer === l.id));
    return renderPageSVG(ed.doc, objs, opts);
  }

  async exportAs(type) {
    const ed = this.ed;
    const ext = type;
    const p = await api.saveDialog({
      title: `Export as ${type.toUpperCase()}`,
      defaultPath: `${ed.docName}.${ext}`,
      filters: [{ name: `${type.toUpperCase()} files`, extensions: [ext] }],
    });
    if (!p) return;
    const path = new RegExp(`\\.${ext}$`, 'i').test(p) ? p : `${p}.${ext}`;
    if (type === 'svg') {
      await api.writeFile(path, `<?xml version="1.0" encoding="UTF-8"?>\n${this.pageSvg()}`);
    } else if (type === 'png') {
      const data = await this.renderPng(2);
      await api.writeFile(path, data, 'base64');
    } else if (type === 'pdf') {
      this.preparePrint();
      try { await api.savePdf(path, printSizeInches(ed.doc.page)); } finally { this.finishPrint(); }
    }
    this.app.setHint(`Exported ${path.split(/[\\/]/).pop()}`);
  }

  renderPng(scale = 2) {
    const { width, height } = this.ed.doc.page;
    const svg = this.pageSvg({ width: width * scale, height: height * scale });
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = Math.round(width * scale); c.height = Math.round(height * scale);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png').split(',')[1]);
      };
      img.onerror = reject;
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }

  // ---------- printing ----------
  preparePrint() {
    const { width, height } = this.ed.doc.page;
    const area = document.getElementById('print-area');
    const wcm = cm(width), hcm = cm(height);
    area.innerHTML = this.pageSvg({ width: `${wcm}cm`, height: `${hcm}cm` });
    let style = document.getElementById('print-page-style');
    if (!style) { style = document.createElement('style'); style.id = 'print-page-style'; document.head.appendChild(style); }
    style.textContent = `@page { size: ${wcm.toFixed(3)}cm ${hcm.toFixed(3)}cm; margin: 0; }`;
    document.body.classList.add('printing');
  }
  finishPrint() {
    document.body.classList.remove('printing');
    document.getElementById('print-area').innerHTML = '';
  }
  async print() {
    this.preparePrint();
    try { await api.print(); } finally { this.finishPrint(); }
  }
  async printPreview() {
    this.preparePrint();
    try { await api.previewPdf(printSizeInches(this.ed.doc.page), this.ed.docName); } finally { this.finishPrint(); }
  }

  // ---------- insert ----------
  async insertPicture() {
    const res = await api.openFile({
      title: 'Insert Picture', asDataUrl: true, accept: 'image/*',
      filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'] }],
    });
    if (!res) return;
    this.insertImageDataUrl(res.dataUrl);
  }

  insertImageDataUrl(dataUrl, name = '') {
    const img = new Image();
    img.onload = () => {
      const ed = this.ed;
      const page = ed.doc.page;
      let w = img.naturalWidth || 200, h = img.naturalHeight || 200;
      const max = Math.min(page.width, page.height) * 0.6;
      const k = Math.min(1, max / Math.max(w, h));
      w *= k; h *= k;
      ed.checkpoint();
      const id = ed.addImage(dataUrl);
      const o = createObject(ed.doc, 'image', { kind: 'image', imageId: id, name, x: (page.width - w) / 2, y: (page.height - h) / 2, w, h });
      o.line = { ...o.line, style: 'none' };
      o.fill = { ...o.fill, style: 'none' };
      ed.addObjects([o]);
      this.app.setTool('select');
    };
    img.src = dataUrl;
  }

  async insertTextFile() {
    const res = await api.openFile({ title: 'Insert Text File', filters: [{ name: 'Text files', extensions: ['txt', 'text', 'md'] }], accept: '.txt,.text,.md' });
    if (!res) return;
    const ed = this.ed;
    ed.checkpoint();
    const o = createObject(ed.doc, 'text', { kind: 'text', content: res.content.replace(/\r\n/g, '\n').trimEnd(), x: 40, y: 40 });
    o.text.align = 'left';
    o.text.size = 12;
    o.fill = { ...o.fill, style: 'none' };
    o.line = { ...o.line, style: 'none' };
    ed.addObjects([o]);
  }
}

export function selectionPageBounds(objs) {
  return unionBounds(objs.map(objBounds));
}

export { newDocument };
