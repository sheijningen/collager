/* Pure layout & sorting logic for the collage. No DOM access in here; the
 * renderer imports it and the unit tests require() it under Node. */

import { basename } from './paths.js';

export const GAP = 4; // px between tiles
export const MISSING_W = 260; // fallback tile size for missing/unmeasured files
export const MISSING_H = 140;
export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 8;
export const DEFAULT_COLUMNS = 3;

export function clampColumns(count) {
  if (!Number.isFinite(count)) return DEFAULT_COLUMNS;
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.trunc(count)));
}

/* Masonry: a fixed number of equal-width columns. Every item is scaled to
 * the column width with its aspect ratio preserved and dropped into the
 * currently shortest column, so column heights stay balanced. */
export function packItems(list, containerWidth, columns) {
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
