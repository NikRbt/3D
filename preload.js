const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (content, name) => ipcRenderer.invoke('file:save', content, name),
  saveBinaryFile: (name, bytes) => ipcRenderer.invoke('file:saveBinary', name, bytes),
  loadPhysicsWasm: () => ipcRenderer.invoke('physics:wasm'),
});
