/* ---------------- keyboard shortcuts, help & about overlays ----------------
 * One place owns every global key binding that isn't already claimed by a
 * more specific handler (F11 in fullscreen.js, Delete in panel.js), and the
 * Escape ladder. Toolbar dropdowns are not modal, so the shortcuts stay live
 * while one is open. The help overlay is generated from SHORTCUTS so the page
 * and the actual bindings can't drift apart.
 */

import { targetConsumesKey, normalizeShortcutKey, SCROLL_KEYS } from '../core/keys.js';
import { state, selected, showToast, runOrToast } from './state.js';
import { SCROLL_SPEED_STEP } from '../core/autoscroll.js';
import { autoScroll, scrollSpeed, setAutoScroll, setScrollSpeed } from './autoscroll.js';
import { columns, setColumns, shuffle } from './collage.js';
import { panelOpen, setPanelOpen, applySelection } from './panel.js';
import { ctxMenu, closeCtxMenu } from './ctxmenu.js';
import { toolbarOpen, setToolbarOpen } from './toolbar.js';
import { openDropdownId, closeDropdown } from './dropdown.js';
import { lightbox, closeLightbox, stepLightbox } from './lightbox.js';
import { isFullscreen } from './fullscreen.js';

export const helpOverlay = document.getElementById('help-overlay');
export const aboutOverlay = document.getElementById('about-overlay');
export const shortcutList = document.getElementById('shortcut-list');

export const SHORTCUTS = [
  ['Space', 'Start / stop auto-scroll'],
  [', / .', 'Auto-scroll slower / faster'],
  ['S', 'Shuffle the collage'],
  ['A', 'Add media files'],
  ['Shift+A', 'Add a folder'],
  ['P', 'Show / hide the file panel'],
  ['T', 'Show / hide the toolbar'],
  ['− / +', 'Fewer / more columns'],
  ['F / F11', 'Toggle fullscreen'],
  ['Del', 'Remove the selected items'],
  ['Esc', 'Close overlays / clear the selection / exit fullscreen'],
  ['I', 'About Collager'],
  ['? / F1', 'Show this help'],
  ['Double-click', 'Maximize a tile'],
  ['← / →', 'Previous / next item while maximized'],
  ['Right-click', 'Item menu: maximize, open, copy path or image, show in folder, remove']
];

for (const [keys, action] of SHORTCUTS) {
  const row = document.createElement('tr');
  const keyCell = document.createElement('td');
  const kbd = document.createElement('kbd');
  kbd.textContent = keys;
  keyCell.appendChild(kbd);
  const actionCell = document.createElement('td');
  actionCell.textContent = action;
  row.append(keyCell, actionCell);
  shortcutList.appendChild(row);
}

export function anyOverlayOpen() {
  return !helpOverlay.hidden || !aboutOverlay.hidden;
}

function openHelp() {
  closeDropdown(); // overlays are modal; a popup left open would sit on top
  helpOverlay.hidden = false;
}

export function closeOverlays() {
  helpOverlay.hidden = true;
  aboutOverlay.hidden = true;
}

/* about: filled from package.json metadata (via the main process) once. The
 * fill in flight is kept, so a second opening before it lands shares it
 * instead of appending the rows twice. */
let aboutFill = null;
async function fillAbout() {
  const info = await window.api.getAppInfo();
  document.getElementById('about-name').textContent = info.name;
  document.getElementById('about-version').textContent = `version ${info.version}`;
  document.getElementById('about-desc').textContent = info.description;
  const meta = document.getElementById('about-meta');
  meta.textContent = ''; // a retry after a failure starts from no rows
  const rows = [
    ['Author', info.author],
    ['License', info.license]
  ];
  for (const [term, value] of rows) {
    if (!value) continue;
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    meta.append(dt, dd);
  }
  return true;
}

