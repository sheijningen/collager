const { ipcMain } = require('electron');
const { pathToFileURL } = require('url');
const { probeFiles } = require('../lib/scan');
const { loadAndRepairLibrary } = require('../lib/library');

/* The library channels: scanning and hashing dropped paths, loading and
 * saving the persisted collection. */
function registerLibraryIpc(library) {
  ipcMain.handle('probe-files', async (event, inputPaths) => {
    const probed = await probeFiles(inputPaths, 4, (done, total) => {
      if (!event.sender.isDestroyed()) event.sender.send('probe-progress', { done, total });
    });
    for (const entry of probed.entries) entry.url = pathToFileURL(entry.path).href;
    return probed;
  });

  ipcMain.handle('load-library', () => loadAndRepairLibrary(library));

  ipcMain.handle('save-library', (_event, items) => library.save(items));
}

module.exports = { registerLibraryIpc };
