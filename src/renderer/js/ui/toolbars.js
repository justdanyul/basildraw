// Standard toolbar, format toolbar, toolbox (with flyouts), status bar, layer tabs, rulers.

import { h, showPopup, closeAllPopups } from './dom.js';
import { ICONS, shapeIcon, lineIcon, connectorIcon } from './icons.js';
import { showPalettePopup, swatchGrid } from './widgets.js';
import { GROUPS, SHAPE_INFO, LINE_INFO } from '../shapes.js';
import { LINE_ENDS } from '../render.js';
import { prettyShortcut } from './menus.js';
import { cm, fromCm } from '../geometry.js';

function tbButton(icon, title, onClick, extra = {}) {
  const b = h('button', { class: 'tb', title, 'data-popup-owner': extra.popup ? '1' : undefined, html: icon });
  b.addEventListener('click', (e) => { if (!b.classList.contains('disabled')) onClick(e, b); });
  b.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus where it is
  if (extra.cmd) b.dataset.cmd = extra.cmd;
  return b;
}
const tbSep = () => h('span', { class: 'tbsep' });

// ---------- standard toolbar ----------
export function buildStandardToolbar(el, app) {
  const c = (cmd) => () => app.run(cmd);
  const sc = (s) => (s ? ` (${prettyShortcut(s, app.isMac)})` : '');
  const zoomSel = h('select', { class: 'zoomsel', title: 'Zoom' },
    ...[['page', 'Page'], ['width', 'Width'], ['25', '25%'], ['50', '50%'], ['75', '75%'], ['100', '100%'], ['150', '150%'],
      ['200', '200%'], ['300', '300%'], ['400', '400%']].map(([v, l]) => h('option', { value: v }, l)),
    h('option', { value: 'custom', hidden: true }, ''));
  zoomSel.addEventListener('change', () => { if (zoomSel.value !== 'custom') app.run(`zoom:${zoomSel.value}`); zoomSel.blur(); });
  el.append(
    tbButton(ICONS.new, `New${sc('Ctrl+N')}`, c('new')),
    tbButton(ICONS.wizard, 'New Project (Project Wizard)', c('newProject')),
    tbButton(ICONS.open, `Open${sc('Ctrl+O')}`, c('open')),
    tbButton(ICONS.save, `Save${sc('Ctrl+S')}`, c('save')),
    tbSep(),
    tbButton(ICONS.print, `Print${sc('Ctrl+P')}`, c('print')),
    tbButton(ICONS.preview, 'Print Preview', c('printPreview')),
    tbSep(),
    tbButton(ICONS.cut, `Cut${sc('Ctrl+X')}`, c('cut'), { cmd: 'cut' }),
    tbButton(ICONS.copy, `Copy${sc('Ctrl+C')}`, c('copy'), { cmd: 'copy' }),
    tbButton(ICONS.paste, `Paste${sc('Ctrl+V')}`, c('paste'), { cmd: 'paste' }),
    tbButton(ICONS.brush, 'Copy Style (format painter)', c('painter'), { cmd: 'painter' }),
    tbSep(),
    tbButton(ICONS.undo, `Undo${sc('Ctrl+Z')}`, c('undo'), { cmd: 'undo' }),
    tbButton(ICONS.redo, `Redo${sc('Ctrl+Y')}`, c('redo'), { cmd: 'redo' }),
    tbSep(),
    tbButton(ICONS.props, `Object Properties${sc('Ctrl+D')}`, c('fmtObject')),
    tbButton(ICONS.grid, `Snap to Grid${sc('Ctrl+G')}`, c('snap'), { cmd: 'snap' }),
    tbButton(ICONS.page, 'Page Setup', c('pageSetup')),
    tbSep(),
    tbButton(ICONS.zoom, 'Zoom tool: click to zoom in, Shift-click to zoom out, drag around an area', () => app.setTool(app.editor.tool.name === 'zoom' ? 'select' : 'zoom'), { cmd: 'zoomtool' }),
    zoomSel,
    tbSep(),
    tbButton(ICONS.help, 'Help', c('help')),
  );
  return {
    update() {
      for (const b of el.querySelectorAll('[data-cmd]')) {
        const cmd = b.dataset.cmd;
        if (cmd === 'snap') b.classList.toggle('on', app.commands.checked('snap'));
        else if (cmd === 'zoomtool') b.classList.toggle('on', app.editor.tool.name === 'zoom');
        else if (cmd === 'painter') b.classList.toggle('on', app.editor.tool.name === 'painter');
        else b.classList.toggle('disabled', !app.commands.enabled(cmd));
      }
      const ed = app.editor;
      if (ed.zoomMode) zoomSel.value = ed.zoomMode;
      else {
        const pct = Math.round(ed.zoom * 100);
        const opt = [...zoomSel.options].find((o) => o.value === String(pct));
        if (opt) zoomSel.value = String(pct);
        else { const custom = zoomSel.querySelector('option[value=custom]'); custom.textContent = `${pct}%`; zoomSel.value = 'custom'; }
      }
    },
  };
}

