// The Project Wizard: choose a project, pick a style, type the words — done.

import { h } from './dom.js';
import { openDialog } from './widgets.js';
import { projectTypes, THEMES, buildProject } from '../projects.js';
import { renderPageSVG } from '../render.js';

function thumb(doc, maxW, maxH) {
  const { width, height } = doc.page;
  const k = Math.min(maxW / width, maxH / height);
  const svg = renderPageSVG(doc, doc.objects, { width: Math.round(width * k), height: Math.round(height * k) });
  return h('div', { class: 'wiz-thumb', html: svg });
}

export function projectWizard(app) {
  const fonts = app.fonts;
  const defaults = app.editor.prefs.wizard || {};
  const types = projectTypes(defaults);
  const state = { step: 0, type: 'greeting', theme: 'bright', values: {} };

  return openDialog({
    title: 'Project Wizard', width: 820, className: 'wizard-dialog', buttons: [],
    body: (close) => {
      const steps = ['Choose a project', 'Pick a style', 'Add your words'];
      const stepper = h('div', { class: 'wiz-steps' });
      const main = h('div', { class: 'wiz-main' });
      const back = h('button', { class: 'btn', onClick: () => go(state.step - 1) }, 'Back');
      const next = h('button', { class: 'btn primary', onClick: () => (state.step < 2 ? go(state.step + 1) : finish()) }, 'Next');
      const cancel = h('button', { class: 'btn', onClick: () => close(null) }, 'Cancel');
      const foot = h('div', { class: 'wiz-foot' }, cancel, h('span', { class: 'spacer' }), back, next);

      const build = (typeId = state.type, themeId = state.theme, values = state.values) =>
        buildProject(typeId, themeId, values, fonts, defaults);
      const finish = () => close(build());

      const renderStepper = () => {
        stepper.innerHTML = '';
        steps.forEach((s, i) => {
          stepper.append(h('div', { class: 'wiz-step' + (i === state.step ? ' active' : i < state.step ? ' done' : '') },
            h('span', { class: 'wiz-num' }, i < state.step ? '✓' : String(i + 1)), h('span', {}, s)));
        });
      };

      const stepType = () => {
        const grid = h('div', { class: 'wiz-grid types' });
        for (const [id, t] of Object.entries(types)) {
          const card = h('button', { class: 'wiz-card' + (id === state.type ? ' selected' : ''), onClick: () => {
            if (state.type !== id) state.values = {};
            state.type = id;
            grid.querySelectorAll('.wiz-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
          } },
          thumb(build(id, 'classic', {}), 150, 92), h('span', { class: 'wc-title' }, t.name), h('span', { class: 'wc-text' }, t.desc));
          card.addEventListener('dblclick', () => go(1));
          grid.append(card);
        }
        return grid;
      };

      const stepTheme = () => {
        const grid = h('div', { class: 'wiz-grid themes' });
        for (const th of THEMES) {
          const card = h('button', { class: 'wiz-card' + (th.id === state.theme ? ' selected' : ''), onClick: () => {
            state.theme = th.id;
            grid.querySelectorAll('.wiz-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
          } },
          thumb(build(state.type, th.id), 150, 160),
          h('span', { class: 'wc-title' }, th.name),
          h('span', { class: 'wiz-swatches' }, ...[th.primary, th.secondary, th.accent].map((c) => h('span', { style: { background: c } }))));
          card.addEventListener('dblclick', () => go(2));
          grid.append(card);
        }
        return grid;
      };

      const stepWords = () => {
        const t = types[state.type];
        const preview = h('div', { class: 'wiz-preview' });
        let timer = null;
        const refresh = () => { preview.innerHTML = ''; preview.append(thumb(build(), 330, 330)); };
        const form = h('div', { class: 'wiz-form' });
        for (const [key, label, def, multi] of t.fields) {
          if (state.values[key] == null) state.values[key] = def;
          const input = multi ? h('textarea', { rows: 3 }) : h('input', { type: 'text' });
          input.value = state.values[key];
          input.addEventListener('input', () => {
            state.values[key] = input.value;
            clearTimeout(timer);
            timer = setTimeout(refresh, 150);
          });
          form.append(h('label', { class: 'field' }, h('span', {}, label), input));
        }
        form.append(h('p', { class: 'hint' }, 'You can change everything afterwards — this just gets you started.'));
        refresh();
        return h('div', { class: 'wiz-words' }, form, preview);
      };

      const go = (i) => {
        state.step = Math.max(0, Math.min(2, i));
        renderStepper();
        main.innerHTML = '';
        main.append([stepType, stepTheme, stepWords][state.step]());
        back.disabled = state.step === 0;
        next.textContent = state.step === 2 ? 'Create' : 'Next';
        const first = main.querySelector('input');
        if (first) setTimeout(() => first.focus(), 0);
      };
      go(0);
      return h('div', { class: 'wizard' }, stepper, main, foot);
    },
  });
}
