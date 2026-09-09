const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // a dropped File carries no path in the isolated renderer; webUtils resolves it
  pathForFile: (file) => webUtils.getPathForFile(file),
  probeFiles: (paths) => ipcRenderer.invoke('probe-files', paths),
  loadLibrary: () => ipcRenderer.invoke('load-library'),
  saveLibrary: (items) => ipcRenderer.invoke('save-library', items),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  revealFile: (filePath) => ipcRenderer.invoke('reveal-file', filePath),
  openExternally: (filePath) => ipcRenderer.invoke('open-externally', filePath),
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
