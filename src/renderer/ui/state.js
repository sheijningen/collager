/* Shared renderer state and the core DOM references.
 *
 * `state` holds the fields other modules reassign (the library itself, whether
 * it has loaded, and the selection anchor); everything else here is a
 * container that is mutated in place. Modules own their remaining state and
 * export setters for what others may change. */

import { createPrefs } from '../core/prefs.js';

export const state = {
  /** @type {{hash:string, path:string, url:string, type:'image'|'gif'|'video', size?:number, w?:number, h?:number, missing?:boolean}[]} the library, in collage order */
  items: [],
  /** set once the saved library has been loaded into `items` */
  libraryLoaded: false,
  /** hash the next shift-click range extends from, or null */
  selectionAnchor: null
};
/** hashes of the selected items (shared by the collage and the file panel) */
export const selected = new Set();
/** hash -> item; see reindexItems */
export const itemsByHash = new Map();
/** hash -> tile element */
export const tiles = new Map();
/** hash -> packed position {x, y, w, h} from the last render */
export const lastPositions = new Map();

export const scroller = document.getElementById('scroller');
export const collage = document.getElementById('collage');
export const emptyState = document.getElementById('empty-state');
export const itemCount = document.getElementById('item-count');
export const toastEl = document.getElementById('toast');

export const prefs = createPrefs(window.localStorage);

/* Rebuilds itemsByHash from state.items. Every render does this, and so
 * must any code that replaces state.items and then waits before rendering,
 * since tile and drag lookups go through the map rather than the list. */
export function reindexItems() {
  itemsByHash.clear();
  for (const item of state.items) itemsByHash.set(item.hash, item);
}

/* ---------------- toast ---------------- */

let toastTimer = null;
/* A sticky toast stays up until the next showToast call replaces it, so a
 * progress readout is never hidden by the timer. */
export function showToast(message, sticky = false) {
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

/* Refuses to write until the saved library is in `state.items`: an action
 * taken during startup, or after a failed load, would otherwise save the
 * empty list over the file. */
export async function persist() {
  if (!state.libraryLoaded) return;
  try {
    await window.api.saveLibrary(state.items);
  } catch (err) {
    console.error('Failed to save library', err);
    showToast('Warning: could not save the collection to disk');
  }
}
