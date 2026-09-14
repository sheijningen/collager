/* ---------------- collapsible toolbar ----------------
 * Collapsing gives the collage the full window height; the floating chevron
 * stays put so the toolbar can always be brought back. */

import { prefs } from './state.js';
import { render } from './collage.js';

const toolbarToggleBtn = document.getElementById('btn-toolbar-toggle');
export let toolbarOpen = prefs.bool('toolbar', true);

function applyToolbarOpen(open) {
  toolbarOpen = open;
  document.body.classList.toggle('toolbar-collapsed', !open);
  toolbarToggleBtn.innerHTML = open ? '&#x25B4;' : '&#x25BE;';
  toolbarToggleBtn.title = open ? 'Hide toolbar' : 'Show toolbar';
  prefs.set('toolbar', open);
}

export function setToolbarOpen(open) {
  applyToolbarOpen(open);
  // the height change can flip scrollbar presence, which changes the
  // packing width — same reason setPanelOpen re-renders
  render();
}

toolbarToggleBtn.addEventListener('click', () => setToolbarOpen(!toolbarOpen));
applyToolbarOpen(toolbarOpen); // the startup render in app.js picks the geometry up
