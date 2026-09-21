// Preload: bridge between page and Node (printer IPC for Anko MX06 / mock).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installation', {
  isElectron: true,
  platform: process.platform,
  printThought: (job) => ipcRenderer.invoke('print-thought', job),
});
