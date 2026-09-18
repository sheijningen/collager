/* ---------------- lightbox ----------------
 * Double-click a tile to view it enlarged; videos get native controls (and
 * can be unmuted there). The arrow keys step through the collage from there,
 * and the collage follows so closing lands where the browsing stopped. A
 * backdrop click closes it, as does Escape through the ladder in shortcuts.js. */

import { findShowableNeighbour } from '../core/browse.js';
import { state } from './state.js';
import { createMediaElement, releaseMedia } from './media.js';
import { scrollCollageTo } from './panel.js';

export const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightbox-content');
export let shownHash = null;

export function openLightbox(item) {
  const media = createMediaElement(item);
  if (item.type === 'video') media.controls = true;
  // the item on show stays up until this one can paint, so a step does not
  // blink through to the backdrop
  media.hidden = true;
  const reveal = () => {
    if (shownHash !== item.hash) {
      releaseMedia(media); // stepped past before it loaded
      return;
    }
    for (const other of lightboxContent.querySelectorAll('img, video')) {
      if (other !== media) releaseMedia(other);
    }
    media.hidden = false;
  };
  media.addEventListener(item.type === 'video' ? 'loadeddata' : 'load', reveal, { once: true });
  media.addEventListener('error', reveal, { once: true });
  lightboxContent.appendChild(media);
  shownHash = item.hash;
  lightbox.hidden = false;
}

export function stepLightbox(direction) {
  const next = findShowableNeighbour(state.items, shownHash, direction);
  if (!next) return;
  openLightbox(next);
  scrollCollageTo(next.hash);
}

export function closeLightbox() {
  for (const media of lightboxContent.querySelectorAll('img, video')) releaseMedia(media);
  shownHash = null;
  lightbox.hidden = true;
}

lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox || event.target === lightboxContent) closeLightbox();
});
