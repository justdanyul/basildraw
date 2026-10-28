// Basil Draw's own line icons (24x24, drawn with the current text colour).
import { shapeGeometry, linePath } from '../shapes.js';

const ic = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${inner}</svg>`;
// a colour bar under an icon, coloured by the --swatch CSS variable
const bar = '<rect x="3" y="20" width="18" height="3.2" rx="1" stroke="none" style="fill:var(--swatch,#1f2937)"/>';

export const ICONS = {
  new: ic('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/>'),
  wizard: ic('<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18.5 3.5l-1.4 1.4M18.5 8.5l-1.4-1.4"/><path d="M3 21l11-11"/><path d="M12.5 8.5l3 3"/>'),
  open: ic('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 7v11a2 2 0 0 0 2 2h13l3-8H7l-3 8"/>'),
  save: ic('<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8"/><rect x="7" y="13" width="10" height="8" rx="1"/>'),
  print: ic('<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>'),
  preview: ic('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  cut: ic('<circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.1 16L19 4M15.9 16L5 4"/>'),
  copy: ic('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  paste: ic('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M9 11h6M9 15h4"/>'),
  brush: ic('<path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9.2 12z"/><path d="M9 12c-2.5 0-4 1.6-4 4 0 2-1.4 3.4-3 4 4.5 1 10-.6 10-5.2z"/>'),
  undo: ic('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: ic('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  props: ic('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  grid: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
  page: ic('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>'),
  zoom: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>'),
  help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>'),
  bold: ic('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>', ' stroke-width="2.2"'),
  italic: ic('<path d="M10 5h8M6 19h8M14 5l-4 14"/>'),
  underline: ic('<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>'),
  justify: ic('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  justifyLeft: ic('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  justifyCenter: ic('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  justifyRight: ic('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  labelpos: ic('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M9 15l3-6 3 6M10 13h4"/>'),
  textcolor: ic(`<path d="M7 16L12 4l5 12M8.8 12h6.4"/>${bar}`),
  fillcolor: ic(`<path d="M5 11l6-6 7 7-6 6z"/><path d="M5 11h13"/><path d="M20 14.5c.8 1.2 1.2 2 1.2 2.6a1.2 1.2 0 0 1-2.4 0c0-.6.4-1.4 1.2-2.6z"/>${bar}`),
  shadow: ic(`<rect x="3" y="3" width="12" height="12" rx="2"/><path d="M18 7h1a2 2 0 0 1 2 2v6M7 18v.5a.5.5 0 0 0 .5.5H15"/>${bar}`),
  linecolor: ic(`<path d="M15.5 4.5l3 3L9 17H6v-3z"/>${bar}`),
  linewidth: ic('<path d="M4 6h16" stroke-width="1.2"/><path d="M4 12h16" stroke-width="2.4"/><path d="M4 18.5h16" stroke-width="4"/>'),
  linestyle: ic('<path d="M4 6h16"/><path d="M4 12h3M10 12h4M17 12h3"/><path d="M4 18h.01M8 18h.01M12 18h.01M16 18h.01M20 18h.01" stroke-width="2.4"/>'),
  lineends: ic('<path d="M3 7h15M15 4l3 3-3 3"/><path d="M21 17H6M9 14l-3 3 3 3"/>'),
  blend: ic('<circle cx="7" cy="12" r="4"/><circle cx="12" cy="12" r="5" stroke-dasharray="2 2"/><rect x="15" y="6" width="7" height="12" rx="1"/>'),
  // toolbox
  select: ic('<path d="M5 3l14 7.5-6.3 1.8L9.9 19z"/>'),
  rotate: ic('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>'),
  points: ic('<path d="M5 19L9 6l10 5-6 8z"/><rect x="3.5" y="17.5" width="3" height="3" fill="currentColor"/><rect x="7.5" y="4.5" width="3" height="3" fill="currentColor"/><rect x="17.5" y="9.5" width="3" height="3" fill="currentColor"/><rect x="11.5" y="17.5" width="3" height="3" fill="currentColor"/>'),
  text: ic('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  clipart: ic('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>'),
  picture: ic('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
};

// Icon for a shape kind, generated from the real shape geometry.
export function shapeIcon(kind) {
  const o = { kind, w: 18, h: 14, type: 'shape' };
  if (['square', 'circle', 'roundsquare'].includes(kind)) { o.w = 15; o.h = 15; }
  if (kind === 'borderline') o.h = 7;
  if (['star', 'starburst', 'megagon', 'curveygon', 'pentagon', 'hexagon', 'cube', 'cylinder', 'cone', 'pyramid', 'prism', 'arrow4way'].includes(kind)) { o.w = 17; o.h = 17; }
  if (kind === 'polygon' || kind === 'smoothpolygon') {
    o.points = [{ x: 1, y: 13 }, { x: 5, y: 1 }, { x: 17, y: 4 }, { x: 10, y: 8 }, { x: 15, y: 14 }];
  }
  const g = shapeGeometry(o);
  const ox = (24 - o.w) / 2, oy = (24 - o.h) / 2;
  let inner = '';
  for (const p of g.pre || []) inner += `<path d="${p.d}"${p.transform ? ` transform="${p.transform}"` : ''} fill="currentColor" fill-opacity=".25" stroke-width="1.2"/>`;
  inner += `<path d="${g.main}"${g.mainTransform ? ` transform="${g.mainTransform}"` : ''} fill="currentColor" fill-opacity=".08" stroke-width="1.4"${g.evenodd ? ' fill-rule="evenodd"' : ''}/>`;
  for (const p of g.post || []) inner += `<path d="${p.d}" fill="currentColor" fill-opacity="${p.shade > 0 ? 0.05 : 0.3}" stroke-width="1.2"/>`;
  for (const e of g.edges || []) inner += `<path d="${e}" stroke-width="1.2"/>`;
  return ic(`<g transform="translate(${ox} ${oy})">${inner}</g>`);
}

const LINE_PRESETS = {
  straight: [{ x: 4, y: 4 }, { x: 20, y: 20 }],
  polyline: [{ x: 3, y: 18 }, { x: 8, y: 5 }, { x: 14, y: 17 }, { x: 21, y: 5 }],
  rightangle: [{ x: 4, y: 5 }, { x: 20, y: 19 }],
  arc: [{ x: 4, y: 19 }, { x: 20, y: 5 }],
  curve: [{ x: 3, y: 16 }, { x: 8, y: 6 }, { x: 14, y: 17 }, { x: 21, y: 7 }],
  freehand: [{ x: 3, y: 17 }, { x: 7, y: 13 }, { x: 6, y: 7 }, { x: 11, y: 4 }, { x: 15, y: 8 }, { x: 11, y: 13 }, { x: 21, y: 18 }],
};

export function lineIcon(kind) {
  return ic(`<path d="${linePath({ kind, points: LINE_PRESETS[kind] })}"/>`);
}

export function connectorIcon(kind) {
  const pts = LINE_PRESETS[kind];
  const a = pts[0], b = pts[pts.length - 1];
  return ic(`<path d="${linePath({ kind, points: pts })}"/>` +
    `<rect x="${a.x - 2}" y="${a.y - 2}" width="4" height="4" fill="currentColor"/><rect x="${b.x - 2}" y="${b.y - 2}" width="4" height="4" fill="currentColor"/>`);
}
