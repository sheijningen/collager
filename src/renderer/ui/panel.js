'use strict';

/* ---------------- file panel & selection ----------------
 * A collapsible sidebar listing every loaded file, sortable by collage
 * order, name, path or type. Selection is shared between the list and the
 * collage: clicking a list entry scrolls the collage to that tile, clicking
 * a tile highlights its list entry. Ctrl toggles, Shift selects a range.
 */

const panel = document.getElementById('panel');
const fileList = document.getElementById('file-list');
const sortSelect = document.getElementById('sort-select');
const removeSelectedBtn = document.getElementById('btn-remove-selected');

/** hash -> list <li> element */
const listEntries = new Map();
const selected = new Set();
let selectionAnchor = null;
let sortMode = prefs.string('sort', 'added');
let panelOpen = prefs.bool('panel', true);

function sortedItems() {
  return sortItems(items, sortMode);
}

function renderList() {
  closeCtxMenu(); // list is being rebuilt under the menu
  if (!panelOpen) return; // hidden list is rebuilt on reopen (setPanelOpen → render)
  fileList.textContent = '';
  listEntries.clear();
  for (const item of sortedItems()) {
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

    li.addEventListener('click', (e) => handleSelectClick(item.hash, e, 'list'));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCtxMenu(item, e.clientX, e.clientY);
    });
    fileList.appendChild(li);
    listEntries.set(item.hash, li);
  }
  updateRemoveSelectedBtn();
}

function handleSelectClick(hash, event, source) {
  const next = clickSelection({
    selected,
    anchor: selectionAnchor,
    hash,
    ctrl: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    order: sortedItems().map((i) => i.hash)
  });
  selected.clear();
  for (const h of next.selected) selected.add(h);
  selectionAnchor = next.anchor;
  applySelection();

  if (source === 'list') {
    scrollCollageTo(hash);
  } else if (panelOpen) {
    const li = listEntries.get(hash);
    if (li) li.scrollIntoView({ block: 'nearest' });
  }
}

function applySelection() {
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
  virtualTop = top;
  scroller.scrollTo({ top, behavior: autoScroll ? 'auto' : 'smooth' });
}

function removeSelected() {
  if (!selected.size) return;
  const n = selected.size;
  if (!confirm(`Remove ${n} selected item${n === 1 ? '' : 's'} from the collage?`)) return;
  items = items.filter((i) => !selected.has(i.hash));
  selected.clear();
  selectionAnchor = null;
  render();
  persist();
  showToast(`Removed ${n} item${n === 1 ? '' : 's'}`);
}

function setPanelOpen(open) {
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

window.addEventListener('keydown', (e) => {
  // the menu paints above the lightbox, so it must win the Escape first
  if (e.key === 'Escape' && !ctxMenu.hidden) {
    closeCtxMenu();
    return;
  }
  if (!lightbox.hidden || anyOverlayOpen()) return;
  if (e.key === 'Delete' && selected.size) removeSelected();
  else if (e.key === 'Escape' && selected.size) {
    selected.clear();
    selectionAnchor = null;
    applySelection();
  } else if (e.key === 'Escape' && isFullscreen) {
    // last-resort exit so fullscreen is never a trap, even if the toolbar
    // (and its ⛶ button) is hidden; overlays above consumed Escape already
    window.api.toggleFullscreen();
  }
});

/* ---------------- context menu (right-click on a panel entry) ---------------- */

const ctxMenu = document.getElementById('ctx-menu');
const ctxPath = document.getElementById('ctx-path');
let ctxItem = null;

function openCtxMenu(item, x, y) {
  ctxItem = item;
  ctxPath.textContent = item.path;
  // measure at a neutral position (stale left/top from a previous opening
  // would cap shrink-to-fit width and skew the measurement), then clamp
  ctxMenu.style.left = '0px';
  ctxMenu.style.top = '0px';
  ctxMenu.hidden = false;
  const rect = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
}

function closeCtxMenu() {
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
window.addEventListener('pointerdown', (e) => {
  if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) closeCtxMenu();
});
window.addEventListener('blur', closeCtxMenu);
// capture-phase because scroll doesn't bubble; scoped to the panel, since
// only list scrolling moves the entry the menu is anchored to (collage
// scrolling — e.g. auto-scroll — doesn't invalidate it)
window.addEventListener(
  'scroll',
  (e) => {
    if (panel.contains(e.target)) closeCtxMenu();
  },
  true
);
window.addEventListener('resize', closeCtxMenu);