async function openAbout() {
  closeOverlays();
  closeDropdown();
  if (aboutFill === null) aboutFill = fillAbout();
  const filled = await runOrToast(() => aboutFill, 'Could not load the About information');
  if (!filled) {
    aboutFill = null; // the next opening asks again
    return;
  }
  aboutOverlay.hidden = false;
}

for (const overlay of [helpOverlay, aboutOverlay]) {
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.hidden = true;
  });
}

document.getElementById('btn-help').addEventListener('click', () => {
  if (helpOverlay.hidden) openHelp();
  else helpOverlay.hidden = true;
});
document.getElementById('app-title').addEventListener('click', openAbout);

/* Escape closes exactly one layer, top-most first: toolbar dropdown, context
 * menu, lightbox, help/about overlay, selection, fullscreen. One handler owns
 * the ladder so the order cannot depend on which module registered its
 * listener first. */
function handleEscape() {
  if (openDropdownId()) {
    closeDropdown();
    return;
  }
  if (!ctxMenu.hidden) {
    closeCtxMenu();
    return;
  }
  if (!lightbox.hidden) {
    closeLightbox();
    return;
  }
  if (anyOverlayOpen()) {
    closeOverlays();
    return;
  }
  if (selected.size) {
    selected.clear();
    state.selectionAnchor = null;
    applySelection();
    return;
  }
  // last-resort exit so fullscreen is never a trap, even with the toolbar
  // (and its ⛶ button) hidden
  if (isFullscreen) window.api.toggleFullscreen();
}

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === 'Escape') {
    handleEscape();
    return;
  }
  if (targetConsumesKey(event.target, event.key)) return;
  const key = normalizeShortcutKey(event.key);

  // overlays are modal: their toggles close them, all else is inert
  if (anyOverlayOpen()) {
    if (['?', 'F1', 'i'].includes(key)) closeOverlays();
    return;
  }
  // the lightbox and the context menu are modal too; Escape left above, so
  // every remaining key is inert while either is open, bar stepping through
  // the collage from the lightbox
  if (!lightbox.hidden) {
    // the collage behind the backdrop must not scroll away from the shown item
    if (SCROLL_KEYS.includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      stepLightbox(event.key === 'ArrowRight' ? 1 : -1);
    }
    return;
  }
  if (!ctxMenu.hidden) return;

  switch (key) {
    case '?':
    case 'F1':
      event.preventDefault();
      openHelp();
      break;
    case 'i':
      if (!event.repeat) openAbout();
      break;
    case ' ':
      event.preventDefault(); // Space must not also page-scroll the collage
      if (!event.repeat) setAutoScroll(!autoScroll);
      break;
    case ',':
      setScrollSpeed(scrollSpeed - SCROLL_SPEED_STEP);
      showToast(`Auto-scroll speed: ${scrollSpeed} px/s`);
      break;
    case '.':
      setScrollSpeed(scrollSpeed + SCROLL_SPEED_STEP);
      showToast(`Auto-scroll speed: ${scrollSpeed} px/s`);
      break;
    case 's':
      if (!event.repeat && state.items.length) shuffle();
      break;
    case 'a': {
      // the modifier, not the letter's case, so caps lock cannot swap the two
      const button = event.shiftKey ? 'btn-add-folder' : 'btn-add';
      if (!event.repeat) document.getElementById(button).click();
      break;
    }
    case 'p':
      if (!event.repeat) setPanelOpen(!panelOpen);
      break;
    case 't':
      if (!event.repeat) setToolbarOpen(!toolbarOpen);
      break;
    case '-':
      setColumns(columns - 1);
      break;
    case '+':
    case '=': // the same key as + on most layouts, unshifted
      setColumns(columns + 1);
      break;
    case 'f':
      // plain toggle is safe here: element-fullscreen (the F11 edge case in
      // fullscreen.js) can only originate from the lightbox, which blocks shortcuts
      if (!event.repeat) window.api.toggleFullscreen();
      break;
  }
});
