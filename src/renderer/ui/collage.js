/* The collage itself: masonry rendering, tile lifecycle, viewport-based
 * media hydration, dimension measuring, the library operations that mutate
 * the items (add/remove/shuffle) and the toolbar buttons that trigger them. */

import {
  packItems,
  packClones,
  shuffleItems,
  reconcileOrder,
  clampColumns,
  GAP,
  MISSING_W,
  MISSING_H,
  MIN_COLUMNS,
  MAX_COLUMNS,
  DEFAULT_COLUMNS
} from '../core/layout.js';
import { basename } from '../core/paths.js';
import { runWithConcurrency } from '../core/concurrency.js';
import {
  formatCount,
  describeAddOutcome,
  describeProbeProgress,
  describeRemoval,
  fileProblem,
  tileLabel,
  hintForFileProblem,
  describePlayerError,
  describeLoadError,
  clearMissingLabel
} from '../core/text.js';
import {
  state,
  selected,
  itemsByHash,
  reindexItems,
  tiles,
  cloneTiles,
  lastPositions,
  scroller,
  collage,
  emptyState,
  itemCount,
  prefs,
  showToast,
  persist,
  countMissing,
  runOrToast
} from './state.js';
import { createMediaElement, releaseMedia } from './media.js';
import { handleSelectClick, renderList } from './panel.js';
import { openCtxMenu, closeCtxMenu, ctxAnchoredTo } from './ctxmenu.js';
import { openLightbox } from './lightbox.js';
import { lastDragEndAt } from './tiledrag.js';
import { startJob } from './status.js';

/* ---------------- columns setting ---------------- */

export let columns = prefs.int('columns', DEFAULT_COLUMNS, MIN_COLUMNS, MAX_COLUMNS);
const columnCount = document.getElementById('col-count');
columnCount.textContent = String(columns);

export function setColumns(count) {
  const next = clampColumns(count);
  if (next === columns) return;
  columns = next;
  prefs.set('columns', columns);
  columnCount.textContent = String(columns);
  render();
}

/* ---------------- media hydration (resource limiting) ----------------
 * Tiles are bare divs until they come near the viewport; only then is the
 * <img>/<video> created. Scrolled far away again, the media element is torn
 * down so decoded frames, video decoders and network buffers are released.
 */

export const HYDRATE_MARGIN = 800; // px; how far outside the viewport media stays loaded
const MIN_LAYOUT_WIDTH = 100; // px; a collapsed window still gets a layout
const DRAG_CLICK_WINDOW_MS = 400; // a click this soon after a drag is part of it
const MEASURE_CONCURRENCY = 8; // metadata loads in flight at once

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) hydrate(entry.target);
      else dehydrate(entry.target);
    }
  },
  { root: scroller, rootMargin: `${HYDRATE_MARGIN}px 0px` }
);

function hydrate(tile) {
  if (tile.dataset.hydrated === '1') return;
  const item = itemsByHash.get(tile.dataset.hash);
  if (!item || fileProblem(item)) return;
  const media = createMediaElement(item);
  if (media.tagName === 'VIDEO') media.playsInline = true;
  // a tile image may appear a frame late rather than hold the frame while it decodes
  if (media.tagName === 'IMG') media.decoding = 'async';
  media.draggable = false;
  media.addEventListener('error', () => {
    // a video says why it failed, an image does not
    const playerError = media.error ? describePlayerError(media.error) : '';
    // a clone's media may have moved to the real tile at a wrap
    if (media.parentElement) dehydrate(media.parentElement);
    recordLoadFailure(item, playerError);
  });
  tile.appendChild(media);
  tile.dataset.hydrated = '1';
}

/* A file that failed to load is either gone since the startup check
 * (deleted, drive unplugged) or present in a shape Chromium cannot decode.
 * Only the main process can tell, and the two get different tiles, hints and
 * menus: re-adding repairs a missing entry, while an unshowable one comes
 * back only when a retry decodes it. What the main process found, and what
 * the player said, go into the hint. The render rebuilds the tile, the panel
 * entry and the missing count. */
