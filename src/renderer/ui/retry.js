/* ---------------- retrying files that failed ----------------
 * Missing and unshowable files are looked at again on the core/retry.js
 * schedule: the main process stats and, when the content moved, rehashes
 * them, and an unshowable one that is there is decoded off screen. One that
 * is back shows again without any other change on screen. */

import {
  selectDueRetries,
  canStartRetry,
  beginRetry,
  bookNextRetry,
  FIRST_RETRY_MS,
  SLOW_ANSWER_MS,
  SLOW_RETRY_MS
} from '../core/retry.js';
import { MISSING_W, MISSING_H } from '../core/layout.js';
import { dirname, volumeRoot, isUnder, urlForContent } from '../core/paths.js';
import { fileProblem } from '../core/text.js';
import { state, itemsByHash, reindexItems, persist } from './state.js';
import { render, discardTile, queueLibraryOperation } from './collage.js';
import { releaseMedia } from './media.js';

// Every question to the main process holds one of its file threads until the
// file system answers, which a share that is dropping out can take a minute
// over; two at a time leaves the threads the saves need.
const MAX_IN_FLIGHT = 2;
// the main process has just seen the file, so a load still pending by then
// is a very slow read, and the next attempt tries again
const LOAD_TIMEOUT_MS = 20_000;

const schedule = new Map(); // hash -> the booking of its next attempt, see core/retry.js
let workers = 0; // attempts running, over all rounds
// a scope is the volume a folder is on, or the folder itself off any known
// volume: a worker has one to itself, and a slow answer parks one
const busyScopes = new Set();
const parkedScopes = new Map(); // scope -> until when

/* One round: the items due at `now` are looked at again, a volume (or a
 * folder off any known volume) per worker in the places the attempts of
 * earlier rounds leave free, and the changes are shown and saved at the end.
 * Resolves to how many items show again. */
export async function retryFailedFiles(now = Date.now()) {
  flushChanges();
  const due = selectDueRetries(itemsByHash, schedule, now);
  const slots = MAX_IN_FLIGHT - workers;
  if (!due.length || slots <= 0) return 0;
  const failingByFolder = groupByFolder([...itemsByHash.values()].filter(fileProblem));
  const scopes = new Map(); // scope -> folder -> due items
  for (const [folder, items] of groupByFolder(due)) {
    const scope = scopeOf(folder);
    if (parkedScopes.get(scope) > Date.now()) {
      // these failed after the slow answer that parked the volume
      bookAlike(items, null, { slow: true, folderGone: false });
      continue;
    }
    parkedScopes.delete(scope);
    if (!scopes.has(scope)) scopes.set(scope, new Map());
    scopes.get(scope).set(folder, items);
  }
  const pending = [...scopes.keys()];
  let shown = 0;
  async function work() {
    workers++;
    try {
      while (pending.length) {
        const scope = pending.shift();
        if (busyScopes.has(scope)) continue; // another round's worker is on it
        busyScopes.add(scope);
        try {
          // read `shown` after the await: both workers add to it
          const count = await workScope(scope, scopes.get(scope), failingByFolder, now);
          shown += count;
        } finally {
          busyScopes.delete(scope);
        }
      }
    } finally {
      workers--;
    }
  }
  await Promise.all(Array.from({ length: Math.min(slots, pending.length) }, work));
  flushChanges();
  return shown;
}

function scopeOf(folder) {
  return volumeRoot(folder) ?? folder;
}

/* `items` by the folder they are in, folders in order of first appearance. */
function groupByFolder(items) {
  const byFolder = new Map();
  for (const item of items) {
    const folder = dirname(item.path);
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(item);
  }
  return byFolder;
}

/* Attempts the due items of `scope` (`byFolder`: folder -> items) until an
 * answer speaks for more than its file: a folder that is gone with its
 * files ends that folder, a slow answer parks the scope for SLOW_RETRY_MS
 * and ends it. `failingByFolder` indexes every failing item of the library.
 * Resolves to how many items show again. */
