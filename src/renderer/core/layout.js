/* Pure layout & sorting logic for the collage. No DOM access in here; the
 * renderer imports it and the unit tests require() it under Node. */

import { basename } from './paths.js';

export const GAP = 4; // px between tiles
export const MISSING_W = 260; // fallback tile size for missing/unmeasured files
export const MISSING_H = 140;
export const LOAD_TIMEOUT_MS = 20_000; // a media load still pending this long counts as failed
export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 8;
export const DEFAULT_COLUMNS = 3;

export function clampColumns(count) {
  if (!Number.isFinite(count)) return DEFAULT_COLUMNS;
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.trunc(count)));
}

/* Whether the item has dimensions a load found: both set, and not the
 * fallback a failed measure gives. */
export function hasOwnDimensions(item) {
  if (!item.w || !item.h) return false;
  return item.w !== MISSING_W || item.h !== MISSING_H;
}

/* Masonry: a fixed number of equal-width columns. Every item is scaled to
 * the column width with its aspect ratio preserved and dropped into the
 * currently shortest column, so column heights stay balanced. Packing stops
 * early once every column reaches `stopHeight`. */
export function packItems(list, containerWidth, columns, stopHeight = Infinity) {
  const colWidth = Math.floor((containerWidth - GAP * (columns - 1)) / columns);
  const colHeights = new Array(columns).fill(0);
  const positions = [];

  for (const item of list) {
    const nativeW = item.missing ? MISSING_W : item.w || MISSING_W;
    const nativeH = item.missing ? MISSING_H : item.h || MISSING_H;
    const tileHeight = Math.max(1, Math.round(nativeH * (colWidth / nativeW)));

    let col = 0;
    for (let candidate = 1; candidate < columns; candidate++) {
      if (colHeights[candidate] < colHeights[col]) col = candidate;
    }
    if (colHeights[col] >= stopHeight) break;
    positions.push({
      item,
      x: col * (colWidth + GAP),
      y: colHeights[col],
      w: colWidth,
      h: tileHeight
    });
    colHeights[col] += tileHeight + GAP;
  }
  return { positions, height: Math.max(0, Math.max(0, ...colHeights) - GAP) };
}

/* The wrap region below a collage `height` tall: `list` packed from a level
 * line one GAP below it, as packItems packs it from the top, until every
 * column reaches `minHeight` below that line. Each clone sits exactly
 * `wrapHeight` below the position packItems gives its item, so scrolling by
 * that distance shows the same picture. A single pass at most: repeating
 * items would show tiles the top of the collage does not have. */
export function packClones(list, containerWidth, columns, height, minHeight) {
  const wrapHeight = height + GAP;
  const packed = packItems(list, containerWidth, columns, minHeight);
  return {
    positions: packed.positions.map((pos) => ({ ...pos, y: pos.y + wrapHeight, clone: true })),
    wrapHeight,
    height: packed.height
  };
}

/* A copy of `list` in random order (Fisher-Yates). */
export function shuffleItems(list, random = Math.random) {
  const arr = list.slice();
  for (let last = arr.length - 1; last > 0; last--) {
    const pick = Math.floor(random() * (last + 1));
    [arr[last], arr[pick]] = [arr[pick], arr[last]];
  }
  return arr;
}

/* `order` brought up to date with `items`: the item objects of `order` still
 * in `items` keep their places, the others go, and the items `order` lacks
 * follow at the end in their order in `items`. Returns a new array. */
export function reconcileOrder(order, items) {
  const present = new Set(items);
  const kept = order.filter((item) => present.has(item));
  const known = new Set(kept);
  for (const item of items) {
    if (!known.has(item)) kept.push(item);
  }
  return kept;
}

/* Reorder for drag & drop: the moved item takes the target's place —
 * dragging up inserts before the target, dragging down inserts after it
 * (the usual list-reorder feel). Returns a new array. */
export function reorderByHash(list, fromHash, toHash) {
  const arr = list.slice();
  const from = arr.findIndex((item) => item.hash === fromHash);
  const to = arr.findIndex((item) => item.hash === toHash);
  if (from === -1 || to === -1 || from === to) return arr;
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  return arr;
}

/* Sort for the file panel. 'added' (or anything unknown) keeps the given
 * order, which is the collage order. */
export function sortItems(items, mode) {
  const arr = items.slice();
  const byName = (first, second) =>
    basename(first.path).localeCompare(basename(second.path), undefined, { sensitivity: 'base' });
  if (mode === 'name') arr.sort(byName);
  else if (mode === 'path')
    arr.sort((first, second) =>
      first.path.localeCompare(second.path, undefined, { sensitivity: 'base' })
    );
  else if (mode === 'type')
    arr.sort((first, second) => first.type.localeCompare(second.type) || byName(first, second));
  return arr;
}
