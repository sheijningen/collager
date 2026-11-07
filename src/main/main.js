const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { createLibraryStore } = require('./lib/library');
const { registerLibraryIpc } = require('./ipc/library');
const { registerFilesIpc } = require('./ipc/files');
const { registerWindowIpc, releaseKeepAwake, APP_NAME } = require('./ipc/window');
const { buildRelaunchOptions } = require('./lib/relaunch');
const { buildMacMenuTemplate } = require('./lib/appmenu');

const library = createLibraryStore(() => app.getPath('userData'));

/* One instance per library: a second launch (a double double-click, a second
 * shortcut) would write library.json in turns with the first and lose what
 * either added. */
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
  return;
}
app.on('second-instance', showWindow);

/* Brings the window forward, or opens one when the app has none, as on macOS
 * after the last one closed. Before ready the startup opens the first one. */
function showWindow() {
  if (!app.isReady()) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.focus();
}

/* ---------------- paths macOS asks the app to open ----------------
 * Files and folders dropped on the Dock icon or opened with the app from
 * Finder are added like a drop. They can arrive before the window exists,
 * even before ready, so they wait until a page has loaded; a reload holds
 * them back until the new page is up. One Finder action delivers its paths
 * back to back, and the deferred send takes them over as one batch. */
let pendingOpenPaths = [];
let openPathsReceiver = null; // the webContents of a loaded page, if any

function sendOpenPaths() {
  if (!openPathsReceiver || !pendingOpenPaths.length) return;
  openPathsReceiver.send('open-paths', pendingOpenPaths);
  pendingOpenPaths = [];
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  pendingOpenPaths.push(filePath);
  // the items should land where the user sees them, in a window that may be
  // minimized or, on macOS, closed
  showWindow();
  setImmediate(sendOpenPaths);
});

/* ---------------- GPU crash resilience ----------------
 * Some Windows GPU drivers crash Chromium's GPU process; three crashes
 * relaunch the app without hardware acceleration. Nothing is written to
 * disk, so every normal start tries it again and a driver update or a reboot
 * fixes it by itself. */

const noGpuSwitch = '--collager-no-gpu';

const gpuFallback = process.argv.includes(noGpuSwitch);
if (gpuFallback) app.disableHardwareAcceleration();

/* Resolves once the queued saves have landed, or after this long: a save
 * hung on a failing disk must not keep the app alive without a window. */
const SAVE_FLUSH_TIMEOUT_MS = 5000;
function flushSaves() {
  const deadline = new Promise((resolve) => setTimeout(resolve, SAVE_FLUSH_TIMEOUT_MS));
  return Promise.race([library.flush(), deadline]);
}

let gpuCrashes = 0;
let relaunching = false;
let quitting = false;
let savesFlushed = false;
app.on('before-quit', (event) => {
  quitting = true;
  if (savesFlushed) return;
  // the exit would cut off a save still writing library.json.tmp and lose
  // the batch it carries; the quit goes on once the queue has settled
  event.preventDefault();
  flushSaves().then(() => {
    savesFlushed = true;
    app.quit();
  });
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
  if (gpuCrashes >= 3 && !gpuFallback && !relaunching) {
    relaunching = true;
    const options = buildRelaunchOptions(process.argv, process.env.APPIMAGE, noGpuSwitch);
    flushSaves().then(() => {
      if (quitting) return; // closed by the user meanwhile
      app.relaunch(options);
      app.exit(0);
    });
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
  // no application menu carries devtools, so restore them for development
  win.webContents.on('before-input-event', (_event, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });
  if (gpuFallback) {
    win.webContents.on('did-finish-load', () => win.webContents.send('gpu-fallback'));
  }
  win.webContents.on('did-start-loading', () => {
    openPathsReceiver = null;
  });
  win.webContents.on('did-finish-load', () => {
    openPathsReceiver = win.webContents;
    sendOpenPaths();
  });
  win.on('closed', () => {
    openPathsReceiver = null;
    // a closed page never says to stop, and on macOS the app runs on
    releaseKeepAwake();
  });
  // the e2e harness drives the renderer, and the smoke run reads its ready
  // flag, through a hook app.js only installs when the page is loaded with ?e2e
  const query = process.env.COLLAGER_E2E === '1' || smokeRun ? { e2e: '1' } : {};
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query });
  if (smokeRun) watchSmokeRun(win);
}

app.whenReady().then(() => {
  // the app owns its shortcuts (notably F11, which the default menu would also
  // bind, risking double-toggles). macOS keeps a minimal menu, since without
  // one Cmd+Q, C and V do nothing and the app cannot be quit from the keyboard.
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMacMenuTemplate(APP_NAME)));
  } else {
    Menu.setApplicationMenu(null);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
