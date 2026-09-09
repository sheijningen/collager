'use strict';

/* ---------------- lightbox ----------------
 * Double-click a tile to view it enlarged; videos get native controls (and
 * can be unmuted there). Esc or a backdrop click closes it. */

const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightbox-content');

function openLightbox(item) {
  lightboxContent.textContent = '';
  const url = item.url;
  let media;
  if (item.type === 'video') {
    media = document.createElement('video');
    media.controls = true;
    media.loop = true;
    media.autoplay = true;
    media.muted = true; // stays muted by default; unmute via controls if wanted
    media.src = url;
  } else {
    media = document.createElement('img');
    media.src = url;
  }
  lightboxContent.appendChild(media);
  lightbox.hidden = false;
}

function closeLightbox() {
  const video = lightboxContent.querySelector('video');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  lightboxContent.textContent = '';
  lightbox.hidden = true;
}

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox || e.target === lightboxContent) closeLightbox();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
});
