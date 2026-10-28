// Smoke test: runs the drawing window in Chromium (without Electron) and exercises
// the main features. Usage: node test/smoke.mjs [outdir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', 'src', 'renderer');
const out = process.argv[2] || path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p.endsWith('/') ? path.join(p, 'index.html') : p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

let step = 0;
const shot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: path.join(out, `${String(++step).padStart(2, '0')}-${name}.png`) }); };
const check = (cond, msg) => { if (!cond) { errors.push(`CHECK FAILED: ${msg}`); console.log('FAIL', msg); } else console.log('ok  ', msg); };

await page.goto(url);
await page.waitForTimeout(500);
await shot('welcome');
await page.click('.welcome-card.card-blank');
await page.waitForTimeout(200);

// page-space -> client coordinates
const toClient = (x, y) => page.evaluate(([x, y]) => window.basilApp.editor.pageToClient({ x, y }), [x, y]);
const drag = async (a, b, opts = {}) => {
  const p1 = await toClient(...a), p2 = await toClient(...b);
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, { steps: 4 });
  await page.mouse.move(p2.x, p2.y, { steps: 4 });
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
};
const click = async (x, y, opts = {}) => { const p = await toClient(x, y); await page.mouse.click(p.x, p.y, opts); };
const count = () => page.evaluate(() => window.basilApp.editor.doc.objects.length);
const tool = (name, kind) => page.evaluate(([n, k]) => window.basilApp.setTool(n, k), [name, kind]);

// Toolbox flyout: open shapes and pick rectangle
await page.click('#toolbox .fly[data-group="shapes"]');
await shot('shapes-flyout');
await page.click('.flyout .tool[title="Rectangle"]');
await drag([60, 60], [240, 170]);
check(await count() === 1, 'rectangle drawn by dragging');
await shot('rectangle');

await tool('shape', 'ellipse');
await drag([280, 60], [430, 170]);
await tool('shape', 'star');
await drag([470, 40], [620, 180]);
await tool('shape', 'cube');
await drag([640, 40], [760, 160]);
await tool('shape', 'arrow1_3d');
await drag([60, 220], [240, 300]);
await tool('shape', 'cylinder');
await drag([280, 210], [360, 320]);
await tool('shape', 'curved_3d');
await drag([400, 210], [520, 320]);
await tool('shape', 'arrow4way');
await drag([560, 210], [680, 320]);
check(await count() === 8, 'eight shapes drawn');

// lines
await tool('line', 'straight');
await drag([60, 360], [300, 420]);
await page.evaluate(() => window.basilApp.editor.applyStyle('ends', { end: 8, start: 2 }));
await page.evaluate(() => window.basilApp.editor.applyStyle('line', { style: 'wide', width: 3, color: '#c00000' }));
await tool('line', 'polyline');
await click(340, 360); await click(400, 440); await click(460, 370);
const p = await toClient(520, 430);
await page.mouse.click(p.x, p.y);
await page.mouse.dblclick(p.x, p.y);
await tool('line', 'freehand');
await drag([560, 360], [740, 440]);
const lines = await page.evaluate(() => window.basilApp.editor.doc.objects.filter((o) => o.type === 'line').length);
check(lines === 3, `three lines drawn (got ${lines})`);

// polygon by clicks + Enter
await tool('shape', 'smoothpolygon');
await click(60, 470); await click(140, 450); await click(200, 520); await click(110, 560);
await page.keyboard.press('Enter');
check(await page.evaluate(() => window.basilApp.editor.doc.objects.some((o) => o.kind === 'smoothpolygon' && o.points.length === 4)), 'smoothed polygon with 4 points');

// text
await tool('text');
await click(260, 480);
await page.keyboard.type('Happy Birthday Dad!');
await page.keyboard.press('Escape');
check(await page.evaluate(() => window.basilApp.editor.doc.objects.some((o) => o.type === 'text' && o.content === 'Happy Birthday Dad!')), 'text object created');
await page.click('#finished-btn');
await shot('many-objects');

// select rectangle and type a label
await click(150, 115);
await page.keyboard.type('Hello');
await page.keyboard.press('Escape');
check(await page.evaluate(() => window.basilApp.editor.doc.objects[0].label === 'Hello'), 'typing on a selected shape sets its label');