// ---------- format toolbar ----------
const LINE_WIDTHS = [['none', 'No Line'], ['hairline', 'Hairline'], [0.5, '½ pt'], [1, '1 pt'], [2, '2 pt'], [3, '3 pt'], [4, '4 pt'], [6, '6 pt'], [8, '8 pt'], [12, '12 pt']];
const DASHES = [['solid', ''], ['dash', '6 4'], ['dot', '1.5 3'], ['dashdot', '6 3 1.5 3'], ['dashdotdot', '6 3 1.5 3 1.5 3']];

export function buildFormatToolbar(el, app) {
  const ed = app.editor;
  const fontSel = h('select', { class: 'fontsel', title: 'Font' });
  const fillFonts = () => {
    fontSel.innerHTML = '';
    for (const f of app.fonts) fontSel.appendChild(h('option', { value: f, style: { fontFamily: f } }, f));
  };
  fillFonts();
  fontSel.addEventListener('change', () => { ed.applyStyle('text', { font: fontSel.value }); fontSel.blur(); });
  const sizeIn = h('input', { class: 'sizesel', list: 'font-sizes', title: 'Font size', type: 'text', inputmode: 'numeric' });
  const dl = h('datalist', { id: 'font-sizes' }, ...[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96].map((s) => h('option', { value: s })));
  const applySize = () => { const v = parseFloat(sizeIn.value); if (v > 0) ed.applyStyle('text', { size: v }); };
  sizeIn.addEventListener('change', applySize);
  sizeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { applySize(); sizeIn.blur(); } });
  const toggle = (prop) => () => ed.applyStyle('text', { [prop]: !ed.currentStyle().text[prop] });
  const bBold = tbButton(ICONS.bold, 'Bold', toggle('bold'));
  const bItal = tbButton(ICONS.italic, 'Italic', toggle('italic'));
  const bUnd = tbButton(ICONS.underline, 'Underline', toggle('underline'));

  const popupList = (anchor, rows) => {
    const menu = h('div', { class: 'menu' });
    for (const r of rows) {
      const row = h('div', { class: 'menuitem' + (r.checked ? ' checked' : '') }, h('span', { class: 'mi-check' }, r.checked ? '✓' : ''),
        r.html ? h('span', { class: 'mi-label', html: r.html }) : h('span', { class: 'mi-label' }, r.label));
      row.addEventListener('click', () => { closeAllPopups(); r.onClick(); });
      menu.appendChild(row);
    }
    showPopup(menu, anchor.getBoundingClientRect());
  };

  const bJust = tbButton(ICONS.justify, 'Justification', (e, b) => {
    const cur = ed.currentStyle().text.align;
    popupList(b, [['left', 'Left', ICONS.justifyLeft], ['center', 'Center', ICONS.justifyCenter], ['right', 'Right', ICONS.justifyRight]].map(([v, l, ic]) => ({
      html: `${ic} ${l}`, checked: cur === v, onClick: () => ed.applyStyle('text', { align: v }),
    })));
  }, { popup: true });
  const bLabel = tbButton(ICONS.labelpos, 'Label Position (where words go on a shape)', (e, b) => {
    const cur = ed.currentStyle().text.labelPos || 'center';
    popupList(b, ['center', 'top', 'bottom', 'left', 'right', 'above', 'below'].map((v) => ({
      label: v[0].toUpperCase() + v.slice(1), checked: cur === v, onClick: () => ed.applyStyle('text', { labelPos: v }),
    })));
  }, { popup: true });

  const bTextColor = tbButton(ICONS.textcolor, 'Text Color', (e, b) => {
    showPalettePopup(b, ed.currentStyle().text.color, {}, (c) => ed.applyStyle('text', { color: c }));
  }, { popup: true });
  const bFillColor = tbButton(ICONS.fillcolor, 'Fill Color', (e, b) => {
    const f = ed.currentStyle().fill;
    showPalettePopup(b, f.style === 'solid' ? f.color : null, { allowNone: true, noneLabel: 'No Fill' }, (c) => {
      if (c === 'none') ed.applyStyle('fill', { style: 'none' });
      else ed.applyStyle('fill', { style: 'solid', color: c });
    });
  }, { popup: true });
  const bShadow = tbButton(ICONS.shadow, 'Shadow', (e, b) => {
    const s = ed.currentStyle().shadow;
    const menu = h('div', { class: 'menu shadow-menu' });
    for (const [v, l] of [['none', 'No Shadow'], ['simple', 'Simple'], ['block', 'Block'], ['soft', 'Soft']]) {
      const row = h('div', { class: 'menuitem' }, h('span', { class: 'mi-check' }, s.style === v ? '✓' : ''), h('span', { class: `sh-icon sh-${v}` }), h('span', { class: 'mi-label' }, l));
      row.addEventListener('click', () => { closeAllPopups(); ed.applyStyle('shadow', { style: v }); });
      menu.appendChild(row);
    }
    const colorRow = h('div', { class: 'menuitem' }, h('span', { class: 'mi-check' }), h('span', { class: 'mi-label' }, 'Shadow Color…'));
    colorRow.addEventListener('click', () => {
      closeAllPopups();
      showPalettePopup(b, s.color, {}, (c) => ed.applyStyle('shadow', { color: c, style: s.style === 'none' ? 'simple' : s.style }));
    });
    menu.append(h('div', { class: 'menusep' }), colorRow);
    showPopup(menu, b.getBoundingClientRect());
  }, { popup: true });
  const bLineColor = tbButton(ICONS.linecolor, 'Line Color', (e, b) => {
    const l = ed.currentStyle().line;
    showPalettePopup(b, l.color, { allowNone: true, noneLabel: 'No Line' }, (c) => {
      if (c === 'none') ed.applyStyle('line', { style: 'none' });
      else ed.applyStyle('line', { color: c, style: l.style === 'none' ? 'hairline' : l.style });
    });
  }, { popup: true });
  const bWidth = tbButton(ICONS.linewidth, 'Line Thickness', (e, b) => {
    const l = ed.currentStyle().line;
    popupList(b, LINE_WIDTHS.map(([v, label]) => {
      const sw = typeof v === 'number' ? Math.max(1, v * 1.33) : v === 'hairline' ? 1 : 0;
      const checked = (v === 'none' && l.style === 'none') || (v === 'hairline' && l.style === 'hairline') || (l.style === 'wide' && l.width === v);
      return {
        html: `<svg width="60" height="12"><path d="M2 6H58" stroke="#000" stroke-width="${sw}"/></svg> ${label}`,
        checked,
        onClick: () => ed.applyStyle('line', typeof v === 'number' ? { style: 'wide', width: v } : { style: v }),
      };
    }));
  }, { popup: true });
  const bStyle = tbButton(ICONS.linestyle, 'Line Style', (e, b) => {
    const l = ed.currentStyle().line;
    popupList(b, DASHES.map(([v, da]) => ({
      html: `<svg width="90" height="12"><path d="M2 6H88" stroke="#000" stroke-width="2"${da ? ` stroke-dasharray="${da}"` : ''}/></svg>`,
      checked: (l.dash || 'solid') === v,
      onClick: () => ed.applyStyle('line', { dash: v, style: l.style === 'none' ? 'hairline' : l.style }),
    })));
  }, { popup: true });
  const bEnds = tbButton(ICONS.lineends, 'Line Ends (arrowheads)', (e, b) => {
    const en = ed.currentStyle().ends;
    const wrap = h('div', { class: 'ends-popup' });
    const mk = (dir) => LINE_ENDS.map((ge, i) => {
      if (!ge) return `<svg width="40" height="16"><path d="M4 8H36" stroke="#000" stroke-width="1.3"/></svg>`;
      const s = 1.1;
      const body = ge.body.replace(/\{c\}/g, '#000');
      return dir === 'end'
        ? `<svg width="40" height="16"><path d="M4 8H32" stroke="#000" stroke-width="1.3"/><g transform="translate(${32 - ge.refX * s} ${8 - 5 * s}) scale(${s})">${body}</g></svg>`
        : `<svg width="40" height="16"><path d="M8 8H36" stroke="#000" stroke-width="1.3"/><g transform="translate(${8 + ge.refX * s} ${8 - 5 * s}) scale(${-s} ${s})">${body}</g></svg>`;
    });
    wrap.append(
      h('div', { class: 'ends-title' }, 'Start'), swatchGrid(mk('start'), en.start, 5, (i) => { closeAllPopups(); ed.applyStyle('ends', { start: i }); }),
      h('div', { class: 'ends-title' }, 'End'), swatchGrid(mk('end'), en.end, 5, (i) => { closeAllPopups(); ed.applyStyle('ends', { end: i }); }),
    );
    showPopup(wrap, b.getBoundingClientRect());
  }, { popup: true });

  el.append(fontSel, sizeIn, dl, tbSep(), bBold, bItal, bUnd, tbSep(), bJust, bLabel, tbSep(),
    bTextColor, bFillColor, bShadow, bLineColor, tbSep(), bWidth, bStyle, bEnds);

  return {
    refreshFonts: fillFonts,
    update() {
      const t = ed.currentStyle().text;
      if (document.activeElement !== fontSel) {
        if (![...fontSel.options].some((o) => o.value === t.font)) fontSel.appendChild(h('option', { value: t.font }, t.font));
        fontSel.value = t.font;
      }
      if (document.activeElement !== sizeIn) sizeIn.value = t.size;
      const st = ed.currentStyle();
      const fillC = st.fill.style === 'none' ? 'transparent' : st.fill.style === 'solid' ? st.fill.color : st.fill.style === 'pattern' ? st.fill.bg : st.fill.end;
      bTextColor.style.setProperty('--swatch', t.color);
      bFillColor.style.setProperty('--swatch', fillC);
      bShadow.style.setProperty('--swatch', st.shadow.style === 'none' ? 'transparent' : st.shadow.color);
      bLineColor.style.setProperty('--swatch', st.line.style === 'none' ? 'transparent' : st.line.color);
      bBold.classList.toggle('on', !!t.bold);
      bItal.classList.toggle('on', !!t.italic);
      bUnd.classList.toggle('on', !!t.underline);
      const icon = { left: ICONS.justifyLeft, center: ICONS.justifyCenter, right: ICONS.justifyRight }[t.align] || ICONS.justify;
      if (bJust.dataset.icon !== t.align) { bJust.innerHTML = icon; bJust.dataset.icon = t.align; }
    },
  };
}

