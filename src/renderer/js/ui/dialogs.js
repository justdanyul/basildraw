// All the dialog boxes.

import { h } from './dom.js';
import {
  openDialog, ColorPicker, swatchGrid, groupBox, radio, checkbox, numberInput, select, tabs,
  paletteElement, alertBox,
} from './widgets.js';
import { PATTERNS, GRADIENTS, LINE_ENDS, patternDef, gradientDef, renderObject } from '../render.js';
import { clone, newId, SCREEN_SIZES } from '../model.js';
import { cm, fromCm, round, PX_PER_IN } from '../geometry.js';
import { updateTextMetrics } from '../render.js';
import { CLIPART } from '../clipart.js';

// ---------- small previews ----------
function patternSwatch(i, fg = '#000000', bg = '#ffffff') {
  const id = `pv-p${i}-${Math.random().toString(36).slice(2, 6)}`;
  return `<svg width="34" height="22"><defs>${patternDef(id, { pattern: i, fg, bg })}</defs><rect width="34" height="22" fill="url(#${id})" stroke="#888"/></svg>`;
}
function gradientSwatch(i, start = '#ffffff', end = '#000000') {
  const id = `pv-g${i}-${Math.random().toString(36).slice(2, 6)}`;
  return `<svg width="44" height="34"><defs>${gradientDef(id, { gradient: i, start, end })}</defs><rect width="44" height="34" fill="url(#${id})" stroke="#888"/></svg>`;
}
function endSwatch(i, dir) {
  const e = LINE_ENDS[i];
  const y = 8, s = 1.1;
  const lineEnd = dir === 'end' ? 32 : 6;
  let glyph = '';
  if (e) {
    const body = e.body.replace(/\{c\}/g, '#000');
    glyph = dir === 'end'
      ? `<g transform="translate(${lineEnd - e.refX * s} ${y - 5 * s}) scale(${s})">${body}</g>`
      : `<g transform="translate(${lineEnd + e.refX * s} ${y - 5 * s}) scale(${-s} ${s})">${body}</g>`;
  }
  const d = dir === 'end' ? `M3 ${y}H${lineEnd}` : `M${lineEnd} ${y}H35`;
  return `<svg width="38" height="16"><path d="${d}" stroke="#000" stroke-width="1.2"/>${glyph}</svg>`;
}
const DASHES = ['solid', 'dash', 'dot', 'dashdot', 'dashdotdot'];
const DASH_ARR = { solid: '', dash: '6 4', dot: '1.5 3', dashdot: '6 3 1.5 3', dashdotdot: '6 3 1.5 3 1.5 3' };
function dashSwatch(d) {
  return `<svg width="120" height="12"><path d="M4 6H116" stroke="#000" stroke-width="1.6"${DASH_ARR[d] ? ` stroke-dasharray="${DASH_ARR[d]}"` : ''}/></svg>`;
}

function sampleSvg(kind, style) {
  const base = { id: 'sample', layer: '', name: '', rot: 0, skx: 0, sky: 0, fh: false, fv: false, label: '', ...clone(style) };
  let o;
  if (kind === 'line') {
    o = { ...base, type: 'line', kind: 'straight', x: 20, y: 30, w: 150, h: 0, points: [{ x: 0, y: 0 }, { x: 150, y: 0 }] };
  } else if (kind === 'text') {
    o = { ...base, type: 'text', kind: 'text', content: 'AaBbXxYy', x: 0, y: 0 };
    updateTextMetrics(o);
    const s = Math.min(1, 170 / o.w, 50 / o.h);
    o.w *= s; o.h *= s;
    o.x = (190 - o.w) / 2; o.y = (60 - o.h) / 2;
  } else {
    o = { ...base, type: 'shape', kind: 'rect', x: 40, y: 12, w: 110, h: 36 };
  }
  const markup = renderObject(o, { doc: { images: {} }, uid: `sm${Math.random().toString(36).slice(2, 6)}`, forExport: true });
  return `<svg width="190" height="60" viewBox="0 0 190 60"><rect width="190" height="60" fill="#fff"/>${markup}</svg>`;
}

