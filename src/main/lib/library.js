const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/* The on-disk format is `{ version, items }`. Bumping LIBRARY_VERSION goes
 * with a new entry in MIGRATIONS that turns a document of the previous
 * version into the next one; the very first format, a bare array of items,
 * is read as version 0. */
const LIBRARY_VERSION = 1;

const MIGRATIONS = [
  // 0 -> 1: the bare array becomes the items field of a versioned document
  (document) => ({ version: 1, items: document.items })
];

// a bump without its step would read every existing library as unreadable
if (MIGRATIONS.length !== LIBRARY_VERSION) {
  throw new Error('MIGRATIONS must have one step per library version');
}

/* Why a library file could not be loaded: `unreadable` for damaged or foreign
 * content, `newer-version` for a valid file written by a newer app. */
class UnreadableLibraryError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

/* Runs the steps from the document's version up to targetVersion. Each step
 * takes the previous document and returns the next; the version field is set
 * afterwards so the result is authoritative whatever a step wrote. */
function migrateDocument(document, migrations, targetVersion) {
  let current = document;
  for (let version = current.version; version < targetVersion; version++) {
    current = migrations[version](current);
  }
  current.version = targetVersion;
  return current;
}

/* Parses a library file into the current document shape. Every way the file
 * can be unusable leaves through an UnreadableLibraryError, so the caller
 * moves the file aside exactly when this throws. Entries need a path and a
 * hash (the hash is the item identity everywhere); a repeated hash keeps its
 * first entry only. */
function readLibraryDocument(raw) {
  let document;
  try {
    document = JSON.parse(raw);
  } catch (err) {
    throw new UnreadableLibraryError('unreadable', err.message);
  }
  if (Array.isArray(document)) document = { version: 0, items: document };
  if (!document || typeof document !== 'object') {
    throw new UnreadableLibraryError('unreadable', 'library is not an object');
  }
  if (!Number.isInteger(document.version) || document.version < 0) {
    throw new UnreadableLibraryError('unreadable', 'library has no valid version');
  }
  if (document.version > LIBRARY_VERSION) {
    throw new UnreadableLibraryError(
      'newer-version',
      `library version ${document.version} is newer than this app`
    );
  }
  document = migrateDocument(document, MIGRATIONS, LIBRARY_VERSION);
  if (!Array.isArray(document.items)) {
    throw new UnreadableLibraryError('unreadable', 'library items is not an array');
  }
  const seen = new Set();
  const items = [];
  for (const item of document.items) {
    const valid =
      item &&
      typeof item === 'object' &&
      typeof item.path === 'string' &&
      item.path &&
      typeof item.hash === 'string' &&
      item.hash;
    if (!valid) throw new UnreadableLibraryError('unreadable', 'malformed library entry');
    if (seen.has(item.hash)) continue;
    seen.add(item.hash);
    items.push(item);
  }
  document.items = items;
  return document;
}

/**
 * Persistence for the collage library. `getDir` is called lazily so the
 * store can be created before Electron's userData path is known.
 * Saves are serialized and written atomically (tmp file + rename) so a
 * crash mid-write or two overlapping saves can never truncate the library.
 * An unreadable file is moved aside under a name that is never reused, so no
 * later problem can overwrite it. A file from a newer app is left where it
 * is, since that app still needs it. In both cases where the file stays in
 * place, saving is refused so it is not overwritten.
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
        await fsp.copyFile(libraryFile(), target, fs.constants.COPYFILE_EXCL);
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
    /* Resolves to the items plus `problem`: null when the file loaded (or
     * did not exist yet), otherwise `{ reason, backup }` with the backup path
     * or null when the file stays in place (newer version, or the move
     * failed), which also blocks saving. */
    async load() {
      let raw;
      try {
        raw = await fsp.readFile(libraryFile(), 'utf8');
      } catch {
        return { items: [], problem: null }; // no library yet
      }
      let items;
      try {
        items = readLibraryDocument(raw).items;
      } catch (err) {
        const reason = err instanceof UnreadableLibraryError ? err.reason : 'unreadable';
        const backup = reason === 'newer-version' ? null : await moveAside();
        saveBlockedBy = backup === null ? libraryFile() : null;
        return { items: [], problem: { reason, backup } };
      }
      saveBlockedBy = null;
      await Promise.all(
        items.map(async (item) => {
          item.missing = await fsp.access(item.path).then(
            () => false,
            () => true
          );
          item.url = pathToFileURL(item.path).href;
        })
      );
      return { items, problem: null };
    },

    save(items) {
      if (saveBlockedBy !== null) {
        return Promise.reject(
          new Error(`not saving: the library at ${saveBlockedBy} must stay as it is`)
        );
      }
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
          const document = { version: LIBRARY_VERSION, items: persisted };
          await fsp.writeFile(tmp, JSON.stringify(document, null, 1), 'utf8');
          await fsp.rename(tmp, libraryFile());
        });
      return saveChain;
    }
  };
}

module.exports = {
  createLibraryStore,
  readLibraryDocument,
  migrateDocument,
  UnreadableLibraryError,
  LIBRARY_VERSION,
  MIGRATIONS
};
