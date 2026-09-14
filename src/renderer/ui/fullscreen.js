/* ---------------- fullscreen ----------------
 * The default application menu is removed in the main process, so this
 * module owns the F11 binding outright. */

export let isFullscreen = false;
const fullscreenBtn = document.getElementById('btn-fullscreen');
fullscreenBtn.addEventListener('click', () => window.api.toggleFullscreen());

function applyFullscreenState(fullscreen) {
  isFullscreen = fullscreen;
  fullscreenBtn.classList.toggle('active', fullscreen);
}
window.api.onFullscreenChanged(applyFullscreenState);
// transitions before this listener attached (or a window created fullscreen)
// would otherwise leave the state stale and disarm the Escape fallback
window.api.isFullscreen().then(applyFullscreenState);

window.addEventListener('keydown', (e) => {
  if (e.key !== 'F11' || e.repeat || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
  e.preventDefault();
  // a lightbox video's native controls can enter HTML element-fullscreen,
  // which Electron promotes to window fullscreen; unwind that first or the
  // page would be stuck in element-fullscreen layout inside a normal window
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  window.api.toggleFullscreen();
});
