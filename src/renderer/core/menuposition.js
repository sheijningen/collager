/* Pure placement for a fixed-position popup such as the context menu. */

export const MENU_VIEWPORT_MARGIN = 8; // px kept between the menu and the viewport edge

/**
 * Where to put a menu opened at a pointer position so it stays fully inside
 * the viewport: it hangs below-right of the pointer and is pushed back up or
 * left when it would overflow, never past the margin at the top or left.
 *
 * @param {{x:number, y:number, width:number, height:number, viewportWidth:number, viewportHeight:number}} placement
 * @returns {{left:number, top:number}}
 */
export function clampMenuPosition({ x, y, width, height, viewportWidth, viewportHeight }) {
  const margin = MENU_VIEWPORT_MARGIN;
  return {
    left: Math.max(margin, Math.min(x, viewportWidth - width - margin)),
    top: Math.max(margin, Math.min(y, viewportHeight - height - margin))
  };
}