async function recordLoadFailure(item, playerError) {
  const failedPath = item.path;
  let report;
  try {
    report = await window.api.inspectMediaFile(failedPath);
  } catch {
    // without an answer the file is not declared missing, since that tile
    // offers to clear an entry whose file may well be on disk; unshowable
    // keeps every action that does not decode it and is never saved
    report = { present: true, detail: '' };
  }
  // removed, repaired or already judged while the question was out
  if (itemsByHash.get(item.hash) !== item) return;
  if (item.path !== failedPath || fileProblem(item)) return;
  if (report.present) item.unshowable = true;
  else item.missing = true;
  item.loadError = describeLoadError({ player: playerError, file: report.detail });
  discardTile(item.hash);
  render();
}

function dehydrate(tile) {
  if (tile.dataset.hydrated !== '1') return;
  const media = tile.querySelector('img, video');
  if (media) releaseMedia(media);
  tile.dataset.hydrated = '0';
}

/* Takes the item's tile and its clone out of the collage and the indexes,
 * releasing their media first. */
export function discardTile(hash) {
  removeTile(tiles, hash);
  removeTile(cloneTiles, hash);
}

function removeTile(index, hash) {
  const tile = index.get(hash);
  if (!tile) return;
  observer.unobserve(tile);
  dehydrate(tile);
  tile.remove();
  index.delete(hash);
}

/* ---------------- wrap region ----------------
 * While auto-scroll loops, clone tiles below the collage show the first rows
 * of the next loop, and the tick scrolls up by wrapHeight once it reaches
 * them: the frame after that shows the same picture from the real tiles. */

let wrapEnabled = false;
let shuffleOnWrap = false;
let nextOrder = null; // with shuffleOnWrap, the order the clones show and the wrap applies
/** distance from where an item lands after the wrap down to its clone; 0
 * while there are no clones */
export let wrapHeight = 0;

/* Builds the wrap region at every render while `enabled` and the collage is
 * taller than the viewport, with a shuffled next loop when `shuffled`.
 * Disabled while the viewport is past wrapHeight, it wraps first; disabled
 * with clones still on screen, the region lingers until the viewport leaves
 * it. Either way the screen keeps its picture. */
export function setWrapRegion(enabled, shuffled) {
  if (enabled === wrapEnabled && shuffled === shuffleOnWrap) return;
  wrapEnabled = enabled;
  shuffleOnWrap = shuffled;
  if (!shuffled) nextOrder = null;
  if (!enabled && wrapHeight > 0 && scroller.scrollTop >= wrapHeight) {
    wrapInPlace();
    return;
  }
  render();
}

/* Wraps and scrolls up by the same distance, so the screen keeps its picture. */
function wrapInPlace() {
  const top = scroller.scrollTop - wrapHeight;
  wrapHeight = 0; // so the render in wrapCollage keeps no disabled region
  wrapCollage();
  scroller.scrollTop = top;
}

// a lingering region goes once the viewport leaves it, and a viewport
// scrolled on past wrapHeight wraps
scroller.addEventListener(
  'scroll',
  () => {
    if (wrapEnabled || wrapHeight === 0) return;
    if (scroller.scrollTop >= wrapHeight) {
      wrapInPlace();
      return;
    }
    if (scroller.scrollTop + scroller.clientHeight > wrapHeight) return;
    render();
  },
  { passive: true }
);

/* Makes the clones the top of the collage: their order becomes the collage
 * order and their loaded media move into the real tiles, which then show
 * the clones' picture wrapHeight further up without loading anything. */
export function wrapCollage() {
  const reordered = nextOrder !== null;
  if (reordered) {
    // a retry round changes the items in place and renders only at its end,
    // so an item merged away in the meantime must not come back here
    state.items = reconcileOrder(nextOrder, state.items);
    nextOrder = null;
  }
  for (const [hash, clone] of cloneTiles) {
    const tile = tiles.get(hash);
    const media = clone.querySelector('img, video');
    if (!tile || !media) continue;
    const own = tile.querySelector('img, video');
    if (own) releaseMedia(own);
    tile.appendChild(media); // a move within the document keeps a video playing
    tile.dataset.hydrated = '1';
    clone.dataset.hydrated = '0';
    // the observer reports only crossings, so a clone that stays within the
    // margin through the wrap (a collage not much taller than the window)
    // would stay empty; observing it anew reports where it is now
    observer.unobserve(clone);
    observer.observe(clone);
  }
  render();
  if (reordered) persist();
}

