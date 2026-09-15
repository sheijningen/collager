/* The collage itself: masonry rendering, tile lifecycle, viewport-based
 * media hydration, dimension measuring, and the library operations that
 * mutate the items (add/remove/shuffle). */

import {
  packItems,
  clampColumns,
  basename,
  GAP,
  MISSING_W,
  MISSING_H,
  MIN_COLUMNS,
  MAX_COLUMNS,
  DEFAULT_COLUMNS
} from '../core/layout.js';
import { formatCount } from '../core/text.js';
import {
  state,
  selected,
  itemsByHash,
  reindexItems,
  tiles,
  lastPositions,
  scroller,
  collage,
  emptyState,
  itemCount,
  prefs,
  showToast,
  persist,
  countMissing
} from './state.js';
import { createMediaElement, releaseMedia } from './media.js';
import { handleSelectClick, renderList } from './panel.js';
import { openLightbox } from './lightbox.js';
import { lastDragEndAt } from './tiledrag.js';

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

const HYDRATE_MARGIN = '800px'; // how far outside the viewport media stays loaded

/* Tooltip for tiles whose file can't be read (shared with the file panel). */
export const MISSING_FILE_HINT = [
  'This file could not be loaded. Likely causes:',
  '• it was moved or renamed',
  '• it was deleted',
  '• it is on an external drive or network share that is not connected',
  '',
  'Re-add the file from its new location to repair this entry, or click ✕ to remove it.'
].join('\n');

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) hydrate(entry.target);
      else dehydrate(entry.target);
    }
  },
  { root: scroller, rootMargin: `${HYDRATE_MARGIN} 0px` }
);

function hydrate(tile) {
  if (tile.dataset.hydrated === '1') return;
  const item = itemsByHash.get(tile.dataset.hash);
  if (!item || item.missing) return;
  const media = createMediaElement(item);
  if (item.type === 'video') media.playsInline = true;
  media.draggable = false;
  // the file can vanish between the startup existence check and hydration
  // (deleted, drive unplugged): mark the item missing so the tile, the file
  // panel and the clear-missing button all show it; re-adding repairs it
  media.addEventListener('error', () => {
    dehydrate(tile);
    item.missing = true;
    tile.classList.add('missing');
    tile.title = MISSING_FILE_HINT;
    tile.querySelector('.placeholder-label').textContent = `missing: ${basename(item.path)}`;
    renderList();
    updateClearMissingBtn();
  });
  tile.appendChild(media);
  tile.dataset.hydrated = '1';
}

function dehydrate(tile) {
  if (tile.dataset.hydrated !== '1') return;
  const media = tile.querySelector('img, video');
  if (media) releaseMedia(media);
  tile.dataset.hydrated = '0';
}

/* Takes a tile out of the collage and the index, releasing its media first. */
export function discardTile(hash) {
  const tile = tiles.get(hash);
  if (!tile) return;
  observer.unobserve(tile);
  dehydrate(tile);
  tile.remove();
  tiles.delete(hash);
}

/* ---------------- rendering ---------------- */

export function render() {
  reindexItems();
  const width = scroller.clientWidth - GAP * 2;
  const { positions, height } = packItems(state.items, Math.max(width, 100), columns);
  collage.style.height = `${height + GAP}px`;

  const seen = new Set();
  lastPositions.clear();
  for (const pos of positions) {
    seen.add(pos.item.hash);
    lastPositions.set(pos.item.hash, pos);
    let tile = tiles.get(pos.item.hash);
    if (!tile) {
      tile = createTile(pos.item);
      tiles.set(pos.item.hash, tile);
      collage.appendChild(tile);
      observer.observe(tile);
    }
    tile.style.transform = `translate(${pos.x + GAP}px, ${pos.y + GAP}px)`;
    tile.style.width = `${pos.w}px`;
    tile.style.height = `${pos.h}px`;
  }
  for (const hash of [...tiles.keys()]) {
    if (!seen.has(hash)) discardTile(hash);
  }
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

function updateClearMissingBtn() {
  const count = countMissing();
  clearMissingBtn.hidden = count === 0;
  clearMissingBtn.textContent = `⚠ Clear ${count} missing`;
}

function createTile(item) {
  const tile = document.createElement('div');
  tile.className =
    'tile' + (item.missing ? ' missing' : '') + (selected.has(item.hash) ? ' selected' : '');
  tile.dataset.hash = item.hash;
  tile.dataset.hydrated = '0';

  const label = document.createElement('div');
  label.className = 'placeholder-label';
  const name = basename(item.path);
  label.textContent = item.missing ? `missing: ${name}` : name;
  tile.appendChild(label);
  if (item.missing) tile.title = MISSING_FILE_HINT;

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
  tile.addEventListener('dblclick', () => {
    // a drag's synthetic click counts toward double-click detection; don't
    // let drag-then-quick-click open the lightbox
    if (performance.now() - lastDragEndAt < 400) return;
    if (!item.missing) openLightbox(item);
  });
  return tile;
}

/* ---------------- library operations ---------------- */

/* Drops every item `keep` rejects, then renders and saves. The render prunes
 * the selection of whatever went. */
export function removeItems(keep) {
  state.items = state.items.filter(keep);
  render();
  persist();
}

export function shuffle() {
  const list = state.items;
  for (let last = list.length - 1; last > 0; last--) {
    const pick = Math.floor(Math.random() * (last + 1));
    [list[last], list[pick]] = [list[pick], list[last]];
  }
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
  const CONCURRENCY = 8;
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      const dims = await measureItem(item);
      item.w = dims.w;
      item.h = dims.h;
      done++;
      if (onProgress) onProgress(done, pending.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
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

// live progress while the main process hashes a dropped batch (the slow part
// for video folders); the sticky toast is replaced by the summary at the end
window.api.onProbeProgress(({ done, total }) => {
  showToast(`Adding — reading files ${done}/${total}…`, true);
});

async function doAddPaths(paths) {
  if (!paths.length) return;
  showToast('Adding — scanning…', true);
  const { entries, skippedCount } = await window.api.probeFiles(paths);

  const known = new Map(itemsByHash); // a private copy: the batch dedups against itself too
  const fresh = [];
  let duplicates = 0;
  for (const entry of entries) {
    const existing = known.get(entry.hash);
    if (existing) {
      // Same content already present. If its old file vanished, adopt the new path.
      if (existing.missing) {
        existing.path = entry.path;
        existing.url = entry.url;
        existing.size = entry.size;
        existing.missing = false;
        discardTile(existing.hash); // the next render builds a tile that loads the file
      } else {
        duplicates++;
      }
      continue;
    }
    known.set(entry.hash, entry);
    fresh.push(entry);
  }

  await measureMissingDimensions(fresh, (done, total) => {
    showToast(`Adding — reading dimensions ${done}/${total}…`, true);
  });
  state.items.push(...fresh);
  render();
  persist();

  const parts = [];
  if (fresh.length) parts.push(`added ${fresh.length}`);
  if (duplicates) parts.push(`${formatCount(duplicates, 'duplicate')} skipped`);
  if (skippedCount) parts.push(`${skippedCount} unsupported skipped`);
  showToast(parts.length ? parts.join(' · ') : 'Nothing to add');
}