// ---------- toolbox ----------
const FLYOUTS = {
  lines: { tool: 'line', kinds: GROUPS.lines, icon: lineIcon, cols: 3, title: 'Lines' },
  connector: { tool: 'connector', kinds: GROUPS.lines, icon: connectorIcon, cols: 3, title: 'Connector Lines' },
  shapes: { tool: 'shape', kinds: GROUPS.shapes, icon: shapeIcon, cols: 4, title: 'Shapes' },
  cool: { tool: 'shape', kinds: GROUPS.cool, icon: shapeIcon, cols: 4, title: 'CoolShapes' },
  borders: { tool: 'shape', kinds: GROUPS.borders, icon: shapeIcon, cols: 2, title: 'Borders' },
  arrows: { tool: 'shape', kinds: GROUPS.arrows, icon: shapeIcon, cols: 4, title: 'ArrowShapes' },
};

export function buildToolbox(el, app) {
  const ed = app.editor;
  const current = { lines: 'straight', connector: 'straight', shapes: 'rect', cool: 'star', borders: 'borderframe', arrows: 'arrow1' };
  const buttons = [];
  const simple = (name, icon, title, onClick) => {
    const b = h('button', { class: 'tool', title, html: icon });
    b.addEventListener('click', onClick);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.dataset.tool = name;
    buttons.push(b);
    return b;
  };
  const flyBtn = (group) => {
    const F = FLYOUTS[group];
    const b = h('button', { class: 'tool fly', title: F.title, 'data-popup-owner': '1' });
    b.dataset.group = group;
    const setFace = () => { b.innerHTML = F.icon(current[group]) + '<span class="fly-tri"></span>'; };
    setFace();
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      const grid = h('div', { class: 'flyout', style: { gridTemplateColumns: `repeat(${F.cols}, 26px)` } });
      for (const k of F.kinds) {
        const name = F.tool === 'shape' ? SHAPE_INFO[k].name : LINE_INFO[k].name;
        const cell = h('button', { class: 'tool' + (k === current[group] ? ' on' : ''), title: name, html: F.icon(k) });
        cell.addEventListener('click', () => {
          current[group] = k;
          setFace();
          closeAllPopups();
          app.setTool(F.tool, k);
        });
        grid.appendChild(cell);
      }
      const r = b.getBoundingClientRect();
      showPopup(grid, { left: r.right, right: r.right, top: r.top + 3, bottom: r.bottom }, { side: 'right' });
    });
    b.setFace = setFace;
    buttons.push(b);
    return b;
  };
  el.append(
    simple('select', ICONS.select, 'Select (Esc)', () => app.setTool('select')),
    simple('rotate', ICONS.rotate, 'Rotate/Slant', () => app.setTool('rotate')),
    simple('points', ICONS.points, 'Edit Points (move the corners of lines and polygons)', () => app.setTool('points')),
    h('div', { class: 'toolsep' }),
    simple('text', ICONS.text, 'Text', () => app.setTool('text')),
    simple('clipart', ICONS.clipart, 'Clip Art', () => app.run('clipArt')),
    simple('picture', ICONS.picture, 'Picture', () => app.run('insertPicture')),
    flyBtn('lines'), flyBtn('connector'), flyBtn('shapes'), flyBtn('cool'), flyBtn('borders'), flyBtn('arrows'),
  );
  return {
    update() {
      const t = ed.tool;
      for (const b of buttons) {
        let on = false;
        if (b.dataset.tool) on = b.dataset.tool === t.name;
        else {
          const group = b.dataset.group;
          const F = FLYOUTS[group];
          on = F.tool === t.name && F.kinds.includes(t.kind);
          // A tool picked from the Insert menu also changes the button's face.
          if (on && current[group] !== t.kind) { current[group] = t.kind; b.setFace(); }
        }
        b.classList.toggle('on', on);
      }
    },
  };
}

