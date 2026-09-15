/* Media elements shared by the tiles and the lightbox: building one from an
 * item, and the teardown that makes Chromium release what it holds for it. */

/* A looping, muted, autoplaying <video> or an <img> with the item's file as
 * source. The caller adds what its context needs (controls, inline play). */
export function createMediaElement(item) {
  if (item.type === 'video') {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.src = item.url;
    return video;
  }
  const image = document.createElement('img');
  image.src = item.url; // gifs loop natively
  return image;
}

/* Detaches the element and frees its media: a <video> only drops its decoder
 * and buffers once its source is gone and load() has run. */
export function releaseMedia(media) {
  if (media.tagName === 'VIDEO') {
    media.pause();
    media.removeAttribute('src');
    media.load();
  } else {
    media.removeAttribute('src');
  }
  media.remove();
}