// ---------- Object Properties ----------
// opts: { style, general|null, layers, fonts, title, initialTab }
export function objectPropertiesDialog(opts) {
  const st = clone(opts.style);
  const gen = opts.general ? clone(opts.general) : null;
  const sample = h('div', { class: 'sample' });
  let sampleKind = 'shape';
  const refreshSample = () => { sample.innerHTML = sampleSvg(sampleKind, st); };

  // Fill tab
  const fillOpts = h('div', { class: 'fill-options' });
  const renderFillOpts = () => {
    fillOpts.innerHTML = '';
    const f = st.fill;
    if (f.style === 'solid') {
      fillOpts.append(groupBox('Color', new ColorPicker(f.color, { onChange: (c) => { f.color = c; refreshSample(); } }).el));
    } else if (f.style === 'pattern') {
      const grid = swatchGrid(PATTERNS.map((_, i) => patternSwatch(i)), f.pattern, 5, (i) => { f.pattern = i; refreshSample(); }, 'patterns');
      fillOpts.append(
        groupBox('Pattern Style', grid),
        groupBox('Foreground Color', new ColorPicker(f.fg, { onChange: (c) => { f.fg = c; refreshSample(); } }).el),
        groupBox('Background Color', new ColorPicker(f.bg, { onChange: (c) => { f.bg = c; refreshSample(); } }).el),
      );
    } else if (f.style === 'gradient') {
      const grid = swatchGrid(GRADIENTS.map((_, i) => gradientSwatch(i)), f.gradient, 4, (i) => { f.gradient = i; refreshSample(); }, 'gradients');
      fillOpts.append(
        groupBox('Gradient Style', grid),
        groupBox('Start Color', new ColorPicker(f.start, { onChange: (c) => { f.start = c; refreshSample(); } }).el),
        groupBox('End Color', new ColorPicker(f.end, { onChange: (c) => { f.end = c; refreshSample(); } }).el),
      );
    }
  };
  const fillTab = h('div', { class: 'proptab fill-tab' },
    groupBox('Fill Style',
      ...[['none', 'No Fill', 'fs-none'], ['solid', 'Solid', 'fs-solid'], ['pattern', 'Pattern', 'fs-pattern'], ['gradient', 'Gradient', 'fs-gradient']]
        .map(([v, label, cls]) => h('div', { class: 'fs-row' }, h('span', { class: `fs-icon ${cls}` }),
          radio('fillstyle', v, label, st.fill.style === v, (val) => { st.fill.style = val; renderFillOpts(); refreshSample(); })))),
    fillOpts);
  renderFillOpts();

  // Line tab
  const thick = numberInput(st.line.width, { min: 0.25, max: 72, step: 0.5, onChange: (v) => { st.line.width = v; if (st.line.style !== 'wide') { st.line.style = 'wide'; wideRadio.querySelector('input').checked = true; } refreshSample(); } });
  const wideRadio = radio('linestyle', 'wide', 'Wide Line', st.line.style === 'wide', (v) => { st.line.style = v; refreshSample(); });
  const dashGrid = swatchGrid(DASHES.map(dashSwatch), DASHES.indexOf(st.line.dash || 'solid'), 1, (i) => { st.line.dash = DASHES[i]; refreshSample(); }, 'dashes');
  const lineTab = h('div', { class: 'proptab line-tab' },
    h('div', { class: 'col' },
      groupBox('Line Style',
        radio('linestyle', 'none', 'No Line', st.line.style === 'none', (v) => { st.line.style = v; refreshSample(); }),
        radio('linestyle', 'hairline', 'Hairline', st.line.style === 'hairline', (v) => { st.line.style = v; refreshSample(); }),
        wideRadio),
      groupBox('Line Thickness', h('div', { class: 'row' }, thick, ' pt.')),
      groupBox('Line Color', new ColorPicker(st.line.color, { onChange: (c) => { st.line.color = c; refreshSample(); } }).el)),
    h('div', { class: 'col' }, groupBox('Style', dashGrid)));

  // Ends tab
  let startGrid, endGrid;
  const both = checkbox('Both Same', st.ends.start === st.ends.end && st.ends.start !== 0, (v) => {
    if (v) { st.ends.start = st.ends.end; startGrid.select(st.ends.start); refreshSample(); }
  });
  startGrid = swatchGrid(LINE_ENDS.map((_, i) => endSwatch(i, 'start')), st.ends.start, 4, (i) => {
    st.ends.start = i; if (both.input.checked) { st.ends.end = i; endGrid.select(i); } refreshSample();
  }, 'ends');
  endGrid = swatchGrid(LINE_ENDS.map((_, i) => endSwatch(i, 'end')), st.ends.end, 4, (i) => {
    st.ends.end = i; if (both.input.checked) { st.ends.start = i; startGrid.select(i); } refreshSample();
  }, 'ends');
  const endsTab = h('div', { class: 'proptab ends-tab' },
    h('div', { class: 'row top' }, groupBox('Start', startGrid), groupBox('End', endGrid)),
    h('div', { class: 'row' }, both,
      groupBox('Line End Size', select([['small', 'small'], ['medium', 'medium'], ['large', 'large']], st.ends.size, (v) => { st.ends.size = v; refreshSample(); }))));

  // Shadow tab
  const shadowTab = h('div', { class: 'proptab shadow-tab' },
    groupBox('Shadow Style',
      ...[['none', 'No Shadow'], ['simple', 'Simple'], ['block', 'Block'], ['soft', 'Soft']].map(([v, l]) =>
        h('div', { class: 'fs-row' }, h('span', { class: `sh-icon sh-${v}` }),
          radio('shadowstyle', v, l, st.shadow.style === v, (val) => { st.shadow.style = val; refreshSample(); })))),
    groupBox('Shadow Color', new ColorPicker(st.shadow.color, { onChange: (c) => { st.shadow.color = c; refreshSample(); } }).el));

  // Text tab
  const fonts = opts.fonts.includes(st.text.font) ? opts.fonts : [st.text.font, ...opts.fonts];
  const fontInput = h('input', { type: 'text', value: st.text.font, class: 'font-input' });
  const fontList = select(fonts.map((f) => [f, f]), st.text.font, (v) => { st.text.font = v; fontInput.value = v; refreshSample(); }, { size: 6, class: 'font-list' });
  fontInput.addEventListener('change', () => { st.text.font = fontInput.value; refreshSample(); });
  const sizes = [6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 54, 60, 72, 96, 120, 144];
  const sizeInput = h('input', { type: 'number', value: st.text.size, min: 1, max: 1000, class: 'size-input' });
  const sizeList = select(sizes.map((s) => [s, String(s)]), st.text.size, (v) => { st.text.size = Number(v); sizeInput.value = v; refreshSample(); }, { size: 6, class: 'size-list' });
  sizeInput.addEventListener('input', () => { const v = parseFloat(sizeInput.value); if (v > 0) { st.text.size = v; refreshSample(); } });
  const textTab = h('div', { class: 'proptab text-tab' },
    h('div', { class: 'row top' },
      h('div', { class: 'col' }, h('label', {}, 'Font'), fontInput, fontList),
      h('div', { class: 'col' }, h('label', {}, 'Size'), sizeInput, sizeList),
      groupBox('Font Style',
        checkbox('Bold', st.text.bold, (v) => { st.text.bold = v; refreshSample(); }),
        checkbox('Italic', st.text.italic, (v) => { st.text.italic = v; refreshSample(); }),
        checkbox('Underline', st.text.underline, (v) => { st.text.underline = v; refreshSample(); }),
        checkbox('Strikeout', st.text.strike, (v) => { st.text.strike = v; refreshSample(); }))),
    h('div', { class: 'row top' },
      h('div', { class: 'col' },
        groupBox('Text Color', new ColorPicker(st.text.color, { onChange: (c) => { st.text.color = c; refreshSample(); } }).el),
        groupBox('Background Color', new ColorPicker(st.text.bg, { allowNone: true, onChange: (c) => { st.text.bg = c; refreshSample(); } }).el)),
      groupBox('Justification',
        radio('just', 'left', 'Left', st.text.align === 'left', (v) => { st.text.align = v; refreshSample(); }),
        radio('just', 'center', 'Center', st.text.align === 'center', (v) => { st.text.align = v; refreshSample(); }),
        radio('just', 'right', 'Right', st.text.align === 'right', (v) => { st.text.align = v; refreshSample(); }))));

  // General tab
  let generalTab = null;
  if (gen) {
    const ratio = gen.w && gen.h ? gen.w / gen.h : 1;
    let keep = true;
    const wIn = numberInput(round(cm(gen.w), 2), { step: 0.1, min: 0.01, onChange: (v) => { gen.w = fromCm(v); if (keep) { gen.h = gen.w / ratio; hIn.value = round(cm(gen.h), 2); } } });
    const hIn = numberInput(round(cm(gen.h), 2), { step: 0.1, min: 0.01, onChange: (v) => { gen.h = fromCm(v); if (keep) { gen.w = gen.h * ratio; wIn.value = round(cm(gen.w), 2); } } });
    generalTab = h('div', { class: 'proptab general-tab' },
      groupBox('Object Name', h('input', { type: 'text', value: gen.name || '', style: { width: '220px' }, onInput: (e) => { gen.name = e.target.value; } })),
      groupBox('Location (centimeters)', h('div', { class: 'row' },
        'x: ', numberInput(round(cm(gen.x), 2), { step: 0.1, onChange: (v) => { gen.x = fromCm(v); } }),
        '  y: ', numberInput(round(cm(gen.y), 2), { step: 0.1, onChange: (v) => { gen.y = fromCm(v); } }))),
      groupBox('Size (centimeters)', h('div', { class: 'row' }, 'x: ', wIn, '  y: ', hIn),
        checkbox('Keep proportional', true, (v) => { keep = v; })),
      groupBox('Rotation', h('div', { class: 'row' }, numberInput(round(gen.rot || 0, 1), { step: 1, min: -360, max: 360, onChange: (v) => { gen.rot = v; } }), ' degrees')),
      groupBox('Layer of Object', select(opts.layers.map((l) => [l.id, l.name]), gen.layer, (v) => { gen.layer = v; })));
  }

  const tabDefs = [
    { title: 'Fill', content: fillTab, onShow: () => { sampleKind = 'shape'; refreshSample(); } },
    { title: 'Line', content: lineTab, onShow: () => { sampleKind = 'line'; refreshSample(); } },
    { title: 'Ends', content: endsTab, onShow: () => { sampleKind = 'line'; refreshSample(); } },
    { title: 'Shadow', content: shadowTab, onShow: () => { sampleKind = 'shape'; refreshSample(); } },
    { title: 'Text', content: textTab, onShow: () => { sampleKind = 'text'; refreshSample(); } },
  ];
  if (generalTab) tabDefs.push({ title: 'General', content: generalTab, onShow: () => { sampleKind = 'shape'; refreshSample(); } });
  const tabIndex = Math.max(0, tabDefs.findIndex((t) => t.title.toLowerCase() === (opts.initialTab || 'fill')));
  const tabsEl = tabs(tabDefs, tabIndex);
  const body = h('div', { class: 'objprops' }, tabsEl, h('div', { class: 'sample-box' }, groupBox('Sample', sample)));

  return openDialog({
    title: opts.title || 'Object Properties',
    width: 720,
    body,
    buttons: [
      { label: 'OK', default: true, onClick: () => { opts.onApply(clone(st), gen ? clone(gen) : null); return true; } },
      { label: 'Close', value: null },
      { label: 'Apply', onClick: () => { opts.onApply(clone(st), gen ? clone(gen) : null); return false; } },
      { label: 'Help', onClick: () => { opts.onHelp?.(); return false; } },
    ],
  });
}