async function workScope(scope, byFolder, failingByFolder, now) {
  let shown = 0;
  for (const [folder, items] of byFolder) {
    for (const item of items) {
      if (!canStartRetry(schedule, item.hash, now)) continue;
      const outcome = await retryItem(item);
      if (outcome.cameBack) shown++;
      if (outcome.slow) {
        parkedScopes.set(scope, Date.now() + SLOW_RETRY_MS);
        for (const [other, failing] of failingByFolder) {
          // the slow answer speaks for the volume, a gone folder only for itself
          if (isUnder(other, scope))
            bookAlike(failing, item.hash, { slow: true, folderGone: false });
        }
        return shown;
      }
      if (outcome.folderGone) {
        bookAlike(failingByFolder.get(folder) ?? [], item.hash, outcome);
        break;
      }
    }
  }
  return shown;
}

/* Books the failing `items` without an attempt of their own, as the
 * `outcome` of the attempt on `except` speaks for them; the unshowable ones
 * in a folder that is gone turn missing. One being attempted, or left alone
 * for good, keeps its booking. */
function bookAlike(items, except, outcome) {
  for (const item of items) {
    if (item.hash === except || !stillFailing(item, item.path)) continue;
    const entry = schedule.get(item.hash);
    if (!entry || entry.inFlight || entry.dueAt === Infinity) continue;
    bookNextRetry(schedule, item.hash, Date.now(), { slow: outcome.slow });
    if (outcome.folderGone && item.unshowable) turnMissing(item);
  }
}

/* One attempt for `item`, booked as in flight until it settles. Resolves to
 * its outcome, see lookAgain. */
async function retryItem(item) {
  const hash = item.hash; // the attempt may give the item the hash of new content
  beginRetry(schedule, hash);
  let outcome = { cameBack: false, slow: false, folderGone: false, backOff: false };
  try {
    outcome = await lookAgain(item);
  } finally {
    bookNextRetry(schedule, hash, Date.now(), outcome);
  }
  return outcome;
}

/* Resolves to `{ cameBack, slow, folderGone, backOff }`: whether the file
 * shows again, whether the file system took SLOW_ANSWER_MS or more to find
 * no file (a share that is dropping out; one that finds the file is back,
 * however long it took), whether its folder is gone as well, and whether the
 * answer says the file is not about to come back (gone from a folder that is
 * there, or there but not decodable). */
async function lookAgain(item) {
  const triedPath = item.path;
  const asked = Date.now();
  let report = null;
  try {
    report = await window.api.recheckMediaFile({
      path: triedPath,
      hash: item.hash,
      size: item.size
    });
  } catch {
    // no answer says nothing about the file; the next attempt asks again
  }
  const answerMs = report ? report.statMs : Date.now() - asked;
  const outcome = {
    cameBack: false,
    slow: answerMs >= SLOW_ANSWER_MS && !(report && report.present),
    folderGone: false,
    backOff: false
  };
  if (!report || !stillFailing(item, triedPath)) return outcome;
  if (!report.present) {
    if (item.unshowable) turnMissing(item);
    // null: the stat was too slow to ask about the folder as well
    outcome.folderGone = report.folderPresent === false;
    outcome.backOff = report.folderPresent === true;
    return outcome;
  }
  // a null hash: there, but being written or unreadable right now
  if (report.hash === null) return outcome;
  outcome.cameBack = await showAgain(item, triedPath, report);
  outcome.backOff = !outcome.cameBack;
  return outcome;
}

/* The file is there and hashes to `report.hash`. Resolves to whether the
 * item shows again. */
async function showAgain(item, triedPath, report) {
  if (report.hash !== item.hash) {
    // the file at this path was loaded before, so the new content needs its own URL
    const file = { type: item.type, url: urlForContent(item.url, report.hash), size: report.size };
    file.dimensions = await loadOffScreen(file);
    return queueLibraryOperation(() => replaceContent(item, triedPath, report.hash, file));
  }
  if (item.unshowable) return decodeAgain(item, triedPath);
  return repair(item, triedPath, report);
}

/* Whether `item` still is the entry that was looked at: not removed,
 * re-added from elsewhere or repaired while the question was out. */
function stillFailing(item, triedPath) {
  if (itemsByHash.get(item.hash) !== item || item.path !== triedPath) return false;
  return fileProblem(item) !== null;
}

/* An unshowable item whose file is gone. */
function turnMissing(item) {
  item.unshowable = false;
  item.missing = true;
  showChanged(item.hash, false);
}

/* A missing item whose file is back with the content it was hashed over.
 * The stored dimensions are kept unless they are the fallback of a load
 * that failed; then the file is loaded off screen, and one that does not
 * decode is unshowable. Resolves to whether it shows again. */
