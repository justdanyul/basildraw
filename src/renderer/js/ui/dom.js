// Tiny DOM helpers.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Popups (menus, dropdowns) live in one layer and close on outside click.
const popupLayer = () => document.getElementById('popup-layer');
let openPopups = [];
let closeHandlers = [];

export function showPopup(el, anchorRect, { side = 'below', onClose = null, keep = false } = {}) {
  if (!keep) closeAllPopups();
  el.classList.add('popup');
  popupLayer().appendChild(el);
  positionPopup(el, anchorRect, side);
  openPopups.push(el);
  closeHandlers.push(onClose);
  return el;
}

export function positionPopup(el, r, side) {
  const vw = window.innerWidth, vh = window.innerHeight;
  el.style.left = '0px'; el.style.top = '0px';
  const pw = el.offsetWidth, ph = el.offsetHeight;
  let x, y;
  if (side === 'right') { x = r.right - 2; y = r.top - 3; if (x + pw > vw) x = r.left - pw + 2; }
  else { x = r.left; y = r.bottom; if (y + ph > vh) y = Math.max(0, r.top - ph); }
  if (x + pw > vw) x = Math.max(0, vw - pw - 2);
  if (y + ph > vh) y = Math.max(0, vh - ph - 2);
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}

export function closePopupsAfter(el) {
  const i = openPopups.indexOf(el);
  if (i < 0) return;
  for (let j = openPopups.length - 1; j > i; j--) closePopupAt(j);
}

function closePopupAt(j) {
  const el = openPopups[j];
  const cb = closeHandlers[j];
  el.remove();
  openPopups.splice(j, 1);
  closeHandlers.splice(j, 1);
  if (cb) cb();
}

export function closeAllPopups() {
  for (let j = openPopups.length - 1; j >= 0; j--) closePopupAt(j);
}

export function popupsOpen() { return openPopups.length > 0; }

document.addEventListener('pointerdown', (e) => {
  if (!openPopups.length) return;
  if (e.target.closest('.popup') || e.target.closest('[data-popup-owner]')) return;
  closeAllPopups();
}, true);

export function isTextInput(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return !['checkbox', 'radio', 'button', 'color', 'range'].includes(el.type);
  return el.isContentEditable;
}
