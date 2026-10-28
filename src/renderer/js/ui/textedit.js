// In-place editing of text objects and shape labels.

import { History } from '../model.js';
import { updateTextMetrics, measureLines, fontCss } from '../render.js';
import { PX_PER_PT } from '../geometry.js';

export class TextEditor {
  constructor(app) {
    this.app = app;
    this.ed = app.editor;
    this.active = null;
    this.ta = document.createElement('textarea');
    this.ta.className = 'text-editor';
    this.ta.spellcheck = false;
    this.ta.addEventListener('input', () => this.layout());
    this.ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.commit(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.commit(); }
      if (e.key === 'Tab') { e.preventDefault(); this.commit(); }
      e.stopPropagation();
    });
    this.ta.addEventListener('blur', () => setTimeout(() => { if (this.active && document.activeElement !== this.ta) this.commit(); }, 0));
  }

  // mode: 'text' (a text object) or 'label' (words inside a shape)
  start(o, mode, { isNew = false, snap = null, initial = null } = {}) {
    if (this.active) this.commit();
    const ed = this.ed;
    this.active = { id: o.id, mode, isNew, snap: snap || History.snapshot(ed.doc) };
    const value = mode === 'text' ? (o.content || '') : (o.label || '');
    this.ta.value = initial != null ? initial : value;
    if (mode === 'text') ed.hiddenIds.add(o.id); else ed.editingLabelId = o.id;
    ed.select(o.id);
    ed.renderNow();
    ed.pasteboard.appendChild(this.ta);
    this.layout();
    this.ta.focus();
    if (initial != null) this.ta.setSelectionRange(this.ta.value.length, this.ta.value.length);
    else this.ta.select();
    this.app.setHint(mode === 'text' ? 'Type your text. Click outside or press Esc when done.' : 'Type the words for this shape. Click outside or press Esc when done.', true);
  }

  object() {
    return this.active ? this.ed.doc.objects.find((x) => x.id === this.active.id) : null;
  }

  layout() {
    const o = this.object();
    if (!o) return;
    const ed = this.ed;
    const t = o.text;
    const z = ed.zoom;
    const ta = this.ta;
    let sy = 1;
    if (o.type === 'text' && o.nh) sy = o.h / o.nh;
    const sizePx = t.size * PX_PER_PT * z * sy;
    ta.style.font = fontCss(t, sizePx);
    ta.style.lineHeight = '1.2';
    ta.style.color = t.color;
    ta.style.textAlign = t.align || 'center';
    ta.style.textDecoration = [t.underline ? 'underline' : '', t.strike ? 'line-through' : ''].join(' ').trim() || 'none';
    const lines = ta.value.split('\n');
    const m = measureLines(lines, t);
    const textW = m.w * z * (o.type === 'text' && o.nw ? o.w / o.nw : 1) + sizePx;
    const textH = Math.max(1, lines.length) * sizePx * 1.2 + 6;
    let left, top, width;
    if (this.active.mode === 'text') {
      const p = ed.pageToBoard({ x: o.x, y: o.y });
      left = p.x - 3; top = p.y - 3;
      width = Math.max(textW + 10, 60);
      ta.style.background = t.bg && t.bg !== 'none' ? t.bg : 'rgba(255,255,255,0.92)';
    } else {
      const p = ed.pageToBoard({ x: o.x, y: o.y });
      width = Math.max(o.w * z, textW + 10, 80);
      left = p.x + (o.w * z - width) / 2;
      top = p.y + (o.h * z - textH) / 2;
      ta.style.background = 'rgba(255,255,255,0.85)';
    }
    ta.style.left = `${left}px`;
    ta.style.top = `${top}px`;
    ta.style.width = `${width}px`;
    ta.style.height = `${textH}px`;
  }

  commit() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    const ed = this.ed;
    const o = ed.doc.objects.find((x) => x.id === a.id);
    const value = this.ta.value.replace(/\s+$/, '');
    this.ta.remove();
    ed.hiddenIds.delete(a.id);
    ed.editingLabelId = null;
    this.app.setHint('', false);
    if (!o) { ed.invalidate(); return; }
    if (a.mode === 'text') {
      if (!value.trim()) {
        // empty text: remove it
        if (!a.isNew) ed.commitSnapshot(a.snap);
        ed.removeObjects([o.id]);
        ed.invalidate();
        return;
      }
      if (value !== o.content || a.isNew) {
        o.content = value;
        updateTextMetrics(o);
        ed.commitSnapshot(a.snap);
      }
    } else if (value !== (o.label || '')) {
      o.label = value;
      ed.commitSnapshot(a.snap);
    }
    ed.invalidate();
    ed.emit('selection');
  }

  cancel() {
    const a = this.active;
    if (!a) return;
    this.ta.value = a.mode === 'text' ? (this.object()?.content || '') : (this.object()?.label || '');
    this.commit();
  }
}