// ---------- Page Setup ----------
export const PAPERS = [
  ['A4', 21, 29.7], ['A3', 29.7, 42], ['A5', 14.8, 21], ['Letter', 21.59, 27.94], ['Legal', 21.59, 35.56], ['Tabloid', 27.94, 43.18],
];
const LAYOUTS = {
  printer: { name: 'Printer Sheet', options: PAPERS.map(([n, w, hh]) => [n, `${n} (${w} x ${hh} cm)`, w, hh]), orient: true, hint: 'One page the size of a sheet of printer paper.' },
  folded: { name: 'Folded Sheet/Card', options: [['half-a4', 'Half-fold card from A4 (A5)', 14.8, 21], ['quarter-a4', 'Quarter-fold card from A4 (A6)', 10.5, 14.8], ['half-letter', 'Half-fold card from Letter', 13.97, 21.59], ['quarter-letter', 'Quarter-fold card from Letter', 10.8, 13.97]], orient: true, hint: 'Design the front of a greeting card. (Printing the folded layout comes in a later version.)' },
  banner: { name: 'Banner', options: [2, 3, 4, 5, 6, 8, 10].map((n) => [`${n}`, `${n} A4 sheets long`, 29.7 * n, 21]), orient: false, hint: 'A long banner made of several landscape sheets.' },
  labels: { name: 'Labels', options: [['L7160', 'L7160 (6.35 x 3.81 cm)', 6.35, 3.81], ['L7163', 'L7163 (9.91 x 3.81 cm)', 9.91, 3.81], ['L7165', 'L7165 (9.91 x 6.77 cm)', 9.91, 6.77], ['L7173', 'L7173 (9.9 x 5.7 cm)', 9.9, 5.7], ['5160', 'US 5160 (6.67 x 2.54 cm)', 6.67, 2.54], ['5163', 'US 5163 (10.16 x 5.08 cm)', 10.16, 5.08]], orient: false, hint: 'Design one label.' },
  business: { name: 'Business Cards', options: [['eu', 'European (8.5 x 5.5 cm)', 8.5, 5.5], ['us', 'US (8.89 x 5.08 cm)', 8.89, 5.08]], orient: true, hint: 'Design one business card.' },
  postcard: { name: 'Post Cards', options: [['a6', 'A6 (14.8 x 10.5 cm)', 14.8, 10.5], ['6x4', '6 x 4 in (15.24 x 10.16 cm)', 15.24, 10.16], ['7x5', '7 x 5 in (17.78 x 12.7 cm)', 17.78, 12.7]], orient: true, hint: 'Design one post card.' },
  poster: { name: 'Poster', options: [['A2', 'A2 (42 x 59.4 cm)', 42, 59.4], ['A1', 'A1 (59.4 x 84.1 cm)', 59.4, 84.1], ['A0', 'A0 (84.1 x 118.9 cm)', 84.1, 118.9]], orient: true, hint: 'A big poster. Export it as a PDF for a print shop.' },
  screen: { name: 'Screen', options: SCREEN_SIZES.map((s) => [s, s.replace('x', ' x '), null, null]), orient: false, hint: 'Select the targeted screen resolution.' },
  standard: { name: 'Standard Paper Size', options: PAPERS.map(([n, w, hh]) => [n, `${n} (${w} x ${hh} cm)`, w, hh]), orient: true, hint: 'A standard paper size.' },
  custom: { name: 'Custom Page Size', options: null, orient: true, hint: 'Type the page size you want.' },
};

