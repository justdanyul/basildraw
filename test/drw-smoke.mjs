// Opens .DRW files in the drawing window (headless Chromium) and saves a picture of each.
// Usage: node test/drw-smoke.mjs file1.drw [file2.drw ...] [--out dir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', 'src', 'renderer');
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args.splice(oi, 2)[1] : path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
if (!args.length) { console.log('Usage: node test/drw-smoke.mjs file1.drw [file2.drw ...] [--out dir]'); process.exit(1); }
const files = args;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/index.html?nowelcome=1`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(url);
await page.waitForTimeout(500);

let failed = 0;
for (const f of files) {
  const name = path.basename(f).replace(/\.drw$/i, '');
  const b64 = fs.readFileSync(f).toString('base64');
  const info = await page.evaluate(async ([b64, name]) => {
    const app = window.basilApp;
    const { base64ToBytes } = await import('./js/drw.js');
    const { doc, warnings } = await app.files.importDrw(base64ToBytes(b64));
    app.editor.loadDocument(doc, null, name);
    app.files.updateWindowState();
    const png = await app.files.renderPng(1);
    return { n: doc.objects.length, warnings, page: doc.page, png };
  }, [b64, name]);
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(info.png, 'base64'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `${name}-window.png`) });
  console.log(info.n ? 'ok  ' : 'FAIL', `${name}: ${info.n} objects, page ${Math.round(info.page.width)}x${Math.round(info.page.height)}px`, info.warnings.join(' '));
  if (!info.n) failed++;
}
await browser.close();
server.close();
if (errors.length) { console.log(errors.join('\n')); failed++; }
process.exit(failed ? 1 : 0);
