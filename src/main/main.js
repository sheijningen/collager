const { app, BrowserWindow, ipcMain, dialog, shell, Menu, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pathToFileURL } = require('url');
const { MEDIA_EXTS, probeFiles, typeForPath } = require('./lib/scan');
const { createLibraryStore } = require('./lib/library');

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

ipcMain.handle('probe-files', async (event, inputPaths) => {
  const { entries, skippedCount } = await probeFiles(inputPaths, 4, (done, total) => {
    if (!event.sender.isDestroyed()) event.sender.send('probe-progress', { done, total });
  });
  for (const entry of entries) entry.url = pathToFileURL(entry.path).href;
  return { entries, skippedCount };
});

ipcMain.handle('load-library', () => library.load());

/* About data for the renderer. Resolved relative to this file, not
 * getAppPath(), which points at test/e2e under the e2e harness. */
ipcMain.handle('get-app-info', () => {
  const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
  return {
    name: (pkg.build && pkg.build.productName) || pkg.name,
    version: pkg.version,
    description: pkg.description,
    author: typeof pkg.author === 'object' ? pkg.author.name : pkg.author,
    license: pkg.license,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} (${process.arch})`
  };
});

ipcMain.handle('save-library', (_event, items) => library.save(items));

/* Keeps the display (and thus the system) awake while the collage
 * auto-scrolls; released the moment auto-scroll stops or the toggle is off. */
let powerBlockerId = null;
ipcMain.on('keep-awake', (_event, on) => {
  if (on && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!on && powerBlockerId !== null) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
});

ipcMain.on('toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.setFullScreen(!win.isFullScreen());
});

ipcMain.handle('is-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isFullScreen() : false;
});

ipcMain.on('reveal-file', (_event, filePath) => {
  if (typeof filePath === 'string') shell.showItemInFolder(filePath);
});

/* Opens a media file in the system's default application for its type.
 * openPath runs whatever the desktop associates with the file, so only
 * existing files with a supported media extension are accepted here.
 * Resolves to an empty string on success, otherwise the reason. */
ipcMain.handle('open-externally', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !typeForPath(filePath)) return 'not a media file';
  try {
    if (!(await fsp.stat(filePath)).isFile()) return 'not a file';
  } catch {
    return 'file not found';
  }
  return shell.openPath(filePath);
});

ipcMain.handle('pick-files', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Add media',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Media', extensions: Object.keys(MEDIA_EXTS).map((ext) => ext.slice(1)) }]
  });
  return result.canceled ? [] : result.filePaths;
});

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