// Object properties: gradient fill + soft shadow on the rectangle
await page.keyboard.press('Control+d');
await page.waitForTimeout(200);
await page.click('.tab:has-text("Fill")');
await page.click('label.radio:has-text("Gradient")');
await page.click('.gradients .swatch-cell >> nth=3');
await shot('object-properties-fill');
await page.click('.tab:has-text("Shadow")');
await page.click('label.radio:has-text("Soft")');
await page.click('.dlg-buttons .btn:has-text("OK")');
check(await page.evaluate(() => { const o = window.basilApp.editor.doc.objects[0]; return o.fill.style === 'gradient' && o.shadow.style === 'soft'; }), 'object properties applied (gradient + soft shadow)');

// pattern fill on the ellipse via the dialog
await click(355, 115);
await page.evaluate(() => { window.basilApp.run('fmtFill'); });
await page.waitForTimeout(150);
await page.click('label.radio:has-text("Pattern")');
await page.click('.patterns .swatch-cell >> nth=1');
await page.click('.dlg-buttons .btn:has-text("OK")');

// fill colour from toolbar palette on the star
await click(545, 110);
await page.click('button[title="Fill Color"]');
await page.click('.palette .swatch[title="Yellow"]');
check(await page.evaluate(() => window.basilApp.editor.selected()[0].fill.color.toLowerCase() !== '#ffffff'), 'toolbar fill colour applied');

