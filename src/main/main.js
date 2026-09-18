const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { createLibraryStore } = require('./lib/library');
const { registerLibraryIpc } = require('./ipc/library');
const { registerFilesIpc } = require('./ipc/files');
const { registerWindowIpc } = require('./ipc/window');
const { buildRelaunchOptions } = require('./lib/relaunch');

const library = createLibraryStore(() => app.getPath('userData'));

/* One instance per library: a second launch (a double double-click, a second
 * shortcut) would write library.json in turns with the first and lose what
 * either added. */
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
  return;
}
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

/* ---------------- GPU crash resilience ----------------
 * Some Windows GPU drivers make Chromium's GPU process crash ("GPU state
 * invalid after WaitForGetOffsetInRange", blank window, hard crash). If the
 * GPU process dies repeatedly, relaunch with hardware acceleration disabled
 * so the session keeps working. The switch is passed to the relaunched
 * process and nothing is written to disk, so every normal start tries
 * hardware acceleration again: a driver update or a reboot then fixes itself
 * without the user having to know any of this exists.
 */

const noGpuSwitch = '--collager-no-gpu';

const gpuFallback = process.argv.includes(noGpuSwitch);
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
    app.relaunch(buildRelaunchOptions(process.argv, process.env.APPIMAGE, noGpuSwitch));
    app.exit(0);
  }
});

/* ---------------- packaged smoke run ----------------
 * The release workflow starts the freshly built app with COLLAGER_SMOKE=1 and
 * expects it to exit 0 once the renderer has loaded the library, which proves
 * the packaged files hold every path the app opens and that the page runs.
 * The ready flag is read through the window.collagerTest hook the e2e harness
 * uses, and a run that is not ready within the deadline exits 1 instead. */
const smokeRun = process.env.COLLAGER_SMOKE === '1';
const SMOKE_DEADLINE_MS = 60000;
const SMOKE_POLL_MS = 250;
let smokeWatched = false;

function watchSmokeRun(win) {
  if (smokeWatched) return;
  smokeWatched = true;
  let finished = false;
  // one outcome only: a late poll, the deadline and a closing window all race
  function finish(code, reason) {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    if (reason) console.error(`Smoke run: ${reason}`);
    app.exit(code);
  }
  const deadline = setTimeout(
    () => finish(1, 'the renderer did not load the library in time'),
    SMOKE_DEADLINE_MS
  );
  // a window gone before the flag is up is a crashed renderer, not a pass
  win.on('closed', () => finish(1, 'the window closed before the library loaded'));
  async function poll() {
    if (finished) return;
    const ready = await win.webContents
      .executeJavaScript('Boolean(window.collagerTest?.state.libraryLoaded)')
      .catch(() => false);
    if (ready) finish(0);
    else setTimeout(poll, SMOKE_POLL_MS);
  }
  poll();
}

// must match build.appId in package.json: electron-builder stamps that id on
// the Start menu shortcut, and Windows only groups and pins the running window
// with the shortcut when the process claims the same id
if (process.platform === 'win32') app.setAppUserModelId('dev.svh.collager');

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
  // the e2e harness drives the renderer, and the smoke run reads its ready
  // flag, through a hook app.js only installs when the page is loaded with ?e2e
  const query = process.env.COLLAGER_E2E === '1' || smokeRun ? { e2e: '1' } : {};
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query });
  if (smokeRun) watchSmokeRun(win);
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
