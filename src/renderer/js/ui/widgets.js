// Reusable UI pieces: colour palette, colour picker, dialogs, tabs, swatch grids.

import { h, showPopup, closeAllPopups } from './dom.js';
import { PALETTE, colorName, lighter, darker } from '../palette.js';

// ---------- colour palette popup ----------
export function paletteElement(current, { allowNone = false, noneLabel = 'Transparent' } = {}, onPick) {
  const grid = h('div', { class: 'palette-grid' });
  for (const row of PALETTE) {
    for (const c of row) {
      const cell = h('button', {
        class: 'swatch' + (current && c.color.toLowerCase() === String(current).toLowerCase() ? ' current' : ''),
        title: c.name, style: { background: c.color },
        onClick: () => onPick(c.color),
      });
      grid.appendChild(cell);
    }
  }
  const picker = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(current || '') ? current : '#000000', class: 'hidden-color' });
  picker.addEventListener('change', () => onPick(picker.value));
  const items = h('div', { class: 'palette-items' },
    allowNone ? h('button', { class: 'menuitem', onClick: () => onPick('none') }, noneLabel) : null,
    h('button', { class: 'menuitem', disabled: !current || current === 'none', onClick: () => onPick(lighter(current)) }, 'Lighter'),
    h('button', { class: 'menuitem', disabled: !current || current === 'none', onClick: () => onPick(darker(current)) }, 'Darker'),
    h('button', { class: 'menuitem', onClick: () => picker.click() }, 'New Color…'),
    picker,
  );
  return h('div', { class: 'palette' }, grid, items);
}

export function showPalettePopup(anchorEl, current, opts, onPick) {
  const el = paletteElement(current, opts, (c) => { closeAllPopups(); onPick(c); });
  showPopup(el, anchorEl.getBoundingClientRect());
}

// ---------- colour picker for dialogs ----------
export class ColorPicker {
  constructor(value, { allowNone = false, noneLabel = 'Transparent', onChange = null } = {}) {
    this.value = value;
    this.allowNone = allowNone;
    this.noneLabel = noneLabel;
    this.onChange = onChange;
    this.swatch = h('span', { class: 'cp-swatch' });
    this.label = h('span', { class: 'cp-label' });
    this.el = h('button', { class: 'colorpicker', type: 'button', 'data-popup-owner': '1', onClick: () => this.open() },
      this.swatch, this.label, h('span', { class: 'cp-arrow' }, '▾'));
    this.update();
  }
  open() {
    const el = paletteElement(this.value, { allowNone: this.allowNone, noneLabel: this.noneLabel }, (c) => {
      closeAllPopups();
      this.set(c);
      if (this.onChange) this.onChange(c);
    });
    showPopup(el, this.el.getBoundingClientRect());
  }
  set(v) { this.value = v; this.update(); }
  update() {
    const none = !this.value || this.value === 'none';
    this.swatch.style.background = none ? 'transparent' : this.value;
    this.swatch.classList.toggle('none', none);
    this.label.textContent = none ? this.noneLabel : colorName(this.value);
  }
}

// ---------- swatch grid (patterns, gradients, line ends…) ----------
export function swatchGrid(items, selected, cols, onSelect, cls = '') {
  const grid = h('div', { class: `swatch-grid ${cls}`, style: { gridTemplateColumns: `repeat(${cols}, auto)` } });
  items.forEach((html, i) => {
    const b = h('button', { type: 'button', class: 'swatch-cell' + (i === selected ? ' selected' : ''), html });
    b.addEventListener('click', () => {
      grid.querySelectorAll('.swatch-cell').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      onSelect(i);
    });
    grid.appendChild(b);
  });
  grid.select = (i) => {
    grid.querySelectorAll('.swatch-cell').forEach((x, j) => x.classList.toggle('selected', i === j));
  };
  return grid;
}

// ---------- fieldset-like group box ----------
export function groupBox(title, ...children) {
  return h('fieldset', { class: 'groupbox' }, h('legend', {}, title), ...children);
}

export function radio(name, value, label, checked, onChange) {
  const input = h('input', { type: 'radio', name, value, checked });
  input.addEventListener('change', () => { if (input.checked) onChange(value); });
  return h('label', { class: 'radio' }, input, ' ', label);
}

export function checkbox(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  const el = h('label', { class: 'check' }, input, ' ', label);
  el.input = input;
  return el;
}

export function numberInput(value, { min, max, step = 1, width = 64, onChange } = {}) {
  const input = h('input', { type: 'number', value, min, max, step, style: { width: `${width}px` } });
  input.addEventListener('input', () => { const v = parseFloat(input.value); if (!Number.isNaN(v) && onChange) onChange(v); });
  return input;
}

