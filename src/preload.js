const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  getFiles: () => ipcRenderer.invoke('get-files'),
  appendContent: (filename, content) => ipcRenderer.invoke('append-content', filename, content),

  // Note operations
  getNotes: (filename) => ipcRenderer.invoke('get-notes', filename),
  getNote: (noteId) => ipcRenderer.invoke('get-note', noteId),
  updateNote: (noteId, filename, content) => ipcRenderer.invoke('update-note', noteId, filename, content),


  // File system operations
  readFile: (filepath) => ipcRenderer.invoke('read-file', filepath),
  writeFile: (filepath, content) => ipcRenderer.invoke('write-file', filepath, content),

  // Path utilities
  joinPath: (...paths) => ipcRenderer.invoke('join-path', ...paths),

  // App controls
  closeApp: () => ipcRenderer.invoke('close-app'),
  minimizeApp: () => ipcRenderer.invoke('minimize-app'),
  maximizeApp: () => ipcRenderer.invoke('maximize-app'),

  // Development utilities
  openDevTools: () => ipcRenderer.invoke('open-dev-tools'),

  // Event listeners for file changes
  onFileChanged: (callback) => {
    ipcRenderer.on('file-changed', callback);
  },


  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Expose logging utilities
contextBridge.exposeInMainWorld('electronLog', {
  info: (message, ...args) => ipcRenderer.invoke('log', 'info', message, ...args),
  error: (message, ...args) => ipcRenderer.invoke('log', 'error', message, ...args),
  warn: (message, ...args) => ipcRenderer.invoke('log', 'warn', message, ...args),
  debug: (message, ...args) => ipcRenderer.invoke('log', 'debug', message, ...args)
});

// Expose platform information
contextBridge.exposeInMainWorld('electronPlatform', {
  platform: process.platform,
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux'
});