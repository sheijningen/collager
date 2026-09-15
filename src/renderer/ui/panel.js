/* ---------------- file panel & selection ----------------
 * A collapsible sidebar listing every loaded file, sortable by collage
 * order, name, path or type. Selection is shared between the list and the
 * collage: clicking a list entry scrolls the collage to that tile, clicking
 * a tile highlights its list entry. Ctrl toggles, Shift selects a range.
 */

import { sortItems, basename } from '../core/layout.js';
import { clickSelection } from '../core/selection.js';
import { clampMenuPosition } from '../core/menuposition.js';
import { buildListKey } from '../core/listkey.js';
import { formatCount } from '../core/text.js';
import { state, selected, tiles, lastPositions, scroller, prefs, showToast } from './state.js';
import { render, removeItems, MISSING_FILE_HINT } from './collage.js';
import { autoScroll, setAutoScrollPosition } from './autoscroll.js';
import { lightbox } from './lightbox.js';
import { anyOverlayOpen } from './shortcuts.js';

const panel = document.getElementById('panel');
export const fileList = document.getElementById('file-list');
export const sortSelect = document.getElementById('sort-select');
export const removeSelectedBtn = document.getElementById('btn-remove-selected');

/** hash -> list <li> element */
export const listEntries = new Map();
let sortMode = prefs.string('sort', 'added');
export let panelOpen = prefs.bool('panel', true);
let renderedListKey = null; // what the list currently shows, or null while hidden

function sortedItems() {
  return sortItems(state.items, sortMode);
}

export function renderList() {
  if (!panelOpen) {
    closeCtxMenu();
    renderedListKey = null; // rebuilt on reopen (setPanelOpen → render)
    return;
  }
  const items = sortedItems();
  const key = buildListKey(items, sortMode);
  if (key === renderedListKey) return; // selection classes are already current
  renderedListKey = key;
  closeCtxMenu(); // list is being rebuilt under the menu
  fileList.textContent = '';
  listEntries.clear();
  for (const item of items) {
    const li = document.createElement('li');
    li.className = (selected.has(item.hash) ? 'selected' : '') + (item.missing ? ' missing' : '');
    li.title = item.missing ? `${item.path}\n\n${MISSING_FILE_HINT}` : item.path;

    const badge = document.createElement('span');
    badge.className = `badge ${item.type}`;
    badge.textContent = item.type === 'image' ? 'IMG' : item.type === 'gif' ? 'GIF' : 'VID';
    li.appendChild(badge);

    const name = document.createElement('span');
    name.className = 'fname';
    name.textContent = basename(item.path);
    li.appendChild(name);

    li.addEventListener('click', (event) => handleSelectClick(item.hash, event, 'list'));
    li.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openCtxMenu(item, event.clientX, event.clientY);
    });
    fileList.appendChild(li);
    listEntries.set(item.hash, li);
  }
  updateRemoveSelectedBtn();
}

export function handleSelectClick(hash, event, source) {
  const next = clickSelection({
    selected,
    anchor: state.selectionAnchor,
    hash,
    ctrl: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    order: sortedItems().map((item) => item.hash)
  });
  selected.clear();
  for (const selectedHash of next.selected) selected.add(selectedHash);
  state.selectionAnchor = next.anchor;
  applySelection();

  if (source === 'list') {
    scrollCollageTo(hash);
  } else if (panelOpen) {
    const li = listEntries.get(hash);
    if (li) li.scrollIntoView({ block: 'nearest' });
  }
}

export function applySelection() {
  for (const [hash, tile] of tiles) tile.classList.toggle('selected', selected.has(hash));
  for (const [hash, li] of listEntries) li.classList.toggle('selected', selected.has(hash));
  updateRemoveSelectedBtn();
}

function updateRemoveSelectedBtn() {
  removeSelectedBtn.textContent = `Remove (${selected.size})`;
  removeSelectedBtn.disabled = selected.size === 0;
}

function scrollCollageTo(hash) {
  const pos = lastPositions.get(hash);
  if (!pos) return;
  const top = Math.max(0, pos.y - 40);
  // with auto-scroll running a smooth scroll cannot survive: the next tick
  // would treat the moving position as manual scrolling, adopt it and cancel
  // the animation — so jump instantly and hand the tick the new position
  setAutoScrollPosition(top);
  scroller.scrollTo({ top, behavior: autoScroll ? 'auto' : 'smooth' });
}

function removeSelected() {
  if (!selected.size) return;
  const count = selected.size;
  if (!confirm(`Remove ${formatCount(count, 'selected item')} from the collage?`)) return;
  removeItems((item) => !selected.has(item.hash));
  showToast(`Removed ${formatCount(count, 'item')}`);
}

export function setPanelOpen(open) {
  panelOpen = open;
  panel.classList.toggle('collapsed', !open);
  prefs.set('panel', open);
  render(); // collage width changed
}

removeSelectedBtn.addEventListener('click', removeSelected);
document.getElementById('btn-panel').addEventListener('click', () => setPanelOpen(!panelOpen));
sortSelect.value = sortMode;
sortSelect.addEventListener('change', () => {
  sortMode = sortSelect.value;
  prefs.set('sort', sortMode);
  renderList();
});
panel.classList.toggle('collapsed', !panelOpen);

// Delete removes the selection; Escape belongs to the ladder in shortcuts.js
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Delete' || !selected.size) return;
  if (!lightbox.hidden || anyOverlayOpen()) return;
  removeSelected();
});

/* ---------------- context menu (right-click on a panel entry) ---------------- */

export const ctxMenu = document.getElementById('ctx-menu');
const ctxPath = document.getElementById('ctx-path');
let ctxItem = null;

export function openCtxMenu(item, x, y) {
  ctxItem = item;
  ctxPath.textContent = item.path;
  // measure at a neutral position (stale left/top from a previous opening
  // would cap shrink-to-fit width and skew the measurement), then clamp
  ctxMenu.style.left = '0px';
  ctxMenu.style.top = '0px';
  ctxMenu.hidden = false;
  const rect = ctxMenu.getBoundingClientRect();
  const { left, top } = clampMenuPosition({
    x,
    y,
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  });
  ctxMenu.style.left = `${left}px`;
  ctxMenu.style.top = `${top}px`;
}

export function closeCtxMenu() {
  ctxMenu.hidden = true;
  ctxItem = null;
}

document.getElementById('ctx-copy').addEventListener('click', async () => {
  if (!ctxItem) return;
  try {
    await navigator.clipboard.writeText(ctxItem.path);
    showToast('Path copied to clipboard');
  } catch {
    showToast('Could not access the clipboard');
  }
  closeCtxMenu();
});

document.getElementById('ctx-reveal').addEventListener('click', () => {
  if (ctxItem) window.api.revealFile(ctxItem.path);
  closeCtxMenu();
});

// dismiss on outside click, focus loss, list scroll or resize — the menu is
// position:fixed, so anything that moves the list under it would leave it
// annotating the wrong entry
window.addEventListener('pointerdown', (event) => {
  if (!ctxMenu.hidden && !ctxMenu.contains(event.target)) closeCtxMenu();
});
window.addEventListener('blur', closeCtxMenu);
// capture-phase because scroll doesn't bubble; scoped to the panel, since
// only list scrolling moves the entry the menu is anchored to (collage
// scrolling — e.g. auto-scroll — doesn't invalidate it)
window.addEventListener(
  'scroll',
  (event) => {
    if (panel.contains(event.target)) closeCtxMenu();
  },
  true
);
window.addEventListener('resize', closeCtxMenu);