export function pageSize(layout, preset, orientation, custom) {
  const L = LAYOUTS[layout] || LAYOUTS.screen;
  if (layout === 'screen') {
    const [w, hh] = String(preset || '800x600').split('x').map(Number);
    return { width: w, height: hh };
  }
  let w, hh;
  if (layout === 'custom') { w = custom.w; hh = custom.h; } else {
    const opt = L.options.find((o) => o[0] === preset) || L.options[0];
    w = opt[2]; hh = opt[3];
  }
  let W = fromCm(w), H = fromCm(hh);
  if (L.orient) {
    const land = orientation === 'landscape';
    if ((land && W < H) || (!land && W > H)) [W, H] = [H, W];
  }
  return { width: Math.round(W * 100) / 100, height: Math.round(H * 100) / 100 };
}

export function pageSetupDialog(page) {
  const p = clone(page);
  const custom = { w: round(cm(page.width), 2), h: round(cm(page.height), 2) };
  const opts = h('div', { class: 'ps-options' });
  const preview = h('div', { class: 'ps-preview' });
  const orient = h('div', { class: 'row' });
  const hint = h('div', { class: 'hint' });
  const updatePreview = () => {
    const s = pageSize(p.layout, p.preset, p.orientation, custom);
    const k = Math.min(150 / s.width, 150 / s.height);
    preview.innerHTML = `<div class="ps-paper" style="width:${s.width * k}px;height:${s.height * k}px"></div>` +
      `<div class="ps-dims">${round(cm(s.width), 2)} x ${round(cm(s.height), 2)} cm</div>`;
  };
  const renderOpts = () => {
    const L = LAYOUTS[p.layout];
    opts.innerHTML = '';
    hint.textContent = L.hint;
    if (L.options) {
      if (!L.options.some((o) => o[0] === p.preset)) p.preset = L.options[0][0];
      opts.append(h('label', {}, p.layout === 'screen' ? 'Resolution:' : 'Size:'),
        select(L.options.map((o) => [o[0], o[1]]), p.preset, (v) => { p.preset = v; updatePreview(); }));
    } else {
      opts.append(h('div', { class: 'row' }, 'Width: ', numberInput(custom.w, { step: 0.1, min: 1, onChange: (v) => { custom.w = v; updatePreview(); } }), ' cm'),
        h('div', { class: 'row' }, 'Height: ', numberInput(custom.h, { step: 0.1, min: 1, onChange: (v) => { custom.h = v; updatePreview(); } }), ' cm'));
    }
    orient.innerHTML = '';
    const dis = !L.orient;
    if (dis) p.orientation = p.layout === 'screen' || p.layout === 'banner' ? 'landscape' : p.orientation;
    const r1 = radio('orient', 'portrait', 'Portrait', p.orientation === 'portrait', (v) => { p.orientation = v; updatePreview(); });
    const r2 = radio('orient', 'landscape', 'Landscape', p.orientation === 'landscape', (v) => { p.orientation = v; updatePreview(); });
    if (dis) { r1.querySelector('input').disabled = true; r2.querySelector('input').disabled = true; }
    orient.append(h('span', { class: 'orient-icon' }, 'A'), r1, r2);
    updatePreview();
  };
  const layoutSel = select(Object.entries(LAYOUTS).map(([k, v]) => [k, v.name]), p.layout, (v) => { p.layout = v; p.preset = null; renderOpts(); });
  renderOpts();
  const body = h('div', { class: 'pagesetup' },
    h('div', { class: 'col' },
      groupBox('Page Layout', layoutSel),
      groupBox('Options', opts, hint),
      groupBox('Orientation', orient)),
    h('div', { class: 'col' }, groupBox('Preview', preview)));
  return openDialog({
    title: 'Page Setup', width: 560, body,
    buttons: [
      { label: 'OK', default: true, onClick: () => ({ ...p, ...pageSize(p.layout, p.preset, p.orientation, custom), custom }) },
      { label: 'Cancel', value: null },
    ],
  });
}

