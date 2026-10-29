// Basil Draw — Electron main process.
// Each drawing lives in its own BrowserWindow. The renderer owns the menus
// (drawn inside the window, like the classic Windows apps); the main process
// provides files, dialogs, printing and window management over IPC.

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isMac = process.platform === 'darwin';
const windows = new Set();
const winState = new Map(); // webContents.id -> { dirty, title, forceClose }
let pendingOpenFiles = [];

// ---------- persistent prefs & recent files ----------
function userFile(name) {
  return path.join(app.getPath('userData'), name);
}
function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(userFile(name), 'utf8')); } catch { return fallback; }
}
function writeJSON(name, value) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(userFile(name), JSON.stringify(value, null, 2));
  } catch (err) { console.error('Could not save', name, err); }
}
function addRecent(filePath) {
  let recent = readJSON('recent.json', []).filter((p) => p !== filePath);
  recent.unshift(filePath);
  recent = recent.slice(0, 8);
  writeJSON('recent.json', recent);
  try { app.addRecentDocument(filePath); } catch { /* not supported everywhere */ }
  return recent;
}

// ---------- windows ----------
function createWindow(filePath) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    title: 'Basil Draw',
    backgroundColor: '#f6f6f8',
    show: false,
    // A modern unified title bar: the app draws its own top bar.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 14 } }
      : process.platform === 'win32'
        ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#f6f6f8', symbolColor: '#3a3f4b', height: 44 } }
        : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  windows.add(win);
  const id = win.webContents.id;
  winState.set(id, { dirty: false, title: 'Untitled', forceClose: false });

  const query = {};
  if (filePath) query.file = filePath;
  if (windows.size > 1 || filePath) query.nowelcome = '1';
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query });
  win.once('ready-to-show', () => win.show());

  win.on('close', (event) => {
    const state = winState.get(id);
    if (!state || !state.dirty || state.forceClose) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: `Save changes to "${state.title}"?`,
      detail: 'Your changes will be lost if you don\'t save them.',
    });
    if (choice === 0) {
      win.webContents.send('command', 'saveAndClose');
    } else if (choice === 1) {
      state.forceClose = true;
      win.close();
    }
  });
  win.on('closed', () => {
    windows.delete(win);
    winState.delete(id);
    broadcastWindowList();
  });
  win.on('focus', broadcastWindowList);
  broadcastWindowList();
  return win;
}

function windowList() {
  return [...windows].map((w) => ({
    id: w.webContents.id,
    title: (winState.get(w.webContents.id) || {}).title || 'Untitled',
  }));
}
function broadcastWindowList() {
  const list = windowList();
  for (const w of windows) {
    if (!w.isDestroyed()) w.webContents.send('windows-changed', list);
  }
}
function fromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

// ---------- IPC ----------
const drawingFilters = [
  { name: 'Drawings', extensions: ['bdraw', 'pdraw', 'drw'] },
  { name: 'Basil Draw drawings', extensions: ['bdraw', 'pdraw'] },
  { name: 'Old DRW drawings', extensions: ['drw'] },
];

// Old .DRW drawings are binary; hand them to the window as base64.
function readDrawing(p) {
  if (/\.drw$/i.test(p)) return { path: p, base64: fs.readFileSync(p).toString('base64') };
  return { path: p, content: fs.readFileSync(p, 'utf8') };
}

