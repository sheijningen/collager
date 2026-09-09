'use strict';

/* ---------------- keyboard shortcuts, help & about overlays ----------------
 * One place owns every global key binding that isn't already claimed by a
 * more specific handler (Escape layering in panel.js/lightbox.js, F11 in
 * app.js, Delete in panel.js). The help overlay is generated from SHORTCUTS
 * so the page and the actual bindings can't drift apart.
 */

const helpOverlay = document.getElementById('help-overlay');
const aboutOverlay = document.getElementById('about-overlay');
const shortcutList = document.getElementById('shortcut-list');

const SPEED_KEY_STEP = 10; // matches the slider's step

const SHORTCUTS = [
  ['Space', 'Start / stop auto-scroll'],
  [', / .', 'Auto-scroll slower / faster'],
  ['S', 'Shuffle the collage'],
  ['A', 'Add media files'],
  ['P', 'Show / hide the file panel'],
  ['T', 'Show / hide the toolbar'],
  ['− / +', 'Fewer / more columns'],
  ['F / F11', 'Toggle fullscreen'],
  ['Del', 'Remove the selected items'],
  ['Esc', 'Close overlays / clear the selection / exit fullscreen'],
  ['I', 'About Collager'],
  ['? / F1', 'Show this help'],
  ['Double-click', 'Open a tile in the lightbox'],
  ['Right-click (file list)', 'Copy path / show in folder']
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

function anyOverlayOpen() {
  return !helpOverlay.hidden || !aboutOverlay.hidden;
}

function closeOverlays() {
  helpOverlay.hidden = true;
  aboutOverlay.hidden = true;
}

/* about: filled from package.json metadata (via the main process) once */
let aboutLoaded = false;
async function openAbout() {
  closeOverlays();
  if (!aboutLoaded) {
    const info = await window.api.getAppInfo();
    document.getElementById('about-name').textContent = info.name;
    document.getElementById('about-version').textContent = `version ${info.version}`;
    document.getElementById('about-desc').textContent = info.description;
    const meta = document.getElementById('about-meta');
    const rows = [
      ['Author', info.author],
      ['License', info.license],
      ['Electron', info.electron],
      ['Chromium', info.chromium],
      ['Node', info.node],
      ['Platform', info.platform]
    ];
    for (const [term, value] of rows) {
      if (!value) continue;
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      meta.append(dt, dd);
    }
    aboutLoaded = true;
  }
  aboutOverlay.hidden = false;
}

for (const overlay of [helpOverlay, aboutOverlay]) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
}

document.getElementById('btn-help').addEventListener('click', () => {
  helpOverlay.hidden = !helpOverlay.hidden;
});
document.getElementById('app-title').addEventListener('click', openAbout);

/* Whether the focused element needs this key for itself (typing in a text
 * field, Space on a button/checkbox, arrows on the speed slider) — global
 * shortcuts must never steal those. */
function targetConsumesKey(target, key) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'BUTTON') return key === ' ' || key === 'Enter';
  if (tag === 'INPUT') {
    const type = target.type;
    if (type === 'checkbox' || type === 'radio') return key === ' ';
    if (type === 'range') {
      return [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown'
      ].includes(key);
    }
    return true; // text-like inputs consume everything
  }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (targetConsumesKey(e.target, e.key)) return;

  // overlays are modal: their toggles and Escape close them, all else is inert
  if (anyOverlayOpen()) {
    if (['Escape', '?', 'F1', 'i'].includes(e.key)) closeOverlays();
    return;
  }
  // ditto for the lightbox and the context menu (their own handlers react)
  if (!lightbox.hidden || !ctxMenu.hidden) return;

  switch (e.key) {
    case '?':
    case 'F1':
      e.preventDefault();
      helpOverlay.hidden = false;
      break;
    case 'i':
      if (!e.repeat) openAbout();
      break;
    case ' ':
      e.preventDefault(); // Space must not also page-scroll the collage
      if (!e.repeat) setAutoScroll(!autoScroll);
      break;
    case ',':
      setScrollSpeed(scrollSpeed - SPEED_KEY_STEP);
      showToast(`Auto-scroll speed: ${scrollSpeed} px/s`);
      break;
    case '.':
      setScrollSpeed(scrollSpeed + SPEED_KEY_STEP);
      showToast(`Auto-scroll speed: ${scrollSpeed} px/s`);
      break;
    case 's':
      if (!e.repeat && items.length) shuffle();
      break;
    case 'a':
      if (!e.repeat) document.getElementById('btn-add').click();
      break;
    case 'p':
      if (!e.repeat) setPanelOpen(!panelOpen);
      break;
    case 't':
      if (!e.repeat) setToolbarOpen(!toolbarOpen);
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
      // app.js) can only originate from the lightbox, which blocks shortcuts
      if (!e.repeat) window.api.toggleFullscreen();
      break;
  }
});
