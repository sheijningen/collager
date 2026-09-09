/* Pure layout & sorting logic for the collage. No DOM access in here; the
 * renderer imports it and the unit tests require() it under Node. */

export const GAP = 4; // px between tiles
export const MISSING_W = 260; // fallback tile size for missing/unmeasured files
export const MISSING_H = 140;
export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 8;
export const DEFAULT_COLUMNS = 3;

export function clampColumns(n) {
  if (!Number.isFinite(n)) return DEFAULT_COLUMNS;
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.trunc(n)));
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
    const h = Math.max(1, Math.round(nativeH * (colWidth / nativeW)));

    let col = 0;
    for (let i = 1; i < columns; i++) {
      if (colHeights[i] < colHeights[col]) col = i;
    }
    positions.push({
      item,
      x: col * (colWidth + GAP),
      y: colHeights[col],
      w: colWidth,
      h
    });
    colHeights[col] += h + GAP;
  }
  return { positions, height: Math.max(0, Math.max(0, ...colHeights) - GAP) };
}

export function basename(p) {
  return p.split(/[\\/]/).pop();
}

/* Reorder for drag & drop: the moved item takes the target's place —
 * dragging up inserts before the target, dragging down inserts after it
 * (the usual list-reorder feel). Returns a new array. */
export function reorderByHash(list, fromHash, toHash) {
  const arr = list.slice();
  const from = arr.findIndex((i) => i.hash === fromHash);
  const to = arr.findIndex((i) => i.hash === toHash);
  if (from === -1 || to === -1 || from === to) return arr;
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  return arr;
}

/* Sort for the file panel. 'added' (or anything unknown) keeps the given
 * order, which is the collage order. */
export function sortItems(items, mode) {
  const arr = items.slice();
  const byName = (a, b) =>
    basename(a.path).localeCompare(basename(b.path), undefined, { sensitivity: 'base' });
  if (mode === 'name') arr.sort(byName);
  else if (mode === 'path')
    arr.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
  else if (mode === 'type') arr.sort((a, b) => a.type.localeCompare(b.type) || byName(a, b));
  return arr;
}
