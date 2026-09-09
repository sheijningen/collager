const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Dropped File objects no longer expose .path directly; webUtils bridges that.
  pathForFile: (file) => webUtils.getPathForFile(file),
  probeFiles: (paths) => ipcRenderer.invoke('probe-files', paths),
  loadLibrary: () => ipcRenderer.invoke('load-library'),
  saveLibrary: (items) => ipcRenderer.invoke('save-library', items),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickExportPath: (defaultName) => ipcRenderer.invoke('pick-export-path', defaultName),
  writeExportChunk: (filePath, bytes, last) =>
    ipcRenderer.invoke('write-export-chunk', filePath, bytes, last),
  abortExportWrite: () => ipcRenderer.invoke('abort-export-write'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  revealFile: (filePath) => ipcRenderer.send('reveal-file', filePath),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  setKeepAwake: (on) => ipcRenderer.send('keep-awake', on),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  onFullscreenChanged: (callback) => {
    ipcRenderer.on('fullscreen-changed', (_event, isFullscreen) => callback(isFullscreen));
  },
  onGpuFallback: (callback) => {
    ipcRenderer.on('gpu-fallback', () => callback());
  },
  onProbeProgress: (callback) => {
    ipcRenderer.on('probe-progress', (_event, progress) => callback(progress));
  }
});
