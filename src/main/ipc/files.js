const { ipcMain, BrowserWindow, dialog, shell } = require('electron');
const { MEDIA_EXTS } = require('../lib/scan');
const { isMediaFile, existingMediaFolder } = require('../lib/mediapath');
const { inspectMediaFile } = require('../lib/inspect');

/* Shows the file selected in the file manager. A missing library entry has
 * no file to select, so its folder is opened instead, which still tells the
 * user where it used to be. Resolves to an empty string on success, otherwise
 * the reason: the renderer only ever sends a library path, so a folder that
 * cannot be resolved means the file's folder is gone as well. */
async function revealFile(filePath) {
  if (await isMediaFile(filePath)) {
    shell.showItemInFolder(filePath);
    return '';
  }
  const folder = await existingMediaFolder(filePath);
  if (folder === null) return 'its folder is gone as well';
  return shell.openPath(folder);
}

/* Channels that touch files outside the app: the open dialog, the file
 * manager and the desktop's default application. A path coming back from the
 * renderer reaches the shell only after the checks in lib/mediapath.js. */
function registerFilesIpc() {
  /* Resolves to the chosen paths, none when the dialog was cancelled. */
  async function pickPaths(event, options) {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, options);
    return result.canceled ? [] : result.filePaths;
  }

  ipcMain.handle('pick-files', (event) =>
    pickPaths(event, {
      title: 'Add media',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Media', extensions: Object.keys(MEDIA_EXTS).map((ext) => ext.slice(1)) }]
    })
  );

  // files and folders cannot share one dialog on Linux and Windows
  ipcMain.handle('pick-folders', (event) =>
    pickPaths(event, {
      title: 'Add a folder',
      properties: ['openDirectory']
    })
  );

  ipcMain.handle('reveal-file', (_event, filePath) => revealFile(filePath));

  // tells the renderer whether a file that failed to load is gone or there
  // but unreadable or undecodable, with what the OS found for the user to
  // read; a path without a media extension is not looked at
  ipcMain.handle('inspect-media-file', (_event, filePath) => inspectMediaFile(filePath));

  /* Opens a media file in whatever the desktop associates with its type.
   * Resolves to an empty string on success, otherwise the reason. */
  ipcMain.handle('open-externally', async (_event, filePath) => {
    if (!(await isMediaFile(filePath))) return 'not a media file';
    return shell.openPath(filePath);
  });
}

module.exports = { registerFilesIpc };