// ---------- status bar ----------
export function buildStatusBar(el, app) {
  const hint = h('div', { class: 'sb hint' });
  const swatch = h('div', { class: 'sb swatches' });
  const type = h('div', { class: 'sb type' });
  const pos = h('div', { class: 'sb pos' });
  const size = h('div', { class: 'sb size' });
  el.append(hint, swatch, type, pos, size);
  return {
    setHint(t) { hint.textContent = t; },
    update() {
      const ed = app.editor;
      const info = ed.statusInfo();
      type.textContent = info.type;
      pos.textContent = info.pos ? `⌖ ${info.pos}` : '';
      size.textContent = info.size ? `⬚ ${info.size}` : '';
      const st = ed.currentStyle();
      const fill = st.fill.style === 'none' ? 'transparent' : st.fill.style === 'solid' ? st.fill.color : st.fill.style === 'pattern' ? st.fill.bg : st.fill.end;
      const line = st.line.style === 'none' ? 'transparent' : st.line.color;
      swatch.innerHTML = `<svg width="44" height="14"><path d="M2 7H18" stroke="${line}" stroke-width="2"/><rect x="24" y="1.5" width="18" height="11" fill="${fill}" stroke="#9aa0aa" rx="2"/></svg>`;
      if (!app.hintLocked) hint.textContent = toolHint(ed);
    },
  };
}

