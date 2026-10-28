// Exposes a small, safe API to the drawing window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('basil', {
  platform: process.platform,
  openFile: (opts) => ipcRenderer.invoke('file:open', opts),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  saveDialog: (opts) => ipcRenderer.invoke('file:saveDialog', opts),
  writeFile: (p, data, encoding) => ipcRenderer.invoke('file:write', p, data, encoding),
  getRecent: () => ipcRenderer.invoke('recent:get'),
  addRecent: (p) => ipcRenderer.invoke('recent:add', p),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (prefs) => ipcRenderer.invoke('prefs:set', prefs),
  print: () => ipcRenderer.invoke('print'),
  savePdf: (p, sizeIn) => ipcRenderer.invoke('pdf:save', p, sizeIn),
  previewPdf: (sizeIn, name) => ipcRenderer.invoke('pdf:preview', sizeIn, name),
  message: (opts) => ipcRenderer.invoke('message', opts),
  newWindow: (filePath) => ipcRenderer.invoke('window:new', filePath),
  listWindows: () => ipcRenderer.invoke('window:list'),
  focusWindow: (id) => ipcRenderer.invoke('window:focus', id),
  closeAll: () => ipcRenderer.invoke('window:closeAll'),
  quit: () => ipcRenderer.invoke('app:quit'),
  version: () => ipcRenderer.invoke('app:version'),
  setWindowState: (state) => ipcRenderer.send('window:state', state),
  forceClose: () => ipcRenderer.send('window:forceClose'),
  editRole: (role) => ipcRenderer.send('edit-role', role),
  onCommand: (fn) => ipcRenderer.on('command', (_e, cmd) => fn(cmd)),
  onWindowsChanged: (fn) => ipcRenderer.on('windows-changed', (_e, list) => fn(list)),
});
