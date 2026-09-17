/* Stepping through the collage while one item is maximized. */

import { fileProblem } from './text.js';

/* The item to show after moving `direction` (1 or -1) from the item with
 * `currentHash`, skipping what cannot be shown; null at either end. */
export function findShowableNeighbour(items, currentHash, direction) {
  let index = items.findIndex((item) => item.hash === currentHash);
  if (index === -1) return null;
  for (index += direction; index >= 0 && index < items.length; index += direction) {
    if (!fileProblem(items[index])) return items[index];
  }
  return null;
}
