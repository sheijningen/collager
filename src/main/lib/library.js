const fsp = require('fs').promises;
const path = require('path');
const { pathToFileURL } = require('url');
const { MEDIA_EXTS, rehashStaleItems } = require('./scan');

const MEDIA_TYPES = new Set(Object.values(MEDIA_EXTS));

/* Whether `item` is an entry the library can hold: a path, a hash (the item
 * identity everywhere) and one of the media types. */
function isLibraryEntry(item) {
  return Boolean(
    item &&
    typeof item === 'object' &&
    typeof item.path === 'string' &&
    item.path &&
    typeof item.hash === 'string' &&
    item.hash &&
    MEDIA_TYPES.has(item.type)
  );
}

/* Parses a library file into its items. Every way the file can be unusable
 * throws, so the caller moves the file aside exactly when this does; a
 * repeated hash keeps its first entry only. */
function readLibraryItems(raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('library is not an array');
  const seen = new Set();
  const items = [];
  for (const item of parsed) {
    if (!isLibraryEntry(item)) throw new Error('malformed library entry');
    if (seen.has(item.hash)) continue;
    seen.add(item.hash);
    items.push(item);
  }
  return items;
}

/**
 * Persistence for the collage library. `getDir` is called lazily so the
 * store can be created before Electron's userData path is known.
 * Saves are serialized and written atomically (tmp file + rename) so a
 * crash mid-write or two overlapping saves can never truncate the library.
 * An unreadable file is moved aside under a name that is never reused, so no
 * later problem can overwrite it. When the move fails, or the file cannot be
 * read at all, it stays in place and saving is refused so it is not
 * overwritten.
 */
function createLibraryStore(getDir) {
  const libraryFile = () => path.join(getDir(), 'library.json');
  let saveChain = Promise.resolve();
  let saveBlockedBy = null; // the unreadable file still in place, or null

  /* Moves the unreadable library to library.json.corrupt, or to a
   * timestamped (and if needed numbered) name when that already holds an
   * earlier backup. Resolves to the backup path, or null when the file could
   * not be moved. */
  async function moveAside() {
    const base = `${libraryFile()}.corrupt`;
    const stamp = Date.now();
    for (let attempt = 0; attempt < 10; attempt++) {
      const target = attempt === 0 ? base : `${base}.${stamp}${attempt > 1 ? `-${attempt}` : ''}`;
      try {
        await fsp.copyFile(libraryFile(), target, fsp.constants.COPYFILE_EXCL);
      } catch (err) {
        if (err && err.code === 'EEXIST') continue;
        return null;
      }
      try {
        await fsp.unlink(libraryFile());
      } catch {}
      return target;
    }
    return null;
  }

  return {
    /* Resolves to the items, `sizeOnDisk` (the current byte size of every
     * item whose file is present, from the one stat that also decides
     * `missing`), and `problem`: null when the file loaded (or did not exist
     * yet), otherwise `{ backup }` with the backup path, or null when the
     * file stays in place because it could not be moved or not be read at
     * all, which also blocks saving. */
    async load() {
      let raw;
      try {
        raw = await fsp.readFile(libraryFile(), 'utf8');
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          saveBlockedBy = null;
          return { items: [], sizeOnDisk: new Map(), problem: null }; // no library yet
        }
        // a file that is there but cannot be read (permissions, a directory
        // in its place, a failing disk) holds a library, so it is left alone
        saveBlockedBy = libraryFile();
        return { items: [], sizeOnDisk: new Map(), problem: { backup: null } };
      }
      let items;
      try {
        items = readLibraryItems(raw);
      } catch {
        const backup = await moveAside();
        saveBlockedBy = backup === null ? libraryFile() : null;
        return { items: [], sizeOnDisk: new Map(), problem: { backup } };
      }
      saveBlockedBy = null;
      const sizeOnDisk = new Map();
      await Promise.all(
        items.map(async (item) => {
          try {
            sizeOnDisk.set(item, (await fsp.stat(item.path)).size);
            item.missing = false;
          } catch {
            item.missing = true;
          }
          item.url = pathToFileURL(item.path).href;
        })
      );
      return { items, sizeOnDisk, problem: null };
    },

    save(items) {
      if (saveBlockedBy !== null) {
        return Promise.reject(
          new Error(`not saving: the library at ${saveBlockedBy} must stay as it is`)
        );
      }
      // the rule the load applies, so a renderer bug cannot write a file that
      // the next start would move aside as unreadable
      if (!items.every(isLibraryEntry)) {
        return Promise.reject(new Error('not saving: malformed library entry'));
      }
      const persisted = items.map(({ path: filePath, hash, type, size, w, h }) => ({
        path: filePath,
        hash,
        type,
        size,
        w,
        h
      }));
      saveChain = saveChain
        .catch(() => {})
        .then(async () => {
          await fsp.mkdir(getDir(), { recursive: true });
          const tmp = libraryFile() + '.tmp';
          // synced before the rename, or a power cut could commit the rename
          // with the content still in the page cache and leave a short file;
          // a filesystem that refuses the sync still gets the atomic rename
          const handle = await fsp.open(tmp, 'w');
          try {
            await handle.writeFile(JSON.stringify(persisted, null, 1), 'utf8');
            try {
              await handle.sync();
            } catch {}
          } finally {
            await handle.close();
          }
          await fsp.rename(tmp, libraryFile());
        });
      return saveChain;
    }
  };
}

/* The startup load: reads the library from `store`, brings stale entries up
 * to date and writes the result back when anything changed. A failed save
 * must not fail the load, so it is logged and the pass simply runs again on
 * the next start. Resolves to the items, the load `problem`, and how many
 * entries collapsed into another. */
async function loadAndRepairLibrary(store) {
  const loaded = await store.load();
  const { items, collapsed, changed } = await rehashStaleItems(loaded.items, loaded.sizeOnDisk);
  if (changed) {
    try {
      await store.save(items);
    } catch (err) {
      console.error('Failed to save the repaired library', err);
    }
  }
  return { items, problem: loaded.problem, collapsed };
}

module.exports = { createLibraryStore, readLibraryItems, loadAndRepairLibrary };