/* The order of the next loop. A shuffled one is kept across renders and
 * follows the library's changes without reshuffling, so the clones do not
 * rearrange under the viewer. */
function prepareNextOrder() {
  if (!shuffleOnWrap) return state.items;
  nextOrder =
    nextOrder === null ? shuffleItems(state.items) : reconcileOrder(nextOrder, state.items);
  return nextOrder;
}

/* Moves the tile `index` holds for the item at `pos` there, building it
 * first if needed. */
function placeTile(index, pos) {
  let tile = index.get(pos.item.hash);
  if (!tile) {
    tile = createTile(pos.item);
    if (pos.clone) tile.classList.add('clone');
    index.set(pos.item.hash, tile);
    collage.appendChild(tile);
    observer.observe(tile);
  }
  tile.style.transform = `translate(${pos.x + GAP}px, ${pos.y + GAP}px)`;
  tile.style.width = `${pos.w}px`;
  tile.style.height = `${pos.h}px`;
}

/* ---------------- rendering ---------------- */

export function render() {
  reindexItems();
  const width = Math.max(scroller.clientWidth - GAP * 2, MIN_LAYOUT_WIDTH);
  const { positions, height } = packItems(state.items, width, columns);
  const viewport = scroller.clientHeight;
  let wrap = null;
  // a collage that fits the viewport does not scroll, so it gets no clones
  if ((wrapEnabled || wrapHeight > 0) && height + GAP > viewport) {
    wrap = packClones(prepareNextOrder(), width, columns, height, viewport + HYDRATE_MARGIN);
  }
  // a disabled region lingers until the viewport has left it
  if (!wrapEnabled && wrap && scroller.scrollTop + viewport <= wrap.wrapHeight) wrap = null;
  if (wrap) {
    wrapHeight = wrap.wrapHeight;
    // the scroll range must reach wrapHeight even below a short clone region
    collage.style.height = `${wrapHeight + Math.max(wrap.height + GAP, viewport)}px`;
  } else {
    wrapHeight = 0;
    nextOrder = null;
    collage.style.height = `${height + GAP}px`;
  }

  const seen = new Set();
  lastPositions.clear();
  for (const pos of positions) {
    seen.add(pos.item.hash);
    lastPositions.set(pos.item.hash, pos);
    placeTile(tiles, pos);
  }
  const cloneSeen = new Set();
  for (const pos of wrap ? wrap.positions : []) {
    cloneSeen.add(pos.item.hash);
    placeTile(cloneTiles, pos);
  }
  for (const hash of [...tiles.keys()]) {
    if (!seen.has(hash)) discardTile(hash);
  }
  for (const hash of [...cloneTiles.keys()]) {
    if (!cloneSeen.has(hash)) removeTile(cloneTiles, hash);
  }
  // the layout just moved every tile, so a menu opened on one now sits over
  // whatever took its place
  if (ctxAnchoredTo('tile')) closeCtxMenu();
  // the selection must never reference items that are gone
  for (const hash of selected) {
    if (!seen.has(hash)) selected.delete(hash);
  }
  if (state.selectionAnchor !== null && !seen.has(state.selectionAnchor)) {
    state.selectionAnchor = null;
  }
  const count = state.items.length;
  itemCount.textContent = count ? formatCount(count, 'item') : '';
  emptyState.hidden = count > 0;
  updateClearMissingBtn();
  renderList();
}

/* only visible while something is actually missing */
const clearMissingBtn = document.getElementById('btn-clear-missing');
const missingBadge = document.getElementById('missing-badge');

