/* ---------------- file panel & selection ----------------
 * A collapsible sidebar listing every loaded file, sortable by collage
 * order, name, path or type. Selection is shared between the list and the
 * collage: clicking a list entry scrolls the collage to that tile, clicking
 * a tile highlights its list entry. Ctrl toggles, Shift selects a range.
 */

import { sortItems } from '../core/layout.js';
import { basename } from '../core/paths.js';
import { clickSelection } from '../core/selection.js';
import { buildListKey } from '../core/listkey.js';
import { countByExtension } from '../core/counts.js';
import { formatCount, fileProblem } from '../core/text.js';
import { state, selected, tiles, lastPositions, scroller, prefs, showToast } from './state.js';
import {
  render,
  removeItems,
  askRemoval,
  MISSING_FILE_HINT,
  UNSHOWABLE_FILE_HINT
} from './collage.js';
import { openCtxMenu, closeCtxMenu, ctxAnchoredTo } from './ctxmenu.js';
import { autoScroll, setAutoScrollPosition } from './autoscroll.js';
import { lightbox } from './lightbox.js';
import { anyOverlayOpen } from './shortcuts.js';

const panel = document.getElementById('panel');
export const fileList = document.getElementById('file-list');
export const sortSelect = document.getElementById('sort-select');
export const removeSelectedBtn = document.getElementById('btn-remove-selected');
export const panelCount = document.getElementById('panel-count');
export const panelBreakdown = document.getElementById('panel-breakdown');

/** hash -> list <li> element */
export const listEntries = new Map();
let sortMode = prefs.string('sort', 'added');
export let panelOpen = false; // always starts closed, never remembered
let renderedListKey = null; // what the list currently shows, or null while hidden
let breakdownOpen = false;

function sortedItems() {
  return sortItems(state.items, sortMode);
}

export function renderList() {
  if (!panelOpen) {
    if (ctxAnchoredTo('list')) closeCtxMenu(); // a tile's menu is unaffected
    renderedListKey = null; // rebuilt on reopen (setPanelOpen → render)
    return;
  }
  renderCounts();
  const items = sortedItems();
  const key = buildListKey(items, sortMode);
  if (key === renderedListKey) return; // selection classes are already current
  renderedListKey = key;
  if (ctxAnchoredTo('list')) closeCtxMenu(); // list is being rebuilt under the menu
  fileList.textContent = '';
  listEntries.clear();
  for (const item of items) {
    const li = document.createElement('li');
    const problem = fileProblem(item);
    li.className = (selected.has(item.hash) ? 'selected' : '') + (problem ? ` ${problem}` : '');
    li.title = item.path;
    if (problem === 'missing') li.title += `\n\n${MISSING_FILE_HINT}`;
    if (problem === 'unshowable') li.title += `\n\n${UNSHOWABLE_FILE_HINT}`;

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
      openCtxMenu(item, event.clientX, event.clientY, 'list');
    });
    fileList.appendChild(li);
    listEntries.set(item.hash, li);
  }
  updateRemoveSelectedBtn();
}

/* The total, and under it the split by extension while it is expanded. */
function renderCounts() {
  const { total, extensions } = countByExtension(state.items);
  panelCount.textContent = `${breakdownOpen ? '\u25BE' : '\u25B8'} ${formatCount(total, 'item')}`;
  panelCount.title = breakdownOpen ? 'Hide the split by file type' : 'Split the count by file type';
  panelCount.disabled = total === 0;
  panelCount.setAttribute('aria-expanded', String(breakdownOpen));

  panelBreakdown.hidden = !breakdownOpen || total === 0;
  panelBreakdown.textContent = '';
  if (panelBreakdown.hidden) return;
  for (const { extension, count } of extensions) {
    const row = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = extension;
    const value = document.createElement('span');
    value.className = 'ext-count';
    value.textContent = String(count);
    row.append(name, value);
    panelBreakdown.appendChild(row);
  }
}

export function setBreakdownOpen(open) {
  breakdownOpen = open;
  renderCounts();
}

export function handleSelectClick(hash, event, source) {
  const next = clickSelection({
    selected,
    anchor: state.selectionAnchor,
    hash,
    ctrl: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    // a range runs along the surface that was clicked: the sorted list for an
    // entry, the collage for a tile
    order: (source === 'list' ? sortedItems() : state.items).map((item) => item.hash)
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

export function scrollCollageTo(hash) {
  const pos = lastPositions.get(hash);
  if (!pos) return;
  const top = Math.max(0, pos.y - 40);
  // with auto-scroll running a smooth scroll cannot survive: the next tick
  // would treat the moving position as manual scrolling, adopt it and cancel
  // the animation — so jump instantly and hand the tick the new position.
  // Behind the lightbox nobody sees the animation, and it would hydrate
  // every tile it passes.
  setAutoScrollPosition(top);
  const instant = autoScroll || !lightbox.hidden;
  scroller.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
}

export async function removeSelected() {
  if (!selected.size) return;
  if (!(await askRemoval(formatCount(selected.size, 'selected item')))) return;
  const removed = removeItems((item) => !selected.has(item.hash));
  showToast(`Removed ${formatCount(removed, 'item')}`);
}

const panelToggleLabel = document.getElementById('panel-toggle-label');

function applyPanelOpen(open) {
  panelOpen = open;
  panel.classList.toggle('collapsed', !open);
  // the toggle sits in the Files menu, so its label says what a click does
  panelToggleLabel.textContent = open ? '☰ Hide file panel' : '☰ Show file panel';
}

export function setPanelOpen(open) {
  applyPanelOpen(open);
  render(); // collage width changed
}

removeSelectedBtn.addEventListener('click', removeSelected);
panelCount.addEventListener('click', () => setBreakdownOpen(!breakdownOpen));
document.getElementById('btn-panel').addEventListener('click', () => setPanelOpen(!panelOpen));
sortSelect.value = sortMode;
sortSelect.addEventListener('change', () => {
  sortMode = sortSelect.value;
  prefs.set('sort', sortMode);
  renderList();
});
applyPanelOpen(panelOpen);

// Delete removes the selection; Escape belongs to the ladder in shortcuts.js
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Delete' || !selected.size) return;
  if (!lightbox.hidden || anyOverlayOpen()) return;
  removeSelected();
});