export function select(options, value, onChange, attrs = {}) {
  const el = h('select', attrs);
  for (const opt of options) {
    const [v, label] = Array.isArray(opt) ? opt : [opt, opt];
    el.appendChild(h('option', { value: v, selected: String(v) === String(value) }, label));
  }
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

// ---------- tabs ----------
export function tabs(defs, initial = 0) {
  const bar = h('div', { class: 'tabbar' });
  const body = h('div', { class: 'tabbody' });
  const panes = [];
  let current = -1;
  const show = (i) => {
    current = i;
    bar.querySelectorAll('.tab').forEach((t, j) => t.classList.toggle('active', i === j));
    panes.forEach((p, j) => { p.style.display = i === j ? '' : 'none'; });
    defs[i].onShow?.();
  };
  defs.forEach((d, i) => {
    bar.appendChild(h('button', { type: 'button', class: 'tab', onClick: () => show(i) }, d.title));
    const pane = h('div', { class: 'tabpane' }, d.content);
    panes.push(pane);
    body.appendChild(pane);
  });
  const el = h('div', { class: 'tabs' }, bar, body);
  show(initial);
  el.show = show;
  el.current = () => current;
  return el;
}

// ---------- dialogs ----------
const dialogLayer = () => document.getElementById('dialog-layer');
let dialogStack = [];

export function dialogOpen() { return dialogStack.length > 0; }

export function openDialog({ title, body, buttons = [], width, onKey, className = '' }) {
  return new Promise((resolve) => {
    const close = (result) => {
      overlay.remove();
      dialogStack = dialogStack.filter((d) => d !== overlay);
      closeAllPopups();
      document.removeEventListener('keydown', keyHandler, true);
      resolve(result);
    };
    if (typeof body === 'function') body = body(close);
    const btnRow = h('div', { class: 'dlg-buttons' });
    for (const b of buttons) {
      const btn = h('button', { type: 'button', class: 'btn' + (b.default ? ' default' : ''), disabled: b.disabled },
        b.label);
      btn.addEventListener('click', async () => {
        if (b.onClick) {
          const r = await b.onClick();
          if (r === false) return; // keep open
          if (b.close !== false) close(b.value ?? r);
        } else close(b.value);
      });
      b.el = btn;
      btnRow.appendChild(btn);
    }
    const titleBar = h('div', { class: 'dlg-title' }, h('span', {}, title),
      h('button', { type: 'button', class: 'dlg-x', title: 'Close', onClick: () => close(null) }, '✕'));
    const box = h('div', { class: `dialog ${className}`, role: 'dialog', style: width ? { width: `${width}px` } : {} },
      titleBar, h('div', { class: 'dlg-body' }, body), buttons.length ? btnRow : null);
    const overlay = h('div', { class: 'dlg-overlay' }, box);
    dialogLayer().appendChild(overlay);
    dialogStack.push(overlay);
    // drag by title bar
    titleBar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = box.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const mv = (ev) => {
        box.style.position = 'fixed';
        box.style.margin = '0';
        box.style.left = `${ev.clientX - ox}px`;
        box.style.top = `${ev.clientY - oy}px`;
      };
      const upHandler = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upHandler); };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', upHandler);
    });
    const keyHandler = (e) => {
      if (dialogStack[dialogStack.length - 1] !== overlay) return;
      if (onKey && onKey(e) === true) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const def = buttons.find((b) => b.default);
        if (def) { e.preventDefault(); e.stopPropagation(); def.el.click(); }
      }
    };
    document.addEventListener('keydown', keyHandler, true);
    const first = box.querySelector('input:not([type=radio]):not([type=checkbox]), select, textarea');
    setTimeout(() => (first || btnRow.querySelector('.default') || box).focus?.(), 0);
  });
}

export function alertBox(title, message) {
  return openDialog({ title, body: h('p', { class: 'msg' }, message), buttons: [{ label: 'OK', default: true, value: true }], width: 360 });
}

export function confirmBox(title, message, ok = 'OK', cancel = 'Cancel') {
  return openDialog({ title, body: h('p', { class: 'msg' }, message),
    buttons: [{ label: ok, default: true, value: true }, { label: cancel, value: false }], width: 380 });
}

export function promptBox(title, label, value = '') {
  const input = h('input', { type: 'text', value, style: { width: '100%' } });
  return openDialog({
    title, width: 360,
    body: h('div', { class: 'prompt' }, h('label', {}, label), input),
    buttons: [{ label: 'OK', default: true, onClick: () => input.value }, { label: 'Cancel', value: null }],
  });
}
