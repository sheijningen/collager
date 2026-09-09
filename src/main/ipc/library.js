const { ipcMain } = require('electron');
const { pathToFileURL } = require('url');
const { probeFiles } = require('../lib/scan');

/* The library channels: scanning and hashing dropped paths, loading and
 * saving the persisted collection. */
function registerLibraryIpc(library) {
  ipcMain.handle('probe-files', async (event, inputPaths) => {
    const { entries, skippedCount } = await probeFiles(inputPaths, 4, (done, total) => {
      if (!event.sender.isDestroyed()) event.sender.send('probe-progress', { done, total });
    });
    for (const entry of entries) entry.url = pathToFileURL(entry.path).href;
    return { entries, skippedCount };
  });

  ipcMain.handle('load-library', () => library.load());

  ipcMain.handle('save-library', (_event, items) => library.save(items));
}

module.exports = { registerLibraryIpc };
