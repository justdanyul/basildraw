// Basil Draw — wires the editor, tools, menus, toolbars and dialogs together.

import { Editor } from './editor.js';
import { Tools } from './tools.js';
import { Commands } from './commands.js';
import { FileOps, api, isMac } from './io.js';
import { TextEditor } from './ui/textedit.js';
import { MenuBar, menuDefinition, collectShortcuts, shortcutFromEvent, prettyShortcut } from './ui/menus.js';
import {
  buildStandardToolbar, buildFormatToolbar, buildToolbox, buildStatusBar, buildLayerTabs, buildRulers,
} from './ui/toolbars.js';
import { closeAllPopups, popupsOpen, isTextInput } from './ui/dom.js';
import { dialogOpen, alertBox } from './ui/widgets.js';
import { welcomeDialog, helpDialog, basilLogo } from './ui/dialogs.js';
import { SHAPE_INFO, LINE_INFO } from './shapes.js';
import { deserialize } from './model.js';

const FALLBACK_FONTS = [
  'Arial', 'Arial Black', 'Arial Narrow', 'American Typewriter', 'Avenir', 'Avenir Next', 'Baskerville', 'Big Caslon',
  'Book Antiqua', 'Bookman Old Style', 'Bradley Hand', 'Brush Script MT', 'Calibri', 'Cambria', 'Candara', 'Century Gothic',
  'Chalkboard', 'Chalkduster', 'Cochin', 'Comic Sans MS', 'Consolas', 'Constantia', 'Copperplate', 'Corbel', 'Courier New',
  'DejaVu Sans', 'DejaVu Serif', 'Didot', 'Franklin Gothic Medium', 'Futura', 'Garamond', 'Geneva', 'Georgia', 'Gill Sans',
  'Helvetica', 'Helvetica Neue', 'Herculanum', 'Hoefler Text', 'Impact', 'Liberation Sans', 'Liberation Serif',
  'Lucida Console', 'Lucida Grande', 'Lucida Handwriting', 'Luminari', 'Marker Felt', 'Menlo', 'Monaco', 'Noteworthy',
  'Optima', 'Palatino', 'Palatino Linotype', 'Papyrus', 'Phosphate', 'Rockwell', 'Savoye LET', 'Segoe Print', 'Segoe Script',
  'Segoe UI', 'Skia', 'Snell Roundhand', 'Tahoma', 'Times New Roman', 'Trattatello', 'Trebuchet MS', 'Verdana', 'Zapfino',
];

function fontAvailable(name) {
  const c = fontAvailable.ctx || (fontAvailable.ctx = document.createElement('canvas').getContext('2d'));
  const text = 'mmmmmmmmmmlliWW@#1';
  return ['monospace', 'serif', 'sans-serif'].some((base) => {
    c.font = `40px ${base}`;
    const w0 = c.measureText(text).width;
    c.font = `40px "${name}", ${base}`;
    return c.measureText(text).width !== w0;
  });
}