function toolHint(ed) {
  const t = ed.tool;
  switch (t.name) {
    case 'select': return 'Select';
    case 'rotate': return 'Rotate/Slant: drag a corner to rotate, a side to slant';
    case 'points': return 'Edit Points: drag a point to move it';
    case 'text': return 'Text: click where the words should go';
    case 'zoom': return 'Zoom: click to zoom in, Shift-click to zoom out';
    case 'painter': return 'Copy Style: click objects to paint them';
    case 'line': case 'connector': return LINE_INFO[t.kind]?.name || 'Line';
    case 'shape': return SHAPE_INFO[t.kind]?.name || 'Shape';
    default: return '';
  }
}

// ---------- layer tabs ----------
export function buildLayerTabs(el, app) {
  return {
    update() {
      const ed = app.editor;
      el.innerHTML = '';
      for (const l of ed.doc.layers) {
        const tab = h('button', { class: 'ltab' + (l.id === ed.doc.activeLayer ? ' active' : '') + (l.visible ? '' : ' hidden-layer'), title: `${l.name}${l.locked ? ' (locked)' : ''}${l.visible ? '' : ' (hidden)'} — double-click to manage layers` }, l.name);
        tab.addEventListener('click', () => app.run(`setLayer:${l.id}`));
        tab.addEventListener('dblclick', () => app.run('layerManager'));
        el.appendChild(tab);
      }
      const add = h('button', { class: 'ltab add', title: 'Add Layer' }, '+');
      add.addEventListener('click', () => app.run('addLayer'));
      el.appendChild(add);
    },
  };
}

