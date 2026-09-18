/* App entry: toolbar button wiring, OS file drag & drop, startup, and the
 * hook the e2e harness drives the app through. Importing the other modules
 * here is what wires their event handlers up. */

import * as layout from '../core/layout.js';
import { basename } from '../core/paths.js';
import { mayCarryMedia, explainEmptyDrop } from '../core/drop.js';
import * as stateModule from './state.js';
import * as collageModule from './collage.js';
import { state, showToast, persist, reindexItems, countMissing, runOrToast } from './state.js';
import { formatCount } from '../core/text.js';
// named imports stay live; destructuring the namespace would freeze `columns`
import {
  columns,
  setColumns,
  shuffle,
  render,
  addPaths,
  clearAll,
  clearMissing,
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
  if (event.dataTransfer && mayCarryMedia([...event.dataTransfer.types])) {
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
  if (!paths.length) {
    const explanation = explainEmptyDrop([...event.dataTransfer.types], files.length);
    if (explanation) showToast(explanation);
    return;
  }
  addPaths(paths);
});

/* ---------------- toolbar ---------------- */

document.getElementById('btn-add').addEventListener('click', async () => {
  const paths = await runOrToast(() => window.api.pickFiles(), 'Could not open the file dialog');
  if (paths) addPaths(paths);
});
document.getElementById('btn-add-folder').addEventListener('click', async () => {
  const paths = await runOrToast(
    () => window.api.pickFolders(),
    'Could not open the folder dialog'
  );
  if (paths) addPaths(paths);
});
document.getElementById('btn-empty-add').addEventListener('click', (event) => {
  // a focused button would claim Space and Enter from the shortcuts
  if (event.detail) event.currentTarget.blur();
  document.getElementById('btn-add').click();
});
document.getElementById('btn-shuffle').addEventListener('click', shuffle);
document.getElementById('btn-col-minus').addEventListener('click', () => setColumns(columns - 1));
document.getElementById('btn-col-plus').addEventListener('click', () => setColumns(columns + 1));
document.getElementById('btn-clear').addEventListener('click', clearAll);
document.getElementById('btn-clear-missing').addEventListener('click', clearMissing);

/* ---------------- window resize ---------------- */

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});

window.api.onGpuFallback(() => {
  showToast(
    'Graphics trouble: Collager restarted in a safer display mode. The next start tries the normal one again.'
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
 * or, when that failed or it could not be read at all, it stays where it is
 * and saving is off so it is not overwritten. */
function describeLibraryProblem({ backup }) {
  const where = backup
    ? `It was kept as ${basename(backup)}.`
    : 'It stays where it is and saving is off to protect it.';
  return `The library file could not be read, starting empty. ${where}`;
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
      notes.push(
        `${formatCount(missingCount, 'file')} missing on disk, see Collage > ⚠ Clear ${missingCount} missing`
      );
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