function updateClearMissingBtn() {
  const count = countMissing();
  clearMissingBtn.hidden = count === 0;
  clearMissingBtn.textContent = clearMissingLabel(count);
  // the button sits in the Collage menu, so the menu button carries the warning
  missingBadge.hidden = count === 0;
  if (count) missingBadge.title = `${formatCount(count, 'file')} missing`;
}

function createTile(item) {
  const problem = fileProblem(item);
  const tile = document.createElement('div');
  tile.className =
    'tile' + (problem ? ` ${problem}` : '') + (selected.has(item.hash) ? ' selected' : '');
  tile.dataset.hash = item.hash;
  tile.dataset.hydrated = '0';

  const label = document.createElement('div');
  label.className = 'placeholder-label';
  label.textContent = tileLabel(item, basename(item.path));
  tile.appendChild(label);
  if (problem) tile.title = hintForFileProblem(problem, item.loadError);

  const remove = document.createElement('button');
  remove.className = 'btn-remove';
  remove.title = 'Remove from collage';
  remove.textContent = '✕';
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    removeItems((candidate) => candidate.hash !== item.hash);
  });
  tile.appendChild(remove);

  tile.addEventListener('click', (event) => handleSelectClick(item.hash, event, 'tile'));
  tile.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openCtxMenu(item, event.clientX, event.clientY, 'tile');
  });
  tile.addEventListener('dblclick', () => {
    // a drag's synthetic click counts toward double-click detection; don't
    // let drag-then-quick-click open the lightbox
    if (performance.now() - lastDragEndAt < DRAG_CLICK_WINDOW_MS) return;
    if (!fileProblem(item)) openLightbox(item);
  });
  return tile;
}

/* ---------------- toolbar buttons ---------------- */

document.getElementById('btn-add').addEventListener('click', async () => {
  const paths = await runOrToast(() => window.api.pickFiles(), 'Could not open the file dialog');
  if (paths) addPaths(paths);
});
document.getElementById('btn-add-folder').addEventListener('click', async () => {
  const paths = await runOrToast(
    () => window.api.pickFolders(),
    'Could not open the folder dialog'
  );
  if (paths) addPaths(paths);
});
document.getElementById('btn-empty-add').addEventListener('click', (event) => {
  // a focused button would claim Space and Enter from the shortcuts
  if (event.detail) event.currentTarget.blur();
  document.getElementById('btn-add').click();
});
document.getElementById('btn-shuffle').addEventListener('click', () => shuffle());
document.getElementById('btn-col-minus').addEventListener('click', () => setColumns(columns - 1));
document.getElementById('btn-col-plus').addEventListener('click', () => setColumns(columns + 1));
document.getElementById('btn-clear').addEventListener('click', () => clearAll());
clearMissingBtn.addEventListener('click', () => clearMissing());

/* ---------------- library operations ---------------- */

/* Drops every item `keep` rejects, then renders and saves. The render prunes
 * the selection of whatever went. Returns how many items went. */
export function removeItems(keep) {
  const before = state.items.length;
  state.items = state.items.filter(keep);
  render();
  persist();
  return before - state.items.length;
}

/* Asks before removing `subject` ("all 12 items"). One question at a time:
 * the box does not block input until it is mapped, and a second click in
 * that gap would ask again over an already emptied selection. A question
 * that cannot be asked counts as answered no. */
let removalQuestionOpen = false;
export async function askRemoval(subject) {
  if (removalQuestionOpen) return false;
  removalQuestionOpen = true;
  try {
    const answer = await runOrToast(
      () => window.api.confirmRemoval(describeRemoval(subject)),
      'Could not ask before removing, so nothing was removed'
    );
    return answer === true;
  } finally {
    removalQuestionOpen = false;
  }
}

export async function clearAll() {
  const count = state.items.length;
  if (!count) return;
  if (!(await askRemoval(`all ${formatCount(count, 'item')}`))) return;
  const removed = removeItems(() => false);
  showToast(`Cleared ${formatCount(removed, 'item')}`);
}

export async function clearMissing() {
  const count = countMissing();
  if (!count) return;
  if (!(await askRemoval(formatCount(count, 'missing file')))) return;
  const removed = removeItems((item) => !item.missing);
  showToast(`Removed ${formatCount(removed, 'missing file')}`);
}