// ---------- rulers ----------
export function buildRulers(hEl, vEl, app) {
  const hc = h('canvas'), vc = h('canvas');
  hEl.appendChild(hc); vEl.appendChild(vc);
  const draw = () => {
    const ed = app.editor;
    if (!ed.prefs.rulers) return;
    const dpr = window.devicePixelRatio || 1;
    const svgR = ed.svg.getBoundingClientRect();
    for (const [cv, horiz] of [[hc, true], [vc, false]]) {
      const box = cv.parentElement.getBoundingClientRect();
      cv.width = box.width * dpr; cv.height = box.height * dpr;
      cv.style.width = `${box.width}px`; cv.style.height = `${box.height}px`;
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, box.width, box.height);
      ctx.strokeStyle = '#a9aeb8'; ctx.fillStyle = '#6b7280'; ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
      const len = horiz ? box.width : box.height;
      const origin = horiz ? svgR.left - box.left + ed.margin * ed.zoom : svgR.top - box.top + ed.margin * ed.zoom;
      const pxPerCm = fromCm(1) * ed.zoom;
      let step = 1;
      while (pxPerCm * step < 40) step *= 2;
      const minor = pxPerCm * step >= 80 ? step / 10 : step / 2;
      const startCm = Math.floor((-origin / pxPerCm) / minor) * minor;
      ctx.beginPath();
      for (let c = startCm; (origin + c * pxPerCm) < len; c += minor) {
        const p = Math.round(origin + c * pxPerCm) + 0.5;
        const major = Math.abs(c / step - Math.round(c / step)) < 1e-6;
        const tick = major ? 10 : 4;
        if (horiz) { ctx.moveTo(p, box.height); ctx.lineTo(p, box.height - tick); } else { ctx.moveTo(box.width, p); ctx.lineTo(box.width - tick, p); }
        if (major) {
          const label = String(Math.round(c * 10) / 10);
          if (horiz) ctx.fillText(label, p + 2, 9);
          else { ctx.save(); ctx.translate(9, p + 2); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore(); }
        }
      }
      ctx.stroke();
      const cur = ed.cursor;
      if (cur) {
        ctx.strokeStyle = '#3b5bdb';
        ctx.beginPath();
        const p = Math.round(origin + cm(horiz ? cur.x : cur.y) * pxPerCm) + 0.5;
        if (horiz) { ctx.moveTo(p, 0); ctx.lineTo(p, box.height); } else { ctx.moveTo(0, p); ctx.lineTo(box.width, p); }
        ctx.stroke();
      }
    }
  };
  return { update: draw };
}
