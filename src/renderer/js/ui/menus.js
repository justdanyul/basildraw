// The in-window menu bar (File, Edit, View, …) and its keyboard shortcuts.

import { h, showPopup, closeAllPopups, closePopupsAfter } from './dom.js';
import { GROUPS, SHAPE_INFO, LINE_INFO } from '../shapes.js';

const sep = { sep: true };
const item = (label, cmd, shortcut = '', extra = {}) => ({ label, cmd, shortcut, ...extra });
const sub = (label, items) => ({ label, items });

export function menuDefinition(app) {
  const lineItems = (tool) => GROUPS.lines.map((k) => item(LINE_INFO[k].name, `tool:${tool}:${k}`));
  const shapeItems = (g) => GROUPS[g].map((k) => item(SHAPE_INFO[k].name, `tool:shape:${k}`));
  return [
    sub('File', [
      item('New', 'new', 'Ctrl+N'),
      item('New Project…', 'newProject'),
      item('Open…', 'open', 'Ctrl+O'),
      item('Close', 'close', 'Ctrl+W'),
      item('Close All', 'closeAll'),
      sep,
      item('Save', 'save', 'Ctrl+S'),
      item('Save As…', 'saveAs', 'Ctrl+Shift+S'),
      item('Save Selection…', 'saveSelection'),
      sub('Export', [item('PNG Picture…', 'exportPng'), item('SVG Drawing…', 'exportSvg'), item('PDF Document…', 'exportPdf')]),
      sep,
      item('Page Setup…', 'pageSetup'),
      item('Page Background…', 'pageBackground'),
      item('Print Preview', 'printPreview'),
      item('Print…', 'print', 'Ctrl+P'),
      sep,
      sub('Recent Files', () => (app.recent.length
        ? app.recent.map((p, i) => item(`${i + 1} ${p.split(/[\\/]/).pop()}`, `recent:${p}`, '', { title: p }))
        : [item('(none)', 'noop', '', { disabled: true })])),
      sep,
      item('Exit', 'exit', 'Ctrl+Q'),
    ]),
    sub('Edit', [
      item('Undo', 'undo', 'Ctrl+Z'),
      item('Redo', 'redo', 'Ctrl+Y'),
      sep,
      item('Cut', 'cut', 'Ctrl+X'),
      item('Copy', 'copy', 'Ctrl+C'),
      item('Paste', 'paste', 'Ctrl+V'),
      item('Paste as New Drawing', 'pasteNew'),
      item('Delete', 'delete', 'Del'),
      sep,
      item('Select All', 'selectAll', 'Ctrl+A, F2'),
      item('Deselect All', 'deselectAll', 'Ctrl+F2'),
      sep,
      item('Select Mode', 'selectMode', '', { check: true }),
      item('Rotate/Slant', 'rotateMode', '', { check: true }),
    ]),
    sub('View', [
      item('Zoom In', 'zoomIn', 'PageUp'),
      item('Zoom Out', 'zoomOut', 'PageDown'),
      item('Zoom Area', 'zoomArea'),
      sep,
      item('Page', 'zoomPage', 'Home'),
      item('Page Width', 'zoomWidth'),
      item('Selection', 'zoomSelection', 'Shift+Home'),
      item('Actual Size', 'zoomActual', 'Ctrl+Home'),
      item('Previous', 'zoomPrevious', 'End'),
      sep,
      item('Redraw', 'redraw', 'F3'),
      sep,
      item('Proof Mode', 'proof', '', { check: true }),
      sep,
      sub('Toolbars', [item('Standard', 'tb:standard', '', { check: true }), item('Format', 'tb:format', '', { check: true }), item('Toolbox', 'tb:toolbox', '', { check: true })]),
      item('Status Bar', 'statusBar', '', { check: true }),
      item('Rulers', 'rulers', '', { check: true }),
    ]),
    sub('Insert', [
      item('Picture…', 'insertPicture'),
      item('Clip Art…', 'clipArt'),
      sep,
      sub('Text', [item('Text', 'insertText', 'Ctrl+T'), item('Text File…', 'insertTextFile')]),
      sub('Lines', lineItems('line')),
      sub('Connector Lines', lineItems('connector')),
      sub('Shapes', shapeItems('shapes')),
      sub('CoolShapes', shapeItems('cool')),
      sub('Borders', shapeItems('borders')),
      sub('ArrowShapes', shapeItems('arrows')),
    ]),
    sub('Format', [
      item('Fill…', 'fmtFill'),
      item('Line…', 'fmtLine'),
      item('Line Ends…', 'fmtEnds'),
      item('Shadow…', 'fmtShadow'),
      item('Text…', 'fmtText'),
      item('Object…', 'fmtObject', 'Ctrl+D'),
      sep,
      item('Default Properties…', 'defaults'),
      sep,
      sub('Label Position', ['center', 'top', 'bottom', 'left', 'right', 'above', 'below'].map((p) =>
        item(p[0].toUpperCase() + p.slice(1), `labelpos:${p}`, '', { check: true }))),
      sub('Justification', [item('Left', 'justify:left', '', { check: true }), item('Center', 'justify:center', '', { check: true }), item('Right', 'justify:right', '', { check: true })]),
      sep,
      item('Pick up Object Defaults', 'pickupDefaults'),
      item('Apply to Object Defaults', 'applyDefaults'),
    ]),
    sub('Tools', [
      item('Blend…', 'blend'),
      sep,
      item('Group', 'group', 'F5'),
      item('Ungroup', 'ungroup', 'Shift+F5'),
      item('Separate Label Text', 'separateLabel'),
      sep,
      item('Convert to Curves', 'toCurves'),
      sep,
      item('Wizard Defaults…', 'wizardDefaults'),
      item('Options…', 'options', 'F12'),
    ]),
    sub('Draw', [
      item('Grid Options…', 'gridOptions'),
      item('Snap to Grid', 'snap', 'Ctrl+G', { check: true }),
      sep,
      item('Send to Back', 'toBack', 'F9'),
      item('Bring to Front', 'toFront', 'F10'),
      item('Send Backward', 'backward', 'Shift+F9'),
      item('Bring Forward', 'forward', 'Shift+F10'),
      sep,
      sub('Layers', [
        item('Layer Manager…', 'layerManager'),
        item('Edit All Layers', 'editAllLayers', '', { check: true }),
        item('Add Layer…', 'addLayer'),
        sep,
        item('Move to Layer…', 'moveToLayer'),
        item('Move Back One Layer', 'layerBack', 'Ctrl+F9'),
        item('Move Forward One Layer', 'layerForward', 'Ctrl+F10'),
      ]),
      sub('Align Objects', [
        item('Left', 'align:left'), item('Center', 'align:center'), item('Right', 'align:right'), item('Page Center', 'align:pagecenter'),
        sep,
        item('Top', 'align:top'), item('Middle', 'align:middle'), item('Bottom', 'align:bottom'), item('Page Middle', 'align:pagemiddle'),
      ]),
      sub('Space Objects', [
        item('Edges Horizontally', 'space:edgesH'), item('Edges Vertically', 'space:edgesV'),
        sep,
        item('Centers Horizontally', 'space:centersH'), item('Centers Vertically', 'space:centersV'),
      ]),
      sub('Center', [item('Entire Drawing', 'centerAll'), item('Selected Objects', 'centerSel')]),
      sep,
      item('Move/Size…', 'moveSize'),
      sub('Flip', [item('Horizontally', 'flipH', 'F7'), item('Vertically', 'flipV', 'Shift+F7')]),
      sub('Rotate', [item('Left 90', 'rotL', 'F8'), item('Right 90', 'rotR', 'Shift+F8'), item('Angle…', 'rotAngle'), item('Options…', 'rotOptions')]),
    ]),
    sub('Window', () => [
      item('New Drawing Window', 'win:new'),
      sep,
      ...app.windows.map((w, i) => item(`${i + 1} ${w.title}`, `win:${w.id}`, '', { check: true, checkedFn: () => w.title === app.editor.docName })),
    ]),
    sub('Help', [
      item('Basil Draw Help', 'help', 'F1'),
      item('Keyboard Shortcuts', 'shortcuts'),
      sep,
      item('About Basil Draw…', 'about'),
    ]),
  ];
}

