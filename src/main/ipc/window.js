const { ipcMain, BrowserWindow, powerSaveBlocker } = require('electron');
const path = require('path');

/* Window and app-level channels: fullscreen, the display-sleep blocker and
 * the metadata shown in the About overlay. */
function registerWindowIpc() {
  ipcMain.on('toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.handle('is-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isFullScreen() : false;
  });

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

  /* About data for the renderer. Resolved relative to this file, not
   * getAppPath(), which points at test/e2e under the e2e harness. */
  ipcMain.handle('get-app-info', () => {
    const pkg = require(path.join(__dirname, '..', '..', '..', 'package.json'));
    return {
      name: (pkg.build && pkg.build.productName) || pkg.name,
      version: pkg.version,
      description: pkg.description,
      author: typeof pkg.author === 'object' ? pkg.author.name : pkg.author,
      license: pkg.license
    };
  });
}

module.exports = { registerWindowIpc };
