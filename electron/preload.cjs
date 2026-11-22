const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codefly', {
  request: (payload) => ipcRenderer.invoke('codefly:request', payload),
  platform: process.platform,
  runtime: 'electron',
  version: process.versions.electron,
});
