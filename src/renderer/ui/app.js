'use strict';

/* App shell: toolbar wiring, fullscreen, OS file drag & drop, and startup.
 * Loads last — every other module's declarations are available here. */

/* ---------------- OS file drag & drop ---------------- */

const dropOverlay = document.getElementById('drop-overlay');

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) {
    dragDepth++;
    dropOverlay.hidden = false;
  }
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
  addPaths(paths);
});

/* ---------------- toolbar ---------------- */

document.getElementById('btn-add').addEventListener('click', async () => {
  const paths = await window.api.pickFiles();
  addPaths(paths);
});
document.getElementById('btn-shuffle').addEventListener('click', shuffle);
document.getElementById('btn-col-minus').addEventListener('click', () => setColumns(columns - 1));
document.getElementById('btn-col-plus').addEventListener('click', () => setColumns(columns + 1));
document.getElementById('col-count').textContent = String(columns);
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!items.length) return;
  const n = items.length;
  if (!confirm(`Remove all ${n} item${n === 1 ? '' : 's'} from the collage?`)) return;
  items = [];
  selected.clear();
  selectionAnchor = null;
  render();
  persist();
  showToast(`Cleared ${n} item${n === 1 ? '' : 's'}`);
});
document.getElementById('btn-clear-missing').addEventListener('click', () => {
  const n = items.filter((i) => i.missing).length;
  if (!n) return;
  if (!confirm(`Remove all ${n} missing file${n === 1 ? '' : 's'} from the collage?`)) return;
  items = items.filter((i) => !i.missing);
  // render() prunes the selection of anything that no longer exists
  render();
  persist();
  showToast(`Removed ${n} missing file${n === 1 ? '' : 's'}`);
});

/* minimizable toolbar: collapsing gives the collage the full window height;
 * the floating chevron stays put so the toolbar can always be brought back */
const toolbarToggleBtn = document.getElementById('btn-toolbar-toggle');
let toolbarOpen = prefs.bool('toolbar', true);

function setToolbarOpen(open) {
  toolbarOpen = open;
  document.body.classList.toggle('toolbar-collapsed', !open);
  toolbarToggleBtn.innerHTML = open ? '&#x25B4;' : '&#x25BE;';
  toolbarToggleBtn.title = open ? 'Hide toolbar' : 'Show toolbar';
  prefs.set('toolbar', open);
  // the height change can flip scrollbar presence, which changes the
  // packing width — same reason setPanelOpen re-renders
  render();
}

toolbarToggleBtn.addEventListener('click', () => setToolbarOpen(!toolbarOpen));
setToolbarOpen(toolbarOpen);

/* ---------------- fullscreen ----------------
 * The default application menu is removed in the main process, so this
 * handler owns the F11 binding outright. */

let isFullscreen = false;
const fullscreenBtn = document.getElementById('btn-fullscreen');
fullscreenBtn.addEventListener('click', () => window.api.toggleFullscreen());
function applyFullscreenState(state) {
  isFullscreen = state;
  fullscreenBtn.classList.toggle('active', state);
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

/* ---------------- window resize ---------------- */

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});

window.api.onGpuFallback(() => {
  showToast(
    'Hardware acceleration is off after repeated graphics crashes — start with --gpu to retry'
  );
});

/* ---------------- startup ---------------- */

/* Toast for a library file that could not be loaded. A file from a newer app
 * is intact, needs that app, and is left in place with saving off. An
 * unreadable file was moved aside, or, when even that failed, saving is off
 * so it is not overwritten in place. */
function describeLibraryProblem({ reason, backup }) {
  if (reason === 'newer-version') {
    return 'This collection was saved by a newer Collager, which is needed to open it. It was left in place and saving is off so it stays intact.';
  }
  const where = backup
    ? `It was kept as ${basename(backup)}.`
    : 'It could not be moved aside, so saving is off to protect it.';
  return `The library file was unreadable, starting empty. ${where}`;
}

// runs as the first job on the op queue, so a drop that arrives during
// startup is applied after the saved library has loaded, never lost
opQueue = opQueue.then(async function init() {
  try {
    const loaded = await window.api.loadLibrary();
    items = loaded.items;
    if (loaded.problem) showToast(describeLibraryProblem(loaded.problem));
    const measured = await measureMissingDimensions(items, (done, total) => {
      showToast(`Preparing library — reading dimensions ${done}/${total}…`, true);
    });
    render();
    if (measured) persist();
    const missingCount = items.filter((i) => i.missing).length;
    if (missingCount) {
      showToast(
        `${missingCount} file${missingCount === 1 ? '' : 's'} missing on disk — hover to remove`
      );
    } else if (measured) {
      showToast('Library ready'); // replaces the sticky progress toast
    }
  } catch (err) {
    console.error('Failed to load the library', err);
    render();
    showToast('Could not load the saved library');
  }
});
