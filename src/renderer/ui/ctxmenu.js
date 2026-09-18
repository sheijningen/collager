/* ---------------- context menu ----------------
 * Right-clicking a tile or a file panel entry opens the same menu for that
 * item: maximize it or open it in the system's default app, copy the path
 * or the image itself, show the file in the file manager, remove it. Actions
 * that need the file on disk are disabled for missing items; showing in the
 * file manager stays live, since it falls back to the folder the file was in.
 * On a multi-selection only remove is offered, since the rest name one file.
 */

import { menuActsOnSelection, menuHeader, removeLabel } from '../core/itemmenu.js';
import { formatCount, fileProblem } from '../core/text.js';
import { selected, scroller, showToast } from './state.js';
import { removeItems } from './collage.js';
import { fileList, removeSelected } from './panel.js';
import { openLightbox } from './lightbox.js';
import { showPopupAt } from './popup.js';

export const ctxMenu = document.getElementById('ctx-menu');
const ctxPath = document.getElementById('ctx-path');
const ctxOpenBtn = document.getElementById('ctx-open');
const ctxOpenExternalBtn = document.getElementById('ctx-open-external');
const ctxCopyImageBtn = document.getElementById('ctx-copy-image');
const ctxCopyBtn = document.getElementById('ctx-copy');
const ctxRevealBtn = document.getElementById('ctx-reveal');
const ctxRemoveBtn = document.getElementById('ctx-remove');
let ctxItem = null;
let ctxSource = null; // 'tile' or 'list': which surface the menu is anchored to
let ctxScrollAtOpen = null; // scroll offset the menu was positioned against

/* the container that moves the anchor under the menu: the file list for an
 * entry, the collage for a tile */
function anchorScroller() {
  return ctxSource === 'list' ? fileList : scroller;
}

/* a rebuilt list moves entries and a re-laid-out collage moves tiles; either
 * one leaves the menu annotating the wrong thing, but only for the surface it
 * is anchored to. False while the menu is closed. */
export function ctxAnchoredTo(source) {
  return ctxSource === source;
}

function ctxActsOnSelection() {
  return ctxItem !== null && menuActsOnSelection(selected.size, selected.has(ctxItem.hash));
}

export function openCtxMenu(item, x, y, source) {
  ctxItem = item;
  ctxSource = source;
  const wholeSelection = ctxActsOnSelection();
  // one path, one file to open or copy: the single-item actions are off the
  // menu for a selection, leaving remove as the only thing it can do
  ctxPath.textContent = menuHeader(item.path, selected.size, wholeSelection);
  ctxPath.classList.toggle('count', wholeSelection);
  for (const button of [ctxOpenBtn, ctxOpenExternalBtn, ctxCopyBtn, ctxRevealBtn]) {
    button.hidden = wholeSelection;
  }
  const showable = fileProblem(item) === null;
  ctxOpenBtn.disabled = !showable;
  // an unshowable file still opens in the default app, which may decode it
  ctxOpenExternalBtn.disabled = Boolean(item.missing);
  // only still images can be put on the clipboard as a bitmap
  ctxCopyImageBtn.hidden = wholeSelection || item.type !== 'image';
  ctxCopyImageBtn.disabled = !showable;
  ctxRemoveBtn.textContent = removeLabel(selected.size, wholeSelection);
  showPopupAt(ctxMenu, x, y);
  ctxScrollAtOpen = anchorScroller().scrollTop;
}

export function closeCtxMenu() {
  ctxMenu.hidden = true;
  ctxItem = null;
  ctxSource = null;
  ctxScrollAtOpen = null;
}

/* Wires a menu button. The click closes the menu first, then `run` gets the
 * item the menu was opened on and whether it acts on the whole selection; a
 * click that finds the menu already closed does nothing. */
function onMenuAction(button, run) {
  button.addEventListener('click', () => {
    const item = ctxItem;
    const wholeSelection = ctxActsOnSelection();
    closeCtxMenu();
    if (item) run(item, wholeSelection);
  });
}

/* Sends a request to the shell and toasts when it comes back with a reason
 * or fails outright; `action` names what could not be done. */
async function requestFromShell(request, action) {
  try {
    const error = await request();
    if (error) showToast(`Could not ${action}: ${error}`);
  } catch {
    showToast(`Could not ${action}`);
  }
}

onMenuAction(ctxOpenBtn, (item) => {
  if (!fileProblem(item)) openLightbox(item);
});

onMenuAction(ctxOpenExternalBtn, (item) => {
  if (!item.missing) requestFromShell(() => window.api.openExternally(item.path), 'open the file');
});

onMenuAction(ctxRemoveBtn, (item, wholeSelection) => {
  if (wholeSelection) {
    removeSelected();
  } else {
    removeItems((candidate) => candidate.hash !== item.hash);
    showToast(`Removed ${formatCount(1, 'item')}`);
  }
});

onMenuAction(ctxCopyBtn, async (item) => {
  try {
    await navigator.clipboard.writeText(item.path);
    showToast('Path copied to clipboard');
  } catch {
    showToast('Could not access the clipboard');
  }
});

/* Decode through an <img> and re-encode as PNG: the clipboard only takes
 * PNG bitmaps, while the file may be JPEG or WebP. */
function loadImageAsPngBlob(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encoding failed'))));
      } catch (err) {
        reject(err); // a canvas this large may be refused
      }
    };
    image.onerror = () => reject(new Error('image failed to load'));
    image.src = url;
  });
}

onMenuAction(ctxCopyImageBtn, async (item) => {
  if (fileProblem(item)) return;
  try {
    const blob = await loadImageAsPngBlob(item.url);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('Image copied to clipboard');
  } catch {
    showToast('Could not copy the image');
  }
});

// a missing file has no entry to select, so the main process opens the folder
// it was in instead, and says so when that folder has gone too
onMenuAction(ctxRevealBtn, (item) => {
  requestFromShell(() => window.api.revealFile(item.path), 'show the file');
});

// dismiss on outside click, focus loss, scroll or resize: the menu is
// position:fixed, so anything that moves the item under it would leave the
// menu annotating the wrong tile or entry
window.addEventListener('pointerdown', (event) => {
  if (!ctxMenu.hidden && !ctxMenu.contains(event.target)) closeCtxMenu();
});
window.addEventListener('blur', closeCtxMenu);
// capture-phase because scroll doesn't bubble. Only the container holding the
// anchor counts: scrolling the collage leaves a list entry where it was, and
// the other way round. Auto-scroll holds while the menu is open, but the
// scroll event of its last tick can still arrive after the menu opened, so
// an event alone is not movement: only a changed offset is.
window.addEventListener(
  'scroll',
  () => {
    if (ctxMenu.hidden || ctxScrollAtOpen === null) return;
    if (anchorScroller().scrollTop !== ctxScrollAtOpen) closeCtxMenu();
  },
  true
);
window.addEventListener('resize', closeCtxMenu);
