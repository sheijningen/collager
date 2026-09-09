/* App entry: toolbar button wiring, OS file drag & drop, startup, and the
 * hook the e2e harness drives the app through. Importing the other modules
 * here is what wires their event handlers up. */

import * as layout from '../core/layout.js';
import { basename } from '../core/layout.js';
import { formatCount } from '../core/text.js';
import * as stateModule from './state.js';
import * as collageModule from './collage.js';
import { state, showToast, persist, reindexItems, countMissing } from './state.js';
// named imports stay live; destructuring the namespace would freeze `columns`
import {
  columns,
  setColumns,
  shuffle,
  render,
  addPaths,
  removeItems,
  measureMissingDimensions,
  queueLibraryOperation
} from './collage.js';
import * as panelModule from './panel.js';
import * as ctxmenuModule from './ctxmenu.js';
import * as tiledragModule from './tiledrag.js';
import * as lightboxModule from './lightbox.js';
import * as autoscrollModule from './autoscroll.js';
import * as shortcutsModule from './shortcuts.js';
import * as toolbarModule from './toolbar.js';
import * as fullscreenModule from './fullscreen.js';
import * as dropdownModule from './dropdown.js';
import * as statusModule from './status.js';
import { startJob } from './status.js';

/* ---------------- OS file drag & drop ---------------- */

const dropOverlay = document.getElementById('drop-overlay');

let dragDepth = 0;
window.addEventListener('dragenter', (event) => {
  if (event.dataTransfer && [...event.dataTransfer.types].includes('Files')) {
    dragDepth++;
    dropOverlay.hidden = false;
  }
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const files = [...event.dataTransfer.files];
  const paths = files.map((file) => window.api.pathForFile(file)).filter(Boolean);
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
  const count = state.items.length;
  if (!count) return;
  if (!confirm(`Remove all ${formatCount(count, 'item')} from the collage?`)) return;
  removeItems(() => false);
  showToast(`Cleared ${formatCount(count, 'item')}`);
});
document.getElementById('btn-clear-missing').addEventListener('click', () => {
  const count = countMissing();
  if (!count) return;
  if (!confirm(`Remove all ${formatCount(count, 'missing file')} from the collage?`)) return;
  removeItems((item) => !item.missing);
  showToast(`Removed ${formatCount(count, 'missing file')}`);
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
    ctxmenuModule,
    tiledragModule,
    lightboxModule,
    autoscrollModule,
    shortcutsModule,
    toolbarModule,
    fullscreenModule,
    dropdownModule,
    statusModule
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
  const job = startJob('Preparing library');
  try {
    const loaded = await window.api.loadLibrary();
    state.items = loaded.items;
    state.libraryLoaded = true;
    reindexItems(); // the dimension pass below runs long before the first render
    if (loaded.problem) {
      // a blocked save lasts the whole session, so that warning must not time out
      const savingBlocked = loaded.problem.backup === null;
      showToast(describeLibraryProblem(loaded.problem), savingBlocked);
    }
    const measured = await measureMissingDimensions(state.items, (done, total) => {
      job.update(`reading dimensions ${done}/${total}`);
    });
    render();
    if (measured) persist();
    const notes = [];
    const missingCount = countMissing();
    if (missingCount) {
      notes.push(`${formatCount(missingCount, 'file')} missing on disk, hover to remove`);
    }
    if (loaded.collapsed) {
      notes.push(`${formatCount(loaded.collapsed, 'duplicate')} merged`);
    }
    if (notes.length) showToast(notes.join(' · '));
  } catch (err) {
    console.error('Failed to load the library', err);
    render();
    // saving stays off for the whole session (see persist), so the warning
    // must not time out
    showToast('Could not load the saved library. Saving is off to protect it.', true);
  } finally {
    job.finish();
  }
});