// ---------- Page background ----------
export function pageBackgroundDialog(color) {
  let value = color;
  const sw = h('div', { class: 'bg-current', style: { background: color } });
  const pal = paletteElement(color, {}, (c) => { value = c; sw.style.background = c; });
  return openDialog({
    title: 'Page Background', width: 330,
    body: h('div', {}, h('p', {}, 'Choose a colour for the page:'), pal, h('div', { class: 'row' }, 'Current: ', sw)),
    buttons: [{ label: 'OK', default: true, onClick: () => value }, { label: 'Cancel', value: null }],
  });
}

// ---------- Options (F12) ----------
export function optionsDialog(prefs, grid, initialTab = 0) {
  const p = clone(prefs);
  const g = clone(grid);
  const general = h('div', { class: 'proptab' },
    checkbox('Show startup dialog', p.showStartup, (v) => { p.showStartup = v; }),
    checkbox('Block select when clicking-and-dragging over unselected objects', p.blockSelect, (v) => { p.blockSelect = v; }),
    h('div', { class: 'row' }, numberInput(p.undoLevels, { min: 1, max: 500, onChange: (v) => { p.undoLevels = Math.round(v); } }), ' Undos and redos possible'));
  const editing = h('div', { class: 'proptab' },
    checkbox('Text tool creates and edits label text', p.textToolLabel, (v) => { p.textToolLabel = v; }));
  const drawing = h('div', { class: 'proptab' },
    groupBox('Rotating / Slanting',
      h('div', { class: 'row' }, 'Constraint Angle ', numberInput(p.constraintAngle, { min: 1, max: 90, onChange: (v) => { p.constraintAngle = v; } }), ' degrees'),
      h('p', { class: 'hint' }, 'The constraint angle affects the SHIFT key while rotating, slanting and drawing lines.')),
    checkbox('Display "Finished" button on all drawing tools', p.showFinished, (v) => { p.showFinished = v; }));
  const gridTab = h('div', { class: 'proptab' },
    groupBox('Grid and Snapping',
      checkbox('Snap to grid', g.snap, (v) => { g.snap = v; }),
      h('div', { class: 'row' }, select([['always', 'Always'], ['snapping', 'On When Snapping'], ['never', 'Never']], g.dots, (v) => { g.dots = v; }), ' Grid dots')),
    groupBox('Grid Spacing',
      h('div', { class: 'row' }, numberInput(g.spacing, { min: 0.05, max: 10, step: 0.05, onChange: (v) => { g.spacing = v; } }), ' centimeters between grid points')));
  const t = tabs([
    { title: 'General', content: general },
    { title: 'Editing', content: editing },
    { title: 'Drawing', content: drawing },
    { title: 'Grid/Scaling', content: gridTab },
  ], initialTab);
  return openDialog({
    title: 'Options', width: 520, body: t,
    buttons: [{ label: 'OK', default: true, onClick: () => ({ prefs: p, grid: g }) }, { label: 'Cancel', value: null }],
  });
}

