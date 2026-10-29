// Document model: defaults, object creation, undo history, (de)serialisation.

import { fromCm } from './geometry.js';
import { PALETTE } from './palette.js';

let idCounter = 1;
export function newId(prefix = 'o') {
  return `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;
}

export const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function defaultStyle() {
  return {
    fill: { style: 'solid', color: '#ffffff', pattern: 0, fg: '#ffffff', bg: PALETTE[5][7].color,
      gradient: 0, start: '#ffffff', end: PALETTE[5][7].color },
    line: { style: 'hairline', width: 1, dash: 'solid', color: '#000000' },
    ends: { start: 0, end: 0, size: 'medium' },
    shadow: { style: 'none', color: '#808080' },
    text: { font: 'Times New Roman', size: 24, bold: false, italic: false, underline: false,
      strike: false, color: '#000000', bg: 'none', align: 'center', labelPos: 'center' },
  };
}

export const SCREEN_SIZES = ['640x480', '800x600', '1024x768', '1280x720', '1280x1024', '1920x1080'];

export function newDocument() {
  const layerId = newId('L');
  return {
    format: 'basil-draw',
    version: 1,
    page: { layout: 'screen', preset: '800x600', width: 800, height: 600, orientation: 'landscape', background: '#ffffff' },
    grid: { snap: true, spacing: 0.5, dots: 'snapping' },
    layers: [{ id: layerId, name: 'Layer1', visible: true, locked: false }],
    activeLayer: layerId,
    editAllLayers: false,
    objects: [],
    defaults: defaultStyle(),
    images: {},
  };
}

export function createObject(doc, type, props = {}) {
  const d = doc.defaults;
  const o = {
    id: newId(),
    type,
    kind: props.kind || type,
    layer: doc.activeLayer,
    name: '',
    x: 0, y: 0, w: 0, h: 0,
    rot: 0, skx: 0, sky: 0, fh: false, fv: false,
    fill: clone(d.fill),
    line: clone(d.line),
    ends: clone(d.ends),
    shadow: clone(d.shadow),
    text: clone(d.text),
    label: '',
    ...props,
  };
  return o;
}

export function findObject(doc, id) {
  return doc.objects.find((o) => o.id === id);
}

export function layerOf(doc, id) {
  return doc.layers.find((l) => l.id === id);
}

// Objects in paint order: layer by layer (first layer at the back), then array order.
export function paintOrder(doc) {
  const out = [];
  for (const layer of doc.layers) {
    for (const o of doc.objects) if (o.layer === layer.id) out.push(o);
  }
  // Orphans (layer deleted) — keep them visible on top.
  for (const o of doc.objects) if (!doc.layers.some((l) => l.id === o.layer)) out.push(o);
  return out;
}

export function typeName(o) {
  const map = {
    rect: 'Rectangle', square: 'Square', ellipse: 'Ellipse', circle: 'Circle', roundrect: 'Rounded Rectangle',
    roundsquare: 'Rounded Square', polygon: 'Polygon', smoothpolygon: 'Smoothed Polygon',
    straight: 'Line', polyline: 'Polyline', rightangle: 'Right-Angle Line', arc: 'Arc', curve: 'Curve',
    freehand: 'Freehand Line',
  };
  if (o.type === 'text') return 'Text';
  if (o.type === 'image') return 'Picture';
  if (o.type === 'group') return 'Group';
  if (o.type === 'path') return 'Curve Object';
  return map[o.kind] || (o.kind || o.type).replace(/_3d$/, ' 3D').replace(/^./, (c) => c.toUpperCase());
}

// ---------- undo ----------
export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }
  static snapshot(doc) {
    const { images, ...rest } = doc;
    return JSON.stringify(rest);
  }
  record(doc) {
    this.undoStack.push(History.snapshot(doc));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undo(doc) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(History.snapshot(doc));
    return this.restore(doc, this.undoStack.pop());
  }
  redo(doc) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(History.snapshot(doc));
    return this.restore(doc, this.redoStack.pop());
  }
  restore(doc, snap) {
    const data = JSON.parse(snap);
    data.images = doc.images;
    return data;
  }
  clear() { this.undoStack = []; this.redoStack = []; }
}

// ---------- serialisation ----------
export function usedImageIds(objects, set = new Set()) {
  for (const o of objects) {
    if (o.type === 'image' && o.imageId) set.add(o.imageId);
    if (o.type === 'group') usedImageIds(o.children, set);
  }
  return set;
}

export function serialize(doc, objects = null) {
  const objs = objects || doc.objects;
  const used = usedImageIds(objs);
  const images = {};
  for (const id of used) if (doc.images[id]) images[id] = doc.images[id];
  const out = { ...doc, objects: objs, images };
  return JSON.stringify(out, null, 1);
}

export function deserialize(text) {
  const data = JSON.parse(text);
  if (data.format !== 'basil-draw' && data.format !== 'penguin-draw') throw new Error('This is not a Basil Draw drawing.');
  const base = newDocument();
  const doc = { ...base, ...data };
  doc.page = { ...base.page, ...(data.page || {}) };
  doc.grid = { ...base.grid, ...(data.grid || {}) };
  doc.defaults = { ...base.defaults, ...(data.defaults || {}) };
  doc.images = data.images || {};
  if (!doc.layers || !doc.layers.length) doc.layers = base.layers;
  if (!doc.layers.some((l) => l.id === doc.activeLayer)) doc.activeLayer = doc.layers[0].id;
  return doc;
}

export const PAGE_CM = (doc) => ({ w: doc.page.width / fromCm(1), h: doc.page.height / fromCm(1) });
