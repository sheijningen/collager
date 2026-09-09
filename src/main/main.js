const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { createLibraryStore } = require('./lib/library');
const { registerLibraryIpc } = require('./ipc/library');
const { registerFilesIpc } = require('./ipc/files');
const { registerWindowIpc } = require('./ipc/window');

const library = createLibraryStore(() => app.getPath('userData'));

/* ---------------- GPU crash resilience ----------------
 * Some Windows GPU drivers make Chromium's GPU process crash ("GPU state
 * invalid after WaitForGetOffsetInRange", blank window, hard crash). If the
 * GPU process dies repeatedly, persist a flag and relaunch with hardware
 * acceleration disabled. Delete the flag file (or start with --gpu) to try
 * hardware acceleration again; --no-gpu forces software rendering once.
 */

const gpuFlagFile = () => path.join(app.getPath('userData'), 'disable-gpu');

if (process.argv.includes('--gpu')) {
  try {
    fs.unlinkSync(gpuFlagFile());
  } catch {}
}
const gpuFallback =
  !process.argv.includes('--gpu') &&
  (process.argv.includes('--no-gpu') || fs.existsSync(gpuFlagFile()));
if (gpuFallback) app.disableHardwareAcceleration();

let gpuCrashes = 0;
let quitting = false;
app.on('before-quit', () => {
  quitting = true;
});

app.on('child-process-gone', (_event, details) => {
  // GPU-process teardown during shutdown is a known benign race on Windows
  // ("GPU state invalid..." logged on close) — never count it, and never
  // relaunch an app the user is closing
  if (quitting || BrowserWindow.getAllWindows().length === 0) return;
  if (details.type !== 'GPU') return;
  if (!['crashed', 'abnormal-exit', 'launch-failed'].includes(details.reason)) return;
  gpuCrashes++;
  console.error(`GPU process gone (${details.reason}), crash #${gpuCrashes}`);
  if (gpuCrashes >= 3 && !gpuFallback) {
    try {
      fs.writeFileSync(
        gpuFlagFile(),
        'Written after repeated GPU process crashes. Delete this file (or start with --gpu) to re-enable hardware acceleration.\n'
      );
    } catch {}
    app.relaunch();
    app.exit(0);
  }
});

/* Every channel the preload script exposes is registered here; the handlers
 * live in src/main/ipc, grouped by what they touch. */
registerLibraryIpc(library);
registerFilesIpc();
registerWindowIpc();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#111114',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  // keep the renderer's fullscreen button in sync no matter how the state
  // changes (our IPC, the window manager, HTML fullscreen from a video)
  win.on('enter-full-screen', () => win.webContents.send('fullscreen-changed', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen-changed', false));
  // the application menu is dropped below, so restore devtools for development
  win.webContents.on('before-input-event', (_event, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });
  if (gpuFallback) {
    win.webContents.on('did-finish-load', () => win.webContents.send('gpu-fallback'));
  }
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  // drop the default menu: the app owns its shortcuts (notably F11, which the
  // default menu would otherwise also bind, risking double-toggles). Kept on
  // macOS, where a null menu would strip Cmd+Q/C/V and make the app unquittable.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
