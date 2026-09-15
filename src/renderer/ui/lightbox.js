/* ---------------- lightbox ----------------
 * Double-click a tile to view it enlarged; videos get native controls (and
 * can be unmuted there). A backdrop click closes it, as does Escape through
 * the ladder in shortcuts.js. */

import { createMediaElement, releaseMedia } from './media.js';

export const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightbox-content');

export function openLightbox(item) {
  lightboxContent.textContent = '';
  const media = createMediaElement(item);
  if (item.type === 'video') media.controls = true;
  lightboxContent.appendChild(media);
  lightbox.hidden = false;
}

export function closeLightbox() {
  const media = lightboxContent.querySelector('img, video');
  if (media) releaseMedia(media);
  lightbox.hidden = true;
}

lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox || event.target === lightboxContent) closeLightbox();
});