async function repair(item, triedPath, report) {
  let dimensions = { w: item.w, h: item.h };
  if (!hasOwnDimensions(item)) {
    dimensions = await loadOffScreen(item);
    if (!stillFailing(item, triedPath)) return false;
  }
  // a file that is back as it was is shown, not saved again
  const changed = item.size !== report.size || item.w !== dimensions?.w || item.h !== dimensions?.h;
  item.missing = false;
  item.size = report.size;
  setDimensions(item, dimensions);
  showChanged(item.hash, changed);
  return dimensions !== null;
}

/* Gives `item` the dimensions a load found, or marks it unshowable when the
 * load found none, leaving the dimensions to a load that succeeds. */
function setDimensions(item, dimensions) {
  if (dimensions === null) {
    item.unshowable = true;
    delete item.w;
    delete item.h;
    return;
  }
  item.unshowable = false;
  item.w = dimensions.w;
  item.h = dimensions.h;
}

function hasOwnDimensions(item) {
  if (!item.w || !item.h) return false;
  return item.w !== MISSING_W || item.h !== MISSING_H;
}

/* An unshowable item whose file is still there: one that decodes now shows
 * again with the dimensions the load found. Resolves to whether it did. */
async function decodeAgain(item, triedPath) {
  const dimensions = await loadOffScreen(item);
  if (!dimensions || !stillFailing(item, triedPath)) return false;
  item.unshowable = false;
  item.w = dimensions.w;
  item.h = dimensions.h;
  showChanged(item.hash, true);
  return true;
}

/* Resolves to the file's native dimensions, or null on error or after
 * LOAD_TIMEOUT_MS. A video counts once its first frame decodes. */
function loadOffScreen(item) {
  return new Promise((resolve) => {
    let media;
    const timeout = setTimeout(() => settle(null), LOAD_TIMEOUT_MS);
    const settle = (dimensions) => {
      clearTimeout(timeout);
      releaseMedia(media);
      resolve(dimensions);
    };
    if (item.type === 'video') {
      media = document.createElement('video');
      media.preload = 'auto';
      media.muted = true;
      media.onloadeddata = () => {
        settle({ w: media.videoWidth || MISSING_W, h: media.videoHeight || MISSING_H });
      };
    } else {
      media = new Image();
      media.onload = () => settle({ w: media.naturalWidth, h: media.naturalHeight });
    }
    media.onerror = () => settle(null);
    media.src = item.url;
  });
}

/* The path of `item` holds other content now, `file` (url, size,
 * dimensions) hashing to `hash`: it takes the entry's place, or merges into
 * the item already holding it. Runs on the library queue, as an add in
 * flight dedups against the hashes it saw. Resolves to whether an item shows
 * again. */
function replaceContent(item, triedPath, hash, file) {
  if (!stillFailing(item, triedPath)) return false;
  const oldHash = item.hash;
  let shown = item;
  const existing = itemsByHash.get(hash);
  if (existing) {
    state.items.splice(state.items.indexOf(item), 1);
    shown = fileProblem(existing) ? existing : null;
    if (shown) {
      shown.path = triedPath;
      shown.url = file.url;
      showChanged(shown.hash, true);
    }
  } else {
    item.hash = hash;
    item.url = file.url;
  }
  reindexItems();
  if (shown) {
    shown.missing = false;
    shown.size = file.size;
    setDimensions(shown, file.dimensions);
  }
  showChanged(oldHash, true);
  return shown !== null && file.dimensions !== null;
}

/* ---------------- showing and saving the changes ----------------
 * What the attempts change is collected and shown together at the start and
 * the end of a round, so the files that come back in one round do not each
 * repack the collage and write the library. */

const staleTiles = new Set(); // hashes whose tile shows a state the item has left
let saveDue = false;

function showChanged(hash, save) {
  staleTiles.add(hash);
  if (save) saveDue = true;
}

function flushChanges() {
  if (!staleTiles.size) return;
  for (const hash of staleTiles) discardTile(hash); // the render builds the tile anew
  staleTiles.clear();
  render();
  if (saveDue) persist();
  saveDue = false;
}

const timer = setInterval(() => {
  retryFailedFiles().catch((err) => console.error('Failed to retry files', err));
}, FIRST_RETRY_MS);

/* Stops the timed rounds; retryFailedFiles still runs one on demand. */
export function stopRetrying() {
  clearInterval(timer);
}
