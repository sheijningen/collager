'use strict';

/* ---------------- context menu ----------------
 * Right-clicking a tile or a file panel entry opens the same menu for that
 * item: open it in the lightbox or the system's default app, copy the
 * path or the image itself, show the file in the file manager, remove it.
 * Actions that need the file on disk are disabled for missing items.
 */

const ctxMenu = document.getElementById('ctx-menu');
const ctxPath = document.getElementById('ctx-path');
const ctxOpenBtn = document.getElementById('ctx-open');
const ctxOpenExternalBtn = document.getElementById('ctx-open-external');
const ctxCopyImageBtn = document.getElementById('ctx-copy-image');
const ctxRevealBtn = document.getElementById('ctx-reveal');
const ctxRemoveBtn = document.getElementById('ctx-remove');
let ctxItem = null;
let ctxScrollAtOpen = null; // scroll offsets the menu was positioned against

/* the menu removes the whole selection when the clicked item is part of a
 * multi-selection, and only the clicked item otherwise */
function ctxRemovesSelection() {
  return ctxItem !== null && selected.size > 1 && selected.has(ctxItem.hash);
}

function openCtxMenu(item, x, y) {
  ctxItem = item;
  ctxPath.textContent = item.path;
  ctxOpenBtn.disabled = Boolean(item.missing);
  ctxOpenExternalBtn.disabled = Boolean(item.missing);
  ctxRevealBtn.disabled = Boolean(item.missing);
  // only still images can be put on the clipboard as a bitmap
  ctxCopyImageBtn.hidden = item.type !== 'image';
  ctxCopyImageBtn.disabled = Boolean(item.missing);
  ctxRemoveBtn.textContent = ctxRemovesSelection()
    ? `Remove ${selected.size} selected`
    : 'Remove from collage';
  // measure at a neutral position (stale left/top from a previous opening
  // would cap shrink-to-fit width and skew the measurement), then clamp
  ctxMenu.style.left = '0px';
  ctxMenu.style.top = '0px';
  ctxMenu.hidden = false;
  ctxScrollAtOpen = { collage: scroller.scrollTop, list: fileList.scrollTop };
  const rect = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
}

function closeCtxMenu() {
  ctxMenu.hidden = true;
  ctxItem = null;
}

ctxOpenBtn.addEventListener('click', () => {
  const item = ctxItem;
  closeCtxMenu();
  if (item && !item.missing) openLightbox(item);
});

ctxOpenExternalBtn.addEventListener('click', async () => {
  const item = ctxItem;
  closeCtxMenu();
  if (!item || item.missing) return;
  const error = await window.api.openExternally(item.path);
  if (error) showToast(`Could not open the file: ${error}`);
});

ctxRemoveBtn.addEventListener('click', () => {
  const item = ctxItem;
  const wholeSelection = ctxRemovesSelection();
  closeCtxMenu();
  if (!item) return;
  if (wholeSelection) {
    removeSelected();
  } else {
    removeItem(item.hash);
    showToast('Removed 1 item');
  }
});

document.getElementById('ctx-copy').addEventListener('click', async () => {
  const item = ctxItem;
  closeCtxMenu();
  if (!item) return;
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
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encoding failed'))));
      } catch (err) {
        reject(err); // a canvas this large may be refused
      }
    };
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

ctxCopyImageBtn.addEventListener('click', async () => {
  const item = ctxItem;
  closeCtxMenu();
  if (!item || item.missing) return;
  try {
    const blob = await loadImageAsPngBlob(item.url);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('Image copied to clipboard');
  } catch {
    showToast('Could not copy the image');
  }
});

ctxRevealBtn.addEventListener('click', () => {
  const item = ctxItem;
  closeCtxMenu();
  if (item && !item.missing) window.api.revealFile(item.path);
});

// dismiss on outside click, focus loss, scroll or resize: the menu is
// position:fixed, so anything that moves the item under it would leave the
// menu annotating the wrong tile or entry
window.addEventListener('pointerdown', (e) => {
  if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) closeCtxMenu();
});
window.addEventListener('blur', closeCtxMenu);
// capture-phase because scroll doesn't bubble. Auto-scroll holds while the
// menu is open, but the scroll event of its last tick can still arrive after
// the menu opened; only a scroll that moved the anchor since then closes it.
window.addEventListener(
  'scroll',
  () => {
    if (ctxMenu.hidden || ctxScrollAtOpen === null) return;
    const moved =
      scroller.scrollTop !== ctxScrollAtOpen.collage || fileList.scrollTop !== ctxScrollAtOpen.list;
    if (moved) closeCtxMenu();
  },
  true
);
window.addEventListener('resize', closeCtxMenu);