// ---------- Layers ----------
export function layerManagerDialog(doc, { promptName }) {
  const layers = clone(doc.layers);
  let active = doc.activeLayer;
  let current = layers.findIndex((l) => l.id === active);
  const list = h('div', { class: 'layer-list' });
  const render = () => {
    list.innerHTML = '';
    list.append(h('div', { class: 'layer-row head' }, h('span', {}, 'Layer'), h('span', {}, 'Show'), h('span', {}, 'Lock'), h('span', {}, 'Active')));
    layers.forEach((l, i) => {
      const row = h('div', { class: 'layer-row' + (i === current ? ' selected' : ''), onClick: (e) => { if (e.target.tagName !== 'INPUT') { current = i; render(); } } },
        h('span', {}, l.name),
        h('span', {}, h('input', { type: 'checkbox', checked: l.visible, onChange: (e) => { l.visible = e.target.checked; } })),
        h('span', {}, h('input', { type: 'checkbox', checked: l.locked, onChange: (e) => { l.locked = e.target.checked; } })),
        h('span', {}, h('input', { type: 'radio', name: 'activelayer', checked: l.id === active, onChange: () => { active = l.id; } })));
      list.append(row);
    });
  };
  render();
  const buttons = h('div', { class: 'col layer-buttons' },
    h('button', { class: 'btn', onClick: async () => {
      const name = await promptName('Add Layer', `Layer${layers.length + 1}`);
      if (!name) return;
      layers.push({ id: newId('L'), name, visible: true, locked: false });
      current = layers.length - 1; render();
    } }, 'Add…'),
    h('button', { class: 'btn', onClick: async () => {
      const l = layers[current]; if (!l) return;
      const name = await promptName('Rename Layer', l.name);
      if (name) { l.name = name; render(); }
    } }, 'Rename…'),
    h('button', { class: 'btn', onClick: () => {
      if (layers.length <= 1) { alertBox('Layers', 'A drawing needs at least one layer.'); return; }
      const [gone] = layers.splice(current, 1);
      if (active === gone.id) active = layers[0].id;
      current = Math.max(0, current - 1); render();
    } }, 'Delete'),
    h('button', { class: 'btn', onClick: () => { if (current > 0) { [layers[current - 1], layers[current]] = [layers[current], layers[current - 1]]; current--; render(); } } }, 'Move Back'),
    h('button', { class: 'btn', onClick: () => { if (current < layers.length - 1) { [layers[current + 1], layers[current]] = [layers[current], layers[current + 1]]; current++; render(); } } }, 'Move Forward'));
  return openDialog({
    title: 'Layer Manager', width: 470,
    body: h('div', { class: 'row top' }, list, buttons, h('p', { class: 'hint wide' }, 'Layers higher in the list are drawn behind the ones below them. Objects on a deleted layer move to the first layer.')),
    buttons: [{ label: 'OK', default: true, onClick: () => ({ layers, active }) }, { label: 'Cancel', value: null }],
  });
}

export function chooseLayerDialog(doc, title = 'Move to Layer') {
  let value = doc.activeLayer;
  return openDialog({
    title, width: 300,
    body: h('div', {}, h('p', {}, 'Move the selected objects to:'), select(doc.layers.map((l) => [l.id, l.name]), value, (v) => { value = v; })),
    buttons: [{ label: 'OK', default: true, onClick: () => value }, { label: 'Cancel', value: null }],
  });
}

