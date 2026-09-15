/* App entry: toolbar button wiring, OS file drag & drop, startup, and the
 * hook the e2e harness drives the app through. Importing the other modules
 * here is what wires their event handlers up. */

import * as layout from '../core/layout.js';
import { basename } from '../core/layout.js';
import { formatCount } from '../core/text.js';
import * as stateModule from './state.js';
import * as collageModule from './collage.js';
import { state, selected, showToast, persist, reindexItems } from './state.js';
// named imports stay live; destructuring the namespace would freeze `columns`
import {
  columns,
  setColumns,
  shuffle,
  render,
  addPaths,
  measureMissingDimensions,
  queueLibraryOperation
} from './collage.js';
import * as panelModule from './panel.js';
import * as tiledragModule from './tiledrag.js';
import * as lightboxModule from './lightbox.js';
import * as autoscrollModule from './autoscroll.js';
import * as shortcutsModule from './shortcuts.js';
import * as toolbarModule from './toolbar.js';
import * as fullscreenModule from './fullscreen.js';

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
document.getElementById('btn-clear').addEventListener('click', () => {
  const n = state.items.length;
  if (!n) return;
  if (!confirm(`Remove all ${formatCount(n, 'item')} from the collage?`)) return;
  state.items = [];
  selected.clear();
  state.selectionAnchor = null;
  render();
  persist();
  showToast(`Cleared ${formatCount(n, 'item')}`);
});
document.getElementById('btn-clear-missing').addEventListener('click', () => {
  const n = state.items.filter((i) => i.missing).length;
  if (!n) return;
  if (!confirm(`Remove all ${formatCount(n, 'missing file')} from the collage?`)) return;
  state.items = state.items.filter((i) => !i.missing);
  // render() prunes the selection of anything that no longer exists
  render();
  persist();
  showToast(`Removed ${formatCount(n, 'missing file')}`);
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

/* ---------------- e2e hook ----------------
 * When the main process loads the page with ?e2e (set by the test harness),
 * every module export is reachable from the test's executeJavaScript calls
 * through one flat object. Getters keep the live bindings, so reassigned
 * exports read their current value. */

function exposeForTests(modules) {
  const surface = {};
  for (const mod of modules) {
    for (const key of Object.keys(mod)) {
      if (key in surface) console.warn(`test surface: ${key} is exported twice`);
      Object.defineProperty(surface, key, {
        get: () => mod[key],
        enumerable: true,
        configurable: true
      });
    }
  }
  window.collagerTest = surface;
}

if (new URLSearchParams(location.search).has('e2e')) {
  exposeForTests([
    layout,
    stateModule,
    collageModule,
    panelModule,
    tiledragModule,
    lightboxModule,
    autoscrollModule,
    shortcutsModule,
    toolbarModule,
    fullscreenModule
  ]);
}

/* ---------------- startup ---------------- */

render(); // empty state and toolbar geometry before the library arrives

/* Toast for a library file that could not be loaded. It was moved aside,
 * or, when even that failed, saving is off so it is not overwritten. */
function describeLibraryProblem({ backup }) {
  const where = backup
    ? `It was kept as ${basename(backup)}.`
    : 'It could not be moved aside, so saving is off to protect it.';
  return `The library file was unreadable, starting empty. ${where}`;
}

// runs as the first job on the op queue, so a drop that arrives during
// startup is applied after the saved library has loaded, never lost
queueLibraryOperation(async function init() {
  try {
    const loaded = await window.api.loadLibrary();
    state.items = loaded.items;
    reindexItems(); // the dimension pass below runs long before the first render
    if (loaded.problem) {
      // a blocked save lasts the whole session, so that warning must not time out
      const savingBlocked = loaded.problem.backup === null;
      showToast(describeLibraryProblem(loaded.problem), savingBlocked);
    }
    const measured = await measureMissingDimensions(state.items, (done, total) => {
      showToast(`Preparing library — reading dimensions ${done}/${total}…`, true);
    });
    render();
    if (measured) persist();
    const missingCount = state.items.filter((i) => i.missing).length;
    if (missingCount) {
      showToast(`${formatCount(missingCount, 'file')} missing on disk, hover to remove`);
    } else if (measured) {
      showToast('Library ready'); // replaces the sticky progress toast
    }
  } catch (err) {
    console.error('Failed to load the library', err);
    render();
    showToast('Could not load the saved library');
  }
});
