const { ipcMain, BrowserWindow, dialog, shell } = require('electron');
const { MEDIA_EXTS } = require('../lib/scan');
const { isMediaFile, existingMediaFolder } = require('../lib/mediapath');

/* Shows the file selected in the file manager. A missing library entry has
 * no file to select, so its folder is opened instead, which still tells the
 * user where it used to be. Anything else is ignored. */
async function revealFile(filePath) {
  if (await isMediaFile(filePath)) {
    shell.showItemInFolder(filePath);
    return;
  }
  const folder = await existingMediaFolder(filePath);
  if (folder !== null) await shell.openPath(folder);
}

/* Channels that touch files outside the app: the open dialog and the file
 * manager. A path coming back from the renderer reaches the shell only after
 * the checks in lib/mediapath.js. */
function registerFilesIpc() {
  ipcMain.handle('pick-files', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Add media',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Media', extensions: Object.keys(MEDIA_EXTS).map((ext) => ext.slice(1)) }]
    });
    return result.canceled ? [] : result.filePaths;
  });

  // fire-and-forget channel: a failure here has nothing to report back to
  ipcMain.on('reveal-file', (_event, filePath) => {
    revealFile(filePath).catch(() => {});
  });
}

module.exports = { registerFilesIpc };