// ---------- Rotate by angle ----------
export function rotateAngleDialog() {
  let v = 45;
  return openDialog({
    title: 'Rotate', width: 300,
    body: h('div', { class: 'row' }, 'Rotate the selection by ', numberInput(v, { min: -360, max: 360, onChange: (x) => { v = x; } }), ' degrees (counter-clockwise is negative).'),
    buttons: [{ label: 'OK', default: true, onClick: () => v }, { label: 'Cancel', value: null }],
  });
}

// ---------- Welcome ----------
const TIPS = [
  'To put words inside a shape, select the shape and just start typing.',
  'Hold down SHIFT while drawing to make perfect squares and circles, or straight lines at neat angles.',
  'Hold down CTRL (or ALT) while dragging an object to leave a copy behind.',
  'Double-click a text object to change its words.',
  'Use Edit > Rotate/Slant (or the second toolbox button) to turn and slant objects. Drag a corner to rotate, a side to slant.',
  'Press F5 to group objects together so they move as one. Shift+F5 takes them apart again.',
  'Press Home to see the whole page. Page Up and Page Down zoom in and out.',
  'The brush button copies the look of one object onto others: select an object, click the brush, then click the objects to paint.',
  'Use File > Export to save your drawing as a picture (PNG) or a PDF to email.',
  'Draw > Align Objects lines things up neatly. With one object selected it aligns to the page.',
];
export function randomTip() { return TIPS[Math.floor(Math.random() * TIPS.length)]; }

const WELCOME_ICONS = {
  wizard: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18.5 3.5l-1.4 1.4M18.5 8.5l-1.4-1.4"/><path d="M3 21l11-11"/><path d="M12.5 8.5l3 3"/></svg>',
  blank: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M12 12v6M9 15h6"/></svg>',
  open: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 7v11a2 2 0 0 0 2 2h13l3-8H7l-3 8"/></svg>',
  learn: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/></svg>',
};

export function welcomeDialog({ recent, showStartup }) {
  let tipIndex = Math.floor(Math.random() * TIPS.length);
  let show = showStartup;
  return openDialog({
    title: 'Welcome', width: 680, className: 'welcome-dialog',
    buttons: [],
    body: (close) => {
      const done = (choice) => close({ choice, showStartup: show });
      const card = (value, title, text) => h('button', { class: `welcome-card card-${value}`, onClick: () => done(value) },
        h('span', { class: 'wc-icon', html: WELCOME_ICONS[value] }),
        h('span', { class: 'wc-title' }, title), h('span', { class: 'wc-text' }, text));
      const recentList = h('div', { class: 'recent-list' });
      if (!recent.length) recentList.append(h('div', { class: 'recent-empty' }, 'Drawings you save will appear here.'));
      for (const p of recent.slice(0, 6)) {
        const name = p.split(/[\\/]/).pop().replace(/\.[bp]draw$/i, '');
        recentList.append(h('button', { class: 'recent-item', title: p, onClick: () => done(`recent:${p}`) },
          h('span', { class: 'ri-dot' }), name));
      }
      const tip = h('div', { class: 'tip-text' }, TIPS[tipIndex]);
      return h('div', { class: 'welcome' },
        h('div', { class: 'welcome-head' }, h('span', { class: 'welcome-logo', html: basilLogo(56) }),
          h('div', {}, h('div', { class: 'welcome-title' }, 'Welcome to Basil Draw'),
            h('div', { class: 'welcome-sub' }, 'What would you like to make today?'))),
        h('div', { class: 'welcome-cards' },
          card('wizard', 'Project Wizard', 'Cards, invitations, signs, certificates and more'),
          card('blank', 'Blank Page', 'Start from scratch'),
          card('open', 'Open File', 'Carry on with a saved drawing'),
          card('learn', 'Learn the Basics', 'A quick guide and the keyboard shortcuts')),
        h('div', { class: 'welcome-bottom' },
          h('div', { class: 'welcome-recent' }, h('div', { class: 'section-title' }, 'Recent drawings'), recentList),
          h('div', { class: 'welcome-tip' }, h('div', { class: 'section-title' }, '💡 Tip of the day'), tip,
            h('button', { class: 'linkbtn', onClick: () => { tipIndex = (tipIndex + 1) % TIPS.length; tip.textContent = TIPS[tipIndex]; } }, 'Next tip →'))),
        h('div', { class: 'welcome-foot' },
          checkbox('Show this window when Basil Draw starts', showStartup, (v) => { show = v; }),
          h('button', { class: 'btn', onClick: () => done('blank') }, 'Close')));
    },
  }).then((r) => r || { choice: 'blank', showStartup: show });
}

// ---------- Blend ----------
export function blendDialog() {
  const o = { steps: 10, colors: true, group: true };
  return openDialog({
    title: 'Blend', width: 360,
    body: h('div', { class: 'col' },
      h('p', { class: 'hint' }, 'Blend creates a series of in-between shapes that gradually change from one selected object into the other — both their outline and their colours.'),
      h('div', { class: 'row' }, 'Number of steps: ', numberInput(o.steps, { min: 1, max: 200, onChange: (v) => { o.steps = Math.max(1, Math.min(200, Math.round(v))); } })),
      checkbox('Blend the colours', true, (v) => { o.colors = v; }),
      checkbox('Group the in-between steps', true, (v) => { o.group = v; })),
    buttons: [{ label: 'Blend', default: true, onClick: () => o }, { label: 'Cancel', value: null }],
  });
}