ipcMain.handle('file:open', async (event, opts = {}) => {
  const win = fromEvent(event);
  const res = await dialog.showOpenDialog(win, {
    title: opts.title || 'Open',
    properties: ['openFile'],
    filters: opts.filters || [...drawingFilters, { name: 'All files', extensions: ['*'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  const p = res.filePaths[0];
  if (opts.asDataUrl) {
    const buf = fs.readFileSync(p);
    const ext = path.extname(p).slice(1).toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[ext] || 'application/octet-stream';
    return { path: p, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  }
  if (opts.drawing) return readDrawing(p);
  return { path: p, content: fs.readFileSync(p, 'utf8') };
});

ipcMain.handle('file:read', async (_event, p) => readDrawing(p));

ipcMain.handle('file:saveDialog', async (event, opts = {}) => {
  const win = fromEvent(event);
  const res = await dialog.showSaveDialog(win, {
    title: opts.title || 'Save As',
    defaultPath: opts.defaultPath,
    filters: opts.filters || [{ name: 'Basil Draw drawings', extensions: ['bdraw'] }],
  });
  if (res.canceled || !res.filePath) return null;
  return res.filePath;
});

ipcMain.handle('file:write', async (_event, p, data, encoding) => {
  if (encoding === 'base64') fs.writeFileSync(p, Buffer.from(data, 'base64'));
  else fs.writeFileSync(p, data, 'utf8');
  return true;
});

ipcMain.handle('recent:get', () => readJSON('recent.json', []).filter((p) => fs.existsSync(p)));
ipcMain.handle('recent:add', (_event, p) => addRecent(p));
ipcMain.handle('prefs:get', () => readJSON('prefs.json', {}));
ipcMain.handle('prefs:set', (_event, prefs) => { writeJSON('prefs.json', prefs); return true; });

ipcMain.handle('print', async (event) => {
  const win = fromEvent(event);
  return new Promise((resolve) => {
    win.webContents.print({ printBackground: true }, (success, reason) => resolve({ success, reason }));
  });
});

// sizeIn: { width, height } in inches
ipcMain.handle('pdf:save', async (event, p, sizeIn) => {
  const win = fromEvent(event);
  const data = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: { width: sizeIn.width, height: sizeIn.height },
    margins: { marginType: 'none' },
  });
  fs.writeFileSync(p, data);
  return true;
});

ipcMain.handle('pdf:preview', async (event, sizeIn, name) => {
  const win = fromEvent(event);
  const data = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: { width: sizeIn.width, height: sizeIn.height },
    margins: { marginType: 'none' },
  });
  const safe = (name || 'Drawing').replace(/[^\w\- ]+/g, '_');
  const p = path.join(os.tmpdir(), `${safe} (preview).pdf`);
  fs.writeFileSync(p, data);
  await shell.openPath(p);
  return true;
});

ipcMain.handle('message', async (event, opts) => {
  const win = fromEvent(event);
  const res = await dialog.showMessageBox(win, opts);
  return res.response;
});

ipcMain.handle('window:new', (_event, filePath) => { createWindow(filePath); return true; });
ipcMain.handle('window:list', () => windowList());
ipcMain.handle('window:focus', (_event, id) => {
  for (const w of windows) if (w.webContents.id === id) { if (w.isMinimized()) w.restore(); w.focus(); }
  return true;
});
ipcMain.handle('window:closeAll', () => { for (const w of [...windows]) w.close(); return true; });
ipcMain.handle('app:quit', () => { app.quit(); return true; });
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.on('window:state', (event, state) => {
  const s = winState.get(event.sender.id);
  if (!s) return;
  Object.assign(s, state);
  const win = fromEvent(event);
  if (win && isMac) win.setDocumentEdited(!!s.dirty);
  if (win && state.filePath !== undefined && isMac) win.setRepresentedFilename(state.filePath || '');
  broadcastWindowList();
});
ipcMain.on('window:forceClose', (event) => {
  const s = winState.get(event.sender.id);
  if (s) s.forceClose = true;
  const win = fromEvent(event);
  if (win) win.close();
});

// Text-field editing (copy/paste in input boxes) — the renderer handles all
// keyboard shortcuts itself, and asks for these when a text field has focus.
ipcMain.on('edit-role', (event, role) => {
  const wc = event.sender;
  if (['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'delete'].includes(role)) wc[role]();
});

// ---------- app lifecycle ----------
function buildNativeMenu() {
  if (!isMac) { Menu.setApplicationMenu(null); return; }
  // On macOS the system menu bar is always there; keep it minimal — the
  // drawing menus live inside the window, as in the original program.
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) createWindow(filePath);
  else pendingOpenFiles.push(filePath);
});

app.whenReady().then(() => {
  nativeTheme.themeSource = 'light';
  app.setAboutPanelOptions?.({
    applicationName: 'Basil Draw',
    applicationVersion: app.getVersion(),
    credits: 'A friendly drawing program, made for Dad.',
  });
  buildNativeMenu();
  const argFile = process.argv.slice(1).find((a) => /\.([bp]draw|drw)$/i.test(a) && fs.existsSync(a));
  if (argFile) pendingOpenFiles.push(path.resolve(argFile));
  if (pendingOpenFiles.length) pendingOpenFiles.forEach((f) => createWindow(f));
  else createWindow();
  pendingOpenFiles = [];

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
