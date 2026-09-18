/* Pure selection-click logic for the file panel / collage tiles. No DOM
 * access in here. */

/**
 * Compute the next selection state for a click.
 * - plain click: select only the clicked item, move the anchor to it
 * - ctrl (or meta): toggle the clicked item, move the anchor to it
 * - shift (with a valid anchor): select the range anchor..clicked in the
 *   given display order; with ctrl also held the range is added to the
 *   existing selection instead of replacing it. The anchor stays put.
 * - shift without a usable anchor, or on an item outside the order, falls
 *   back to a plain click.
 *
 * @param {{selected: Set<string>, anchor: string|null, hash: string,
 *          ctrl: boolean, shift: boolean, order: string[]}} input
 * @returns {{selected: Set<string>, anchor: string|null}} new state
 *          (fresh Set; the input Set is never mutated)
 */
export function clickSelection({ selected, anchor, hash, ctrl, shift, order }) {
  const next = new Set(selected);
  if (shift && anchor !== null && order.includes(anchor) && order.includes(hash)) {
    const anchorIndex = order.indexOf(anchor);
    const clickedIndex = order.indexOf(hash);
    if (!ctrl) next.clear();
    const first = Math.min(anchorIndex, clickedIndex);
    const last = Math.max(anchorIndex, clickedIndex);
    for (let index = first; index <= last; index++) next.add(order[index]);
    return { selected: next, anchor };
  }
  if (ctrl) {
    if (next.has(hash)) next.delete(hash);
    else next.add(hash);
    return { selected: next, anchor: hash };
  }
  next.clear();
  next.add(hash);
  return { selected: next, anchor: hash };
}