// ---------- shortcuts ----------
export function shortcutFromEvent(e, isMac) {
  const parts = [];
  if (e.ctrlKey || (isMac && e.metaKey)) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let k = e.key;
  if (k === ' ') k = 'Space';
  if (k === 'Delete' || k === 'Backspace') k = 'Del';
  if (k.length === 1) k = k.toUpperCase();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null;
  parts.push(k);
  return parts.join('+');
}

export function collectShortcuts(defs) {
  const map = new Map();
  const walk = (items) => {
    for (const it of items) {
      if (it.sep) continue;
      if (it.items) { if (Array.isArray(it.items)) walk(it.items); continue; }
      if (!it.shortcut) continue;
      for (const s of it.shortcut.split(',').map((x) => x.trim())) map.set(s, it.cmd);
    }
  };
  walk(defs);
  map.set('Ctrl+Shift+Z', 'redo');
  return map;
}

export function prettyShortcut(s, isMac) {
  if (!isMac || !s) return s;
  return s.split(', ').map((x) => x.replace('Ctrl+', '⌘').replace('Shift+', '⇧').replace('Alt+', '⌥')).join(', ');
}

// ---------- menubar UI ----------
export class MenuBar {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.openIndex = -1;
    this.build();
  }

  build() {
    this.defs = menuDefinition(this.app);
    this.el.innerHTML = '';
    this.buttons = this.defs.map((m, i) => {
      const b = h('button', { class: 'menutop', 'data-popup-owner': '1' }, m.label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.openIndex === i) this.close(); else this.open(i);
      });
      b.addEventListener('pointerenter', () => { if (this.openIndex >= 0 && this.openIndex !== i) this.open(i); });
      this.el.appendChild(b);
      return b;
    });
  }

  close() {
    closeAllPopups();
  }

  open(i) {
    this.app.textEditor?.active && this.app.textEditor.commit();
    closeAllPopups();
    this.openIndex = i;
    const btn = this.buttons[i];
    btn.classList.add('open');
    const items = typeof this.defs[i].items === 'function' ? this.defs[i].items() : this.defs[i].items;
    const panel = this.panel(items);
    showPopup(panel, btn.getBoundingClientRect(), {
      onClose: () => { btn.classList.remove('open'); if (this.openIndex === i) this.openIndex = -1; },
    });
  }

  panel(items) {
    const isMac = this.app.isMac;
    const panel = h('div', { class: 'menu' });
    for (const it of items) {
      if (it.sep) { panel.appendChild(h('div', { class: 'menusep' })); continue; }
      if (it.items) {
        const row = h('div', { class: 'menuitem has-sub' }, h('span', { class: 'mi-check' }), h('span', { class: 'mi-label' }, it.label), h('span', { class: 'mi-arrow' }, '▸'));
        let timer = null;
        const openSub = () => {
          closePopupsAfter(panel);
          panel.querySelectorAll('.menuitem.active').forEach((x) => x.classList.remove('active'));
          row.classList.add('active');
          const subItems = typeof it.items === 'function' ? it.items() : it.items;
          showPopup(this.panel(subItems), row.getBoundingClientRect(), { side: 'right', keep: true });
        };
        row.addEventListener('pointerenter', () => { clearTimeout(timer); timer = setTimeout(openSub, 120); });
        row.addEventListener('pointerleave', () => clearTimeout(timer));
        row.addEventListener('click', openSub);
        panel.appendChild(row);
        continue;
      }
      const enabled = !it.disabled && this.app.commands.enabled(it.cmd);
      const checked = it.check && (it.checkedFn ? it.checkedFn() : this.app.commands.checked(it.cmd));
      const row = h('div', { class: 'menuitem' + (enabled ? '' : ' disabled'), title: it.title || '' },
        h('span', { class: 'mi-check' }, checked ? '✓' : ''),
        h('span', { class: 'mi-label' }, it.label),
        h('span', { class: 'mi-key' }, prettyShortcut(it.shortcut, isMac)));
      row.addEventListener('pointerenter', () => {
        closePopupsAfter(panel);
        panel.querySelectorAll('.menuitem.active').forEach((x) => x.classList.remove('active'));
      });
      row.addEventListener('click', () => {
        if (!enabled) return;
        closeAllPopups();
        this.app.run(it.cmd);
      });
      panel.appendChild(row);
    }
    return panel;
  }
}