// ---------- Wizard defaults ----------
export function wizardDefaultsDialog(values) {
  const v = { name: '', company: '', address: '', phone: '', email: '', ...values };
  const field = (key, label, multi = false) => {
    const input = multi ? h('textarea', { rows: 3 }) : h('input', { type: 'text' });
    input.value = v[key] || '';
    input.addEventListener('input', () => { v[key] = input.value; });
    return h('label', { class: 'field' }, h('span', {}, label), input);
  };
  return openDialog({
    title: 'Wizard Defaults', width: 420,
    body: h('div', { class: 'col' },
      h('p', { class: 'hint' }, 'The Project Wizard fills these in for you on business cards, labels and invitations.'),
      field('name', 'Your name'), field('company', 'Company or organisation'), field('address', 'Address', true),
      field('phone', 'Phone'), field('email', 'Email')),
    buttons: [{ label: 'Save', default: true, onClick: () => v }, { label: 'Cancel', value: null }],
  });
}

export function basilLogo(size = 64) {
  const src = size <= 32 ? 'assets/basil-64.png' : 'assets/basil.png';
  return `<img src="${src}" width="${size}" height="${size}" alt="Basil Draw" draggable="false" style="display:block">`;
}

// ---------- About ----------
export function aboutDialog(version) {
  return openDialog({
    title: 'About Basil Draw', width: 400,
    body: h('div', { class: 'about' }, h('div', { html: basilLogo(84) }),
      h('div', {}, h('h2', {}, 'Basil Draw'), h('p', {}, `Version ${version}`),
        h('p', {}, 'A friendly drawing program in the spirit of the classic 1990s Windows drawing apps.'),
        h('p', { class: 'hint' }, 'Made with love for Dad — and named after Basil, the dog.'))),
    buttons: [{ label: 'OK', default: true, value: true }],
  });
}

// ---------- Help ----------
export function helpDialog(shortcuts, initial = 0) {
  const start = h('div', { class: 'help-text' },
    h('h3', {}, 'Getting started'),
    h('ol', {},
      h('li', {}, 'Pick a tool from the toolbox on the left. Tools with a small triangle open a choice of shapes or lines.'),
      h('li', {}, 'Drag on the page to draw. Hold SHIFT for squares, circles and neat angles. Click once to drop a shape of a standard size.'),
      h('li', {}, 'For Polyline, Curve and Polygon tools, click once for each corner, then double-click (or press Enter, or click Finished).'),
      h('li', {}, 'Click Finished (or press Esc) to go back to the arrow, then click an object to select it.'),
      h('li', {}, 'Drag the little squares to resize. Use Edit > Rotate/Slant to turn objects.'),
      h('li', {}, 'Change colours with the colour buttons on the second toolbar, or use Format > Object… (Ctrl+D) to change everything at once.'),
      h('li', {}, 'Select a shape and type to write inside it. Use the "A" tool for text on its own.'),
      h('li', {}, 'Save with Ctrl+S. Export to PNG or PDF from the File menu to share your drawing.')),
    h('h3', {}, 'On a Mac'),
    h('p', {}, 'Where this guide says Ctrl, you can also use ⌘ Command. The F-keys (like F5 for Group) need the fn key held down on most Mac keyboards.'));
  const keys = h('table', { class: 'keys' });
  for (const [k, v] of shortcuts) keys.append(h('tr', {}, h('td', {}, k), h('td', {}, v)));
  const t = tabs([{ title: 'Getting Started', content: start }, { title: 'Keyboard Shortcuts', content: h('div', { class: 'keys-wrap' }, keys) }], initial);
  return openDialog({ title: 'Basil Draw Help', width: 560, body: t, buttons: [{ label: 'Close', default: true, value: true }] });
}

// ---------- Clip art ----------
export function clipArtDialog() {
  let chosen = 0;
  const grid = swatchGrid(CLIPART.map((c) => `<div class="clip-cell">${c.svg.replace('<svg ', '<svg width="64" height="64" ')}<span>${c.name}</span></div>`), 0, 5, (i) => { chosen = i; }, 'clipart');
  grid.addEventListener('dblclick', () => okb.el.click());
  const okb = { label: 'Insert', default: true, onClick: () => CLIPART[chosen] };
  return openDialog({
    title: 'Clip Art', width: 520,
    body: h('div', {}, h('p', {}, 'Choose a picture to insert:'), grid),
    buttons: [okb, { label: 'Cancel', value: null }],
  });
}

export function printSizeInches(page) {
  return { width: page.width / PX_PER_IN, height: page.height / PX_PER_IN };
}