export function shuffle() {
  state.items = shuffleItems(state.items);
  render();
  persist();
}

/* Measure native dimensions by loading metadata only (no layout impact). */
function measureItem(item) {
  const url = item.url;
  return new Promise((resolve) => {
    if (item.type === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => {
        resolve({ w: video.videoWidth || MISSING_W, h: video.videoHeight || MISSING_H });
        releaseMedia(video);
      };
      video.onerror = () => resolve({ w: MISSING_W, h: MISSING_H });
      video.src = url;
    } else {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: MISSING_W, h: MISSING_H });
      img.src = url;
    }
  });
}

/* Fills in w/h for items that lack them (mutates the items). Returns whether
 * anything was measured, i.e. whether the caller should persist. */
export async function measureMissingDimensions(list, onProgress = null) {
  const pending = list.filter((item) => !item.missing && (!item.w || !item.h));
  await runWithConcurrency(
    pending,
    MEASURE_CONCURRENCY,
    async (item) => {
      const dims = await measureItem(item);
      item.w = dims.w;
      item.h = dims.h;
    },
    onProgress
  );
  return pending.length > 0;
}

/* All mutations that go through async gaps (initial load, add batches) are
 * serialized on one queue, so overlapping drops can't both snapshot the
 * library pre-insert and push the same hash twice. */
let opQueue = Promise.resolve();

export function queueLibraryOperation(task) {
  opQueue = opQueue.catch(() => {}).then(task);
  return opQueue;
}

export function addPaths(paths) {
  return queueLibraryOperation(() =>
    doAddPaths(paths).catch((err) => {
      console.error('Failed to add files', err);
      showToast('Could not add the dropped files');
    })
  );
}

// live progress while the main process expands and reads a dropped batch
// (the slow part for big or video folders). The job is attached only for the
// duration of the probe call, so a last progress event that lands after it
// resolved cannot overwrite the next phase.
let probeJob = null;
window.api.onProbeProgress((progress) => {
  if (probeJob) probeJob.update(describeProbeProgress(progress));
});

async function probeFilesWithProgress(paths, job) {
  probeJob = job;
  try {
    return await window.api.probeFiles(paths);
  } finally {
    probeJob = null;
  }
}

async function doAddPaths(paths) {
  if (!paths.length) return;
  const job = startJob('Adding');
  try {
    await addPathsUnderJob(paths, job);
  } finally {
    job.finish();
  }
}

/* Moves `existing` to the file `entry` was probed from, which holds the same
 * content, and clears its file problem. */
function adoptPath(existing, entry) {
  existing.path = entry.path;
  existing.url = entry.url;
  existing.size = entry.size;
  existing.missing = false;
  existing.unshowable = false;
  delete existing.loadError;
  discardTile(existing.hash); // the next render builds a tile that loads the file
}

async function addPathsUnderJob(paths, job) {
  job.update(describeProbeProgress({ phase: 'scanning', found: 0 }));
  const { entries, unsupportedCount, unsupportedExtensions, unreadableCount } =
    await probeFilesWithProgress(paths, job);

  const known = new Map(itemsByHash); // a private copy: the batch dedups against itself too
  const fresh = [];
  let duplicates = 0;
  for (const entry of entries) {
    const existing = known.get(entry.hash);
    if (existing) {
      // Same content already present. If its old file vanished or would not
      // show, adopt the new path and give it another go.
      if (fileProblem(existing)) {
        adoptPath(existing, entry);
      } else {
        duplicates++;
      }
      continue;
    }
    known.set(entry.hash, entry);
    fresh.push(entry);
  }

  await measureMissingDimensions(fresh, (done, total) => {
    job.update(`reading dimensions ${done}/${total}`);
  });
  // one at a time: spreading a batch of some hundred thousand entries into
  // one push call overflows the call stack
  for (const entry of fresh) state.items.push(entry);
  render();
  persist();

  showToast(
    describeAddOutcome({
      added: fresh.length,
      duplicates,
      unsupportedCount,
      unsupportedExtensions,
      unreadableCount
    })
  );
}