// rotate mode and rotate the star with keyboard command
await page.keyboard.press('Shift+F8');
check(await page.evaluate(() => window.basilApp.editor.selected()[0].rot === 90), 'rotate right 90');
await page.evaluate(() => window.basilApp.run('rotateMode'));
await shot('rotate-mode');
// drag a rotate handle
const hpos = await page.evaluate(() => {
  const h = document.querySelector('.handle[data-kind=rotate]');
  const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(hpos.x, hpos.y); await page.mouse.down();
await page.mouse.move(hpos.x + 30, hpos.y + 40, { steps: 5 }); await page.mouse.up();
check(await page.evaluate(() => window.basilApp.editor.selected()[0].rot !== 90), 'rotate handle drag changes rotation');
await page.evaluate(() => window.basilApp.run('selectMode'));

// resize the rectangle using a handle
await click(150, 115);
await page.waitForTimeout(100);
const before = await page.evaluate(() => window.basilApp.editor.doc.objects[0].w);
const se = await page.evaluate(() => { const r = document.querySelector('.handle[data-handle=se]').getBoundingClientRect(); return { x: r.x + 3, y: r.y + 3 }; });
await page.mouse.move(se.x, se.y); await page.mouse.down(); await page.mouse.move(se.x + 40, se.y + 20, { steps: 5 }); await page.mouse.up();
check(await page.evaluate((b) => window.basilApp.editor.doc.objects[0].w > b, before), 'resize by handle');

// move by dragging
const x0 = await page.evaluate(() => window.basilApp.editor.doc.objects[0].x);
await drag([100, 100], [130, 130]);
check(await page.evaluate((x) => Math.abs(window.basilApp.editor.doc.objects[0].x - x) > 5, x0), 'move by dragging');

// marquee select, group, ungroup
await page.evaluate(() => window.basilApp.editor.deselect());
await drag([20, 190], [700, 340]);
const nsel = await page.evaluate(() => window.basilApp.editor.selection.length);
check(nsel >= 3, `marquee selects several objects (${nsel})`);
await page.keyboard.press('F5');
check(await page.evaluate(() => window.basilApp.editor.selected()[0]?.type === 'group'), 'group with F5');
await shot('grouped');
await page.keyboard.press('Shift+F5');
check(await page.evaluate(() => window.basilApp.editor.selection.length) === nsel, 'ungroup with Shift+F5');

// flip, align
await page.keyboard.press('F7');
await page.evaluate(() => window.basilApp.run('align:top'));

// undo / redo
const n1 = await count();
await page.keyboard.press('Delete');
check(await count() < n1, 'delete');
await page.keyboard.press('Control+z');
check(await count() === n1, 'undo delete');
await page.keyboard.press('Control+y');
check(await count() < n1, 'redo delete');
await page.keyboard.press('Control+z');

// copy/paste
await click(150, 115);
await page.keyboard.press('Control+c');
await page.keyboard.press('Control+v');
check(await count() === n1 + 1, 'copy + paste');

// edit points on the polyline
const polyIdx = await page.evaluate(() => window.basilApp.editor.doc.objects.findIndex((o) => o.kind === 'polyline'));
await page.evaluate((i) => { const ed = window.basilApp.editor; ed.select(ed.doc.objects[i].id); window.basilApp.setTool('points'); }, polyIdx);
await page.waitForTimeout(100);
const pt = await page.evaluate(() => { const r = document.querySelector('.handle[data-kind=point][data-index="1"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const before1 = await page.evaluate((i) => JSON.stringify(window.basilApp.editor.doc.objects[i].points), polyIdx);
await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move(pt.x, pt.y + 60, { steps: 5 }); await page.mouse.up();
check(await page.evaluate(([i, b]) => JSON.stringify(window.basilApp.editor.doc.objects[i].points) !== b, [polyIdx, before1]), 'edit points moves a vertex');
await shot('edit-points');

// slant the cube in rotate mode
const cubeIdx = await page.evaluate(() => window.basilApp.editor.doc.objects.findIndex((o) => o.kind === 'cube'));
await page.evaluate((i) => { const ed = window.basilApp.editor; window.basilApp.setTool('rotate'); ed.select(ed.doc.objects[i].id); }, cubeIdx);
await page.waitForTimeout(100);
const nh = await page.evaluate(() => { const r = document.querySelector('.handle[data-kind=slant][data-handle=n]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(nh.x, nh.y); await page.mouse.down(); await page.mouse.move(nh.x + 30, nh.y, { steps: 5 }); await page.mouse.up();
check(await page.evaluate((i) => Math.abs(window.basilApp.editor.doc.objects[i].skx) > 1, cubeIdx), 'slant handle slants the cube');
await shot('slanted');
await page.evaluate(() => window.basilApp.setTool('select'));

// layers
await page.evaluate(() => { window.basilApp.run('addLayer'); });
await page.waitForTimeout(150);
await page.click('.dlg-buttons .btn.default');
check(await page.evaluate(() => window.basilApp.editor.doc.layers.length === 2), 'add layer');
await tool('shape', 'pentagon');
await drag([600, 470], [720, 580]);
await page.click('#finished-btn');

// blend between the pentagon and a new circle
await tool('shape', 'circle');
await drag([420, 470], [470, 520]);
await page.click('#finished-btn');
await page.evaluate(() => { const ed = window.basilApp.editor; const ids = ed.doc.objects.filter((o) => o.kind === 'pentagon' || o.kind === 'circle').map((o) => o.id); ed.select(ids); });
await page.evaluate(() => window.basilApp.editor.applyStyle('fill', { style: 'solid', color: '#e63946' }));
await page.evaluate(() => { const ed = window.basilApp.editor; ed.doc.objects.find((o) => o.kind === 'circle').fill.color = '#1d7fd8'; ed.invalidate(); });
await page.evaluate(() => { window.basilApp.run('blend'); });
await page.waitForTimeout(200);
await shot('blend-dialog');
await page.click('.dlg-buttons .btn.default');
await page.waitForTimeout(200);
check(await page.evaluate(() => window.basilApp.editor.doc.objects.some((o) => o.type === 'group' && o.name === 'Blend' && o.children.length === 10)), 'blend creates 10 in-between steps');
await shot('blended');

// menus open
await page.click('.menutop:has-text("Insert")');
await page.hover('.menu .menuitem:has-text("CoolShapes")');
await page.waitForTimeout(300);
await shot('insert-menu');
await page.keyboard.press('Escape');
await page.click('.menutop:has-text("Draw")');
await page.hover('.menu .menuitem:has-text("Align Objects")');
await page.waitForTimeout(300);
await shot('draw-menu');
await page.keyboard.press('Escape');

// dialogs
for (const cmd of ['pageSetup', 'options', 'layerManager', 'help', 'about', 'clipArt', 'fmtLine', 'fmtEnds', 'fmtText', 'pageBackground']) {
  await page.evaluate((c) => { window.basilApp.run(c); }, cmd);
  await page.waitForTimeout(250);
  await shot(`dlg-${cmd}`);
  const closeBtn = await page.$('.dlg-x');
  if (closeBtn) await closeBtn.click();
  await page.waitForTimeout(100);
}

// clip art insert
await page.evaluate(() => { window.basilApp.run('clipArt'); });
await page.waitForTimeout(200);
await page.click('.clipart .swatch-cell >> nth=9');
await page.click('.dlg-buttons .btn.default');
await page.waitForTimeout(300);
check(await page.evaluate(() => window.basilApp.editor.doc.objects.some((o) => o.type === 'image')), 'clip art inserted');

// zoom
await page.keyboard.press('PageUp');
await page.keyboard.press('Home');
await page.evaluate(() => window.basilApp.run('rulers'));
await page.waitForTimeout(200);
await shot('final');

// export round trip
const json = await page.evaluate(async () => {
  const { serialize, deserialize } = await import('./js/model.js');
  const s = serialize(window.basilApp.editor.doc);
  const d = deserialize(s);
  return { len: s.length, n: d.objects.length };
});
check(json.n === await count(), `serialize/deserialize round trip (${json.len} bytes)`);
const png = await page.evaluate(async () => (await window.basilApp.files.renderPng(1)).length);
check(png > 1000, `PNG export renders (${png} chars)`);
// proof mode off
await page.evaluate(() => window.basilApp.run('proof'));
await shot('wireframe');
await page.evaluate(() => window.basilApp.run('proof'));

// every project type in every style builds without errors
const matrix = await page.evaluate(async () => {
  const { buildProject, projectTypes, THEMES } = await import('./js/projects.js');
  const out = [];
  for (const t of Object.keys(projectTypes())) for (const th of THEMES) {
    const d = buildProject(t, th.id, {}, window.basilApp.fonts);
    out.push(d.objects.length);
  }
  return out;
});
check(matrix.length === 36 && matrix.every((n) => n > 1), `all 36 wizard project/style combinations build (${matrix.join(',')})`);

// Render exported SVG to a file for inspection
const svg = await page.evaluate(() => window.basilApp.files.pageSvg());
fs.writeFileSync(path.join(out, 'export.svg'), svg);
const pngData = await page.evaluate(async () => window.basilApp.files.renderPng(1));
fs.writeFileSync(path.join(out, 'export.png'), Buffer.from(pngData, 'base64'));

// ---- Project Wizard, from a fresh window ----
await page.goto(url);
await page.waitForTimeout(400);
await page.click('.welcome-card.card-wizard');
await page.waitForTimeout(400);
await shot('wizard-1');
await page.click('.wiz-card:has-text("Certificate")');
await page.click('.wiz-foot .btn.primary');
await page.waitForTimeout(300);
await shot('wizard-2');
await page.click('.wiz-card:has-text("Elegant")');
await page.click('.wiz-foot .btn.primary');
await page.waitForTimeout(300);
await page.fill('.wiz-form label:has-text("Awarded to") input', 'Dad');
await page.waitForTimeout(300);
await shot('wizard-3');
await page.click('.wiz-foot .btn.primary');
await page.waitForTimeout(400);
check(await page.evaluate(() => { const d = window.basilApp.editor.doc; return d.objects.some((o) => o.type === 'text' && o.content === 'Dad') && d.page.width > d.page.height; }), 'wizard creates a landscape certificate for Dad');
await shot('wizard-result');
for (const [type, theme] of [['Greeting Card', 'Bright & Fun'], ['Calendar', 'Modern'], ['Business Card', 'Classic'], ['Invitation', 'Elegant'], ['Sign or Poster', 'Bright & Fun']]) {
  await page.evaluate(() => { const ed = window.basilApp.editor; ed.doc.objects = []; ed.dirty = false; ed.filePath = null; window.basilApp.run('newProject'); });
  await page.waitForTimeout(300);
  await page.click(`.wiz-card:has-text("${type}")`);
  await page.click('.wiz-foot .btn.primary');
  await page.waitForTimeout(200);
  await page.click(`.wiz-card:has-text("${theme}")`);
  await page.click('.wiz-foot .btn.primary');
  await page.waitForTimeout(200);
  await page.click('.wiz-foot .btn.primary');
  await page.waitForTimeout(400);
  await shot(`project-${type.split(' ')[0].toLowerCase()}`);
}

await browser.close();
server.close();
console.log(`\nScreenshots in ${out}`);
if (errors.length) {
  console.log('\nERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('All good.');
