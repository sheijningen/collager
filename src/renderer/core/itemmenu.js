/* The shape of the item context menu, decided without the DOM. */

import { formatCount } from './text.js';

/* The menu acts on the whole selection when the clicked item is one of
 * several selected items, and on the clicked item alone otherwise. */
export function menuActsOnSelection(selectionSize, itemSelected) {
  return selectionSize > 1 && itemSelected;
}

/* The line above the actions: the path for one item, a count for a
 * selection, whose actions name no single file. */
export function menuHeader(path, selectionSize, wholeSelection) {
  return wholeSelection ? `${formatCount(selectionSize, 'item')} selected` : path;
}

export function removeLabel(selectionSize, wholeSelection) {
  return wholeSelection ? `Remove ${selectionSize} selected` : 'Remove from collage';
}
