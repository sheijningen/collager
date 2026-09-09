const fsp = require('fs').promises;
const path = require('path');
const { pathToFileURL } = require('url');

/**
 * Persistence for the collage library. `getDir` is called lazily so the
 * store can be created before Electron's userData path is known.
 * Saves are serialized and written atomically (tmp file + rename) so a
 * crash mid-write or two overlapping saves can never truncate the library.
 * A corrupt library file is backed up instead of being silently replaced.
 */
function createLibraryStore(getDir) {
  const libraryFile = () => path.join(getDir(), 'library.json');
  let saveChain = Promise.resolve();

  return {
    async load() {
      let raw;
      try {
        raw = await fsp.readFile(libraryFile(), 'utf8');
      } catch {
        return { items: [], corrupted: false }; // no library yet
      }
      let items;
      try {
        items = JSON.parse(raw);
        if (!Array.isArray(items)) throw new Error('library is not an array');
        for (const item of items) {
          // malformed entries must hit the backup path too — throwing later
          // (outside this catch) would skip the backup and risk data loss
          if (!item || typeof item !== 'object' || typeof item.path !== 'string' || !item.path) {
            throw new Error('malformed library entry');
          }
        }
      } catch {
        try {
          await fsp.copyFile(libraryFile(), libraryFile() + '.corrupt');
        } catch {}
        return { items: [], corrupted: true };
      }
      await Promise.all(
        items.map(async (item) => {
          item.missing = await fsp.access(item.path).then(
            () => false,
            () => true
          );
          item.url = pathToFileURL(item.path).href;
        })
      );
      return { items, corrupted: false };
    },

    save(items) {
      const persisted = items.map(({ path: p, hash, type, w, h }) => ({
        path: p,
        hash,
        type,
        w,
        h
      }));
      saveChain = saveChain
        .catch(() => {})
        .then(async () => {
          await fsp.mkdir(getDir(), { recursive: true });
          const tmp = libraryFile() + '.tmp';
          await fsp.writeFile(tmp, JSON.stringify(persisted, null, 1), 'utf8');
          await fsp.rename(tmp, libraryFile());
        });
      return saveChain;
    }
  };
}

module.exports = { createLibraryStore };
