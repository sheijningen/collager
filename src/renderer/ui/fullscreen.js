/* ---------------- fullscreen ----------------
 * Linux and Windows have no application menu, so this module owns F11
 * outright. On macOS it handles Ctrl+Cmd+F itself and prevents the default,
 * so a fullscreen item AppKit may add to the Window menu does not toggle a
 * second time. */

import { isFullscreenKey, fullscreenKeyLabel } from '../core/keys.js';

export let isFullscreen = false;
const fullscreenBtn = document.getElementById('btn-fullscreen');
fullscreenBtn.title = `Toggle fullscreen (${fullscreenKeyLabel(window.api.platform)})`;
fullscreenBtn.addEventListener('click', () => window.api.toggleFullscreen());

function applyFullscreenState(fullscreen) {
  isFullscreen = fullscreen;
  fullscreenBtn.classList.toggle('active', fullscreen);
}
window.api.onFullscreenChanged(applyFullscreenState);
// transitions before this listener attached (or a window created fullscreen)
// would otherwise leave the state stale and disarm the Escape fallback
window.api.isFullscreen().then(applyFullscreenState);

window.addEventListener('keydown', (event) => {
  if (event.repeat || !isFullscreenKey(event, window.api.platform)) return;
  event.preventDefault();
  // a lightbox video's native controls can enter HTML element-fullscreen,
  // which Electron promotes to window fullscreen; unwind that first or the
  // page would be stuck in element-fullscreen layout inside a normal window
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  window.api.toggleFullscreen();
});
