'use strict';

/* Shared state and core DOM references for all renderer modules.
 *
 * The renderer is split into plain scripts that share one global lexical
 * scope; load order (index.html): layout → selection → prefs → state →
 * collage → panel → tiledrag → lightbox → exportimage → autoscroll →
 * shortcuts → app. Top-level declarations here are visible to every later
 * script (and functions declared later are callable from here at runtime).
 */

const {
  packItems,
  sortItems,
  clampColumns,
  basename,
  reorderByHash,
  GAP,
  MISSING_W,
  MISSING_H,
  MIN_COLUMNS,
  MAX_COLUMNS,
  DEFAULT_COLUMNS,
  fitExportScale
} = window.CollagerLayout;
const { clickSelection } = window.CollagerSelection;
const prefs = window.CollagerPrefs.createPrefs(window.localStorage);

/** @type {{hash:string, path:string, url:string, type:'image'|'gif'|'video', w?:number, h?:number, missing?:boolean}[]} */
let items = [];
/** hash -> tile element */
const tiles = new Map();
/** hash -> packed position {x, y, w, h} from the last render */
const lastPositions = new Map();

const scroller = document.getElementById('scroller');
const collage = document.getElementById('collage');
const emptyState = document.getElementById('empty-state');
const itemCount = document.getElementById('item-count');
const toastEl = document.getElementById('toast');

/* ---------------- toast ---------------- */

let toastTimer = null;
/* sticky toasts stay up until the next showToast call replaces them —
 * used as a progress readout during long operations */
function showToast(message, sticky = false) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = sticky
    ? null
    : setTimeout(() => {
        toastEl.hidden = true;
      }, 2600);
}

/* ---------------- persistence ---------------- */

async function persist() {
  try {
    await window.api.saveLibrary(items);
  } catch (err) {
    console.error('Failed to save library', err);
    showToast('Warning: could not save the collection to disk');
  }
}
