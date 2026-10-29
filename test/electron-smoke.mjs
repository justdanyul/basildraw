// Launches the real Electron app and checks the main process, preload bridge,
// saving, re-opening and PDF export. Usage: node test/electron-smoke.mjs [outdir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, '..');
const out = process.argv[2] || path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdraw-'));

const errors = [];
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) errors.push(m); };

const app = await electron.launch({
  executablePath: require(path.join(appDir, 'node_modules', 'electron')),
  args: ['--no-sandbox', appDir],
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
});
const win = await app.firstWindow();
win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
win.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await win.waitForSelector('.welcome-card.card-blank');
check(await win.evaluate(() => typeof window.basil === 'object' && !!window.basil.writeFile), 'preload bridge available');
await win.screenshot({ path: path.join(out, 'electron-welcome.png') });
await win.click('.welcome-card.card-blank');

// draw a couple of shapes through the app API
await win.evaluate(() => {
  const app = window.basilApp;
  const ed = app.editor;
  app.setTool('shape', 'star');
  const s = ed.doc;
  return s;
});
const toClient = (x, y) => win.evaluate(([x, y]) => window.basilApp.editor.pageToClient({ x, y }), [x, y]);
const drag = async (a, b) => {
  const p1 = await toClient(...a), p2 = await toClient(...b);
  await win.mouse.move(p1.x, p1.y); await win.mouse.down();
  await win.mouse.move(p2.x, p2.y, { steps: 6 }); await win.mouse.up();
};
await drag([100, 100], [300, 280]);
await win.evaluate(() => window.basilApp.setTool('shape', 'roundrect'));
await drag([350, 120], [650, 300]);
await win.evaluate(() => window.basilApp.setTool('select'));
check(await win.evaluate(() => window.basilApp.editor.doc.objects.length) === 2, 'two shapes drawn in Electron');

// Save via the bridge (bypassing the native dialog)
const file = path.join(tmp, 'Test Card.bdraw');
await win.evaluate((p) => window.basilApp.files.writeTo(p), file);
check(fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).objects.length === 2, 'saved .bdraw file');
check(await win.evaluate(() => document.title.includes('Test Card')), 'window title shows the file name');

// PDF export through the main process
const pdf = path.join(tmp, 'card.pdf');
await win.evaluate(async (p) => {
  const f = window.basilApp.files;
  f.preparePrint();
  try { await window.basil.savePdf(p, { width: 800 / 96, height: 600 / 96 }); } finally { f.finishPrint(); }
}, pdf);
check(fs.existsSync(pdf) && fs.statSync(pdf).size > 1000, `PDF exported (${fs.existsSync(pdf) ? fs.statSync(pdf).size : 0} bytes)`);

// Open the saved file in a new window
const [win2] = await Promise.all([
  app.waitForEvent('window'),
  win.evaluate((p) => window.basil.newWindow(p), file),
]);
await win2.waitForFunction(() => window.basilApp && window.basilApp.editor.doc.objects.length === 2, null, { timeout: 10000 });
check(true, 'saved drawing re-opens in a new window');
const list = await win2.evaluate(() => window.basil.listWindows());
check(list.length === 2, `two windows listed (${list.map((w) => w.title).join(', ')})`);
await win2.screenshot({ path: path.join(out, 'electron-reopened.png') });

// Open an old .DRW drawing (built by the DRW unit test) in a new window
const { execFileSync } = await import('node:child_process');
const drwFile = path.join(tmp, 'Old Drawing.drw');
execFileSync(process.execPath, [path.join(here, 'drw-unit.mjs'), drwFile], { stdio: 'ignore' });
const [win3] = await Promise.all([
  app.waitForEvent('window'),
  win.evaluate((p) => window.basil.newWindow(p), drwFile),
]);
await win3.waitForFunction(() => window.basilApp && window.basilApp.editor.doc.objects.length === 7, null, { timeout: 10000 });
check(await win3.evaluate(() => !window.basilApp.editor.filePath && window.basilApp.editor.docName === 'Old Drawing'),
  'old .DRW drawing opens as an untitled copy');
await win3.screenshot({ path: path.join(out, 'electron-drw.png') });
await win3.evaluate(() => window.basil.forceClose());

// close without prompting
await win2.evaluate(() => window.basil.forceClose());
await win.evaluate(() => window.basil.forceClose());
await app.close().catch(() => {});
fs.copyFileSync(pdf, path.join(out, 'electron-export.pdf'));
if (errors.length) { console.log('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('All good.');