class App {
  constructor() {
    this.isMac = isMac;
    this.recent = [];
    this.windows = [];
    this.fonts = ['Times New Roman', 'Arial', 'Courier New'];
    this.hintLocked = false;
    const root = document.getElementById('app');
    document.body.classList.add(`platform-${api.platform}`);
    document.getElementById('app-logo').innerHTML = basilLogo(22);
    this.root = root;
    this.editor = new Editor(root);
    this.textEditor = new TextEditor(this);
    this.commands = new Commands(this);
    this.files = new FileOps(this);
    this.tools = new Tools(this.editor, this);
    this.menubar = new MenuBar(document.getElementById('menubar'), this);
    this.shortcuts = collectShortcuts(menuDefinition(this));
    this.standardTb = buildStandardToolbar(document.getElementById('toolbar-standard'), this);
    this.loadFonts();
    this.formatTb = buildFormatToolbar(document.getElementById('toolbar-format'), this);
    this.toolbox = buildToolbox(document.getElementById('toolbox'), this);
    this.status = buildStatusBar(document.getElementById('statusbar'), this);
    this.layerTabs = buildLayerTabs(document.getElementById('layertabs'), this);
    this.rulers = buildRulers(document.getElementById('ruler-h'), document.getElementById('ruler-v'), this);
    this.finished = document.getElementById('finished');
    document.getElementById('finished-btn').addEventListener('click', () => this.finishTool());
    document.getElementById('finished-x').addEventListener('click', () => this.finishTool());

    this.editor.on((what) => {
      if (what === 'dirty' || what === 'document') this.files.updateWindowState();
      if (what === 'cursor') { this.status.update(); if (this.editor.prefs.rulers) this.rulers.update(); return; }
      this.scheduleChrome();
    });
    this.editor.scroller.addEventListener('scroll', () => { if (this.editor.prefs.rulers) this.rulers.update(); });
    window.addEventListener('resize', () => this.rulers.update());
    document.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('beforeunload', (e) => {
      if (!window.basil && this.editor.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    api.onCommand((cmd) => this.run(cmd));
    api.onWindowsChanged((list) => { this.windows = list; });
  }

  async loadFonts() {
    let names = [];
    try {
      if (window.queryLocalFonts) {
        const fonts = await window.queryLocalFonts();
        names = [...new Set(fonts.map((f) => f.family))];
      }
    } catch { /* permission or support missing */ }
    if (!names.length) names = FALLBACK_FONTS.filter(fontAvailable);
    if (!names.includes('Times New Roman')) names.push('Times New Roman');
    this.fonts = names.sort((a, b) => a.localeCompare(b));
    this.formatTb?.refreshFonts();
    this.scheduleChrome();
  }

  async start() {
    const prefs = await api.getPrefs();
    if (prefs && typeof prefs === 'object') {
      this.editor.prefs = { ...this.editor.prefs, ...prefs, toolbars: { ...this.editor.prefs.toolbars, ...(prefs.toolbars || {}) } };
    }
    this.applyPrefs(false);
    this.recent = await api.getRecent();
    this.windows = await api.listWindows();
    this.editor.loadDocument(this.editor.doc);
    this.files.updateWindowState();

    const params = new URLSearchParams(location.search);
    const file = params.get('file');
    const pasteStamp = Number(localStorage.getItem('basil.pasteAsNew') || 0);
    let handoff = null;
    try { handoff = JSON.parse(localStorage.getItem('basil.newDoc') || 'null'); } catch { /* ignore */ }
    if (handoff && Date.now() - handoff.t < 15000 && !file) {
      localStorage.removeItem('basil.newDoc');
      this.editor.loadDocument(deserialize(JSON.stringify(handoff.doc)), null, handoff.doc.meta?.name || 'Project1');
      this.editor.setDirty(true);
      this.files.updateWindowState();
    } else if (file) {
      await this.files.open(file).catch((err) => this.alert('Open', `Sorry, that file could not be opened.\n\n${err.message}`));
    } else if (pasteStamp && Date.now() - pasteStamp < 15000) {
      localStorage.removeItem('basil.pasteAsNew');
      this.commands.paste();
      this.editor.history.clear();
    } else if (!params.get('nowelcome') && this.editor.prefs.showStartup) {
      const res = await welcomeDialog({ recent: this.recent, showStartup: this.editor.prefs.showStartup });
      if (res) {
        if (res.showStartup !== this.editor.prefs.showStartup) { this.editor.prefs.showStartup = res.showStartup; this.savePrefs(); }
        if (res.choice === 'open') this.files.open();
        else if (res.choice === 'wizard') this.run('newProject');
        else if (res.choice === 'learn') helpDialog(this.shortcutList(), 0);
        else if (res.choice.startsWith('recent:')) this.files.open(res.choice.slice(7));
      }
    }
    this.refreshChrome();
  }

  // ---------- commands ----------
  async run(cmd) {
    try {
      await this.commands.run(cmd);
    } catch (err) {
      console.error(err);
      this.alert('Basil Draw', `Something went wrong: ${err.message}`);
    }
    this.scheduleChrome();
  }

  setTool(name, kind = null) {
    this.tools.finishAll();
    if (this.textEditor.active) this.textEditor.commit();
    if (name !== 'painter') this.tools.painterStyle = null;
    this.editor.setTool(name, kind);
    const drawing = ['line', 'connector', 'shape', 'text'].includes(name);
    this.finished.hidden = !(drawing && this.editor.prefs.showFinished);
    if (drawing) {
      let label = 'Text';
      if (name === 'shape') label = SHAPE_INFO[kind]?.name;
      if (name === 'line' || name === 'connector') label = (name === 'connector' ? 'Connector ' : '') + LINE_INFO[kind]?.name;
      document.getElementById('finished-name').textContent = label;
    }
    this.hintLocked = false;
    this.scheduleChrome();
  }

  finishTool() {
    this.tools.finishAll();
    this.setTool('select');
  }

  // ---------- chrome ----------
  scheduleChrome() {
    if (this._chrome) return;
    this._chrome = requestAnimationFrame(() => { this._chrome = null; this.refreshChrome(); });
  }

  refreshChrome() {
    this.standardTb.update();
    this.formatTb.update();
    this.toolbox.update();
    this.status.update();
    this.layerTabs.update();
    if (this.editor.prefs.rulers) this.rulers.update();
  }

  // Show a message in the status bar until it is cleared with setHint('').
  setHint(text) {
    this.hintLocked = !!text;
    if (text) this.status.setHint(text);
    else this.status.update();
  }

  applyPrefs(save) {
    const p = this.editor.prefs;
    document.getElementById('toolbar-standard').hidden = !p.toolbars.standard;
    document.getElementById('toolbar-format').hidden = !p.toolbars.format;
    document.getElementById('toolbox').hidden = !p.toolbars.toolbox;
    document.getElementById('statusbar').hidden = !p.statusBar;
    document.getElementById('docarea').classList.toggle('rulers', !!p.rulers);
    this.editor.history.limit = p.undoLevels;
    if (this.editor.zoomMode) requestAnimationFrame(() => this.editor.fitZoom(this.editor.zoomMode));
    if (save) this.savePrefs();
    this.scheduleChrome();
  }

  savePrefs() { api.setPrefs(this.editor.prefs); }

  closePopups() { closeAllPopups(); }

  alert(title, msg) { return alertBox(title, msg); }

  shortcutList() {
    const out = [];
    const walk = (items, path) => {
      for (const it of items) {
        if (it.sep) continue;
        if (it.items) { if (Array.isArray(it.items)) walk(it.items, `${path}${it.label} › `); continue; }
        if (it.shortcut) out.push([prettyShortcut(it.shortcut, this.isMac), path + it.label]);
      }
    };
    for (const m of menuDefinition(this)) if (Array.isArray(m.items)) walk(m.items, `${m.label} › `);
    out.push(['Shift (while drawing)', 'Squares, circles and straight lines at neat angles']);
    out.push(['Ctrl/Alt + drag', 'Leave a copy behind when moving']);
    out.push(['Arrow keys', 'Nudge the selection (hold Shift for bigger steps)']);
    out.push(['Enter', 'Edit the words of the selected object / finish a polyline']);
    out.push(['Esc', 'Finish drawing and go back to the arrow']);
    return out;
  }

  // ---------- keyboard ----------
  keydown(e) {
    if (dialogOpen()) return;
    if (this.textEditor.active) return;
    const target = e.target;
    if (isTextInput(target)) {
      if (this.isMac && e.metaKey) {
        const roles = { c: 'copy', v: 'paste', x: 'cut', a: 'selectAll', z: e.shiftKey ? 'redo' : 'undo' };
        const role = roles[e.key.toLowerCase()];
        if (role) { e.preventDefault(); api.editRole(role); }
      }
      return;
    }
    const ed = this.editor;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (popupsOpen()) { closeAllPopups(); return; }
      if (this.tools.click) { this.tools.cancelClick(); return; }
      if (ed.tool.name !== 'select') { this.setTool('select'); return; }
      ed.deselect();
      return;
    }
    if (e.key === 'Enter') {
      if (this.tools.click) { e.preventDefault(); this.tools.finishClick(); return; }
      const sel = ed.selected();
      if (sel.length === 1) {
        e.preventDefault();
        const o = sel[0];
        if (o.type === 'text') this.textEditor.start(o, 'text');
        else if (['shape', 'line', 'path'].includes(o.type)) this.textEditor.start(o, 'label');
        return;
      }
    }
    if (e.key.startsWith('Arrow') && !e.ctrlKey && !e.metaKey && ed.selection.length) {
      e.preventDefault();
      // One grid step (or 1 pixel with Alt / without snapping); Shift = 10 steps.
      const base = e.altKey || !ed.doc.grid.snap ? 1 : ed.gridStep();
      const step = base * (e.shiftKey ? 10 : 1);
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      this.run(`nudge:${d[0]}:${d[1]}`);
      return;
    }
    const sc = shortcutFromEvent(e, this.isMac);
    if (sc && this.shortcuts.has(sc)) {
      e.preventDefault();
      if (popupsOpen()) closeAllPopups();
      const cmd = this.shortcuts.get(sc);
      if (this.commands.enabled(cmd)) this.run(cmd);
      return;
    }
    // Typing with a single object selected writes into it (like the original).
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const sel = ed.selected();
      if (sel.length === 1 && ['shape', 'line', 'path', 'text'].includes(sel[0].type)) {
        e.preventDefault();
        this.textEditor.start(sel[0], sel[0].type === 'text' ? 'text' : 'label', { initial: e.key });
      }
    }
  }
}

const app = new App();
window.basilApp = app; // handy for debugging and tests
app.start();
