/* Placing a position:fixed popup: the context menu and the toolbar dropdowns
 * open at a point and are kept on screen the same way. */

import { clampMenuPosition } from '../core/menuposition.js';

/* Shows `popup` with its top-left corner at (x, y), shifted up or left as far
 * as needed to stay on screen. It is measured at a neutral position first:
 * stale left/top from a previous opening would cap its shrink-to-fit width
 * and skew the measurement. */
export function showPopupAt(popup, x, y) {
  popup.style.left = '0px';
  popup.style.top = '0px';
  popup.hidden = false;
  const rect = popup.getBoundingClientRect();
  const { left, top } = clampMenuPosition({
    x,
    y,
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  });
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}
