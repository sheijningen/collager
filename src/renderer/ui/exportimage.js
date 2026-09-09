'use strict';

/* ---------------- export the collage as an image ----------------
 * Draws every item at its packed position onto one canvas, exactly as the
 * collage is laid out at the current width and column count, and saves it
 * as PNG or JPEG (chosen by the extension picked in the save dialog).
 * Videos contribute the frame currently on screen, or their first frame
 * when they are not hydrated. Missing items appear as empty tiles. Collages
 * beyond the canvas limits are scaled down as a whole.
 */

const exportBtn = document.getElementById('btn-export');
const EXPORT_LOAD_CONCURRENCY = 6;
const EXPORT_LOAD_TIMEOUT_MS = 10000; // a stalled file becomes an empty tile, not a hang
const EXPORT_CHUNK_BYTES = 8 * 1024 * 1024;
let exporting = false;

/* Resolves to a drawable source plus a release function, or to null when
 * the media cannot be loaded (it is then left as an empty tile). Media that
 * is on screen is drawn as shown, so videos and GIFs keep their current
 * frame; anything else is loaded off screen. */
function loadExportSource(item) {
  if (item.missing) return Promise.resolve(null);
  const tile = tiles.get(item.hash);
  const onScreen = tile && tile.querySelector('img, video');
  if (onScreen && exportSourceIsReady(onScreen)) {
    return Promise.resolve({ source: onScreen, release() {} });
  }
  return new Promise((resolve) => {
    let media;
    let settled = false;
    function finish(source) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!source) releaseExportMedia(media);
      resolve(source ? { source, release: () => releaseExportMedia(media) } : null);
    }
    const timer = setTimeout(() => finish(null), EXPORT_LOAD_TIMEOUT_MS);
    if (item.type === 'video') {
      media = document.createElement('video');
      media.muted = true;
      media.preload = 'auto';
      media.onloadeddata = () => finish(media);
    } else {
      media = new Image();
      media.onload = () => finish(media);
    }
    media.onerror = () => finish(null);
    media.src = item.url;
  });
}

function exportSourceIsReady(media) {
  // HAVE_CURRENT_DATA: the frame shown right now can be drawn as-is
  if (media.tagName === 'VIDEO') return media.readyState >= 2;
  return media.complete && media.naturalWidth > 0;
}

function releaseExportMedia(media) {
  if (!media) return;
  media.removeAttribute('src');
  if (media.tagName === 'VIDEO') media.load();
}

/* Renders the collage to a canvas and encodes it. Resolves to the encoded
 * blob and the pixel size of the image. */
async function renderCollageImage({ mime, quality, onProgress = null }) {
  const { positions, width, height } = packCurrentLayout();
  const fullWidth = width + GAP * 2;
  const fullHeight = height + GAP * 2;
  const scale = fitExportScale(fullWidth, fullHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(fullWidth * scale));
  canvas.height = Math.max(1, Math.round(fullHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const styles = getComputedStyle(document.documentElement);
  ctx.fillStyle = styles.getPropertyValue('--bg').trim() || '#111114';
  ctx.fillRect(0, 0, fullWidth, fullHeight);
  const tileBackground = styles.getPropertyValue('--bg-tile').trim() || '#1d1d23';

  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < positions.length) {
      const pos = positions[cursor++];
      const loaded = await loadExportSource(pos.item);
      ctx.fillStyle = tileBackground;
      ctx.fillRect(pos.x + GAP, pos.y + GAP, pos.w, pos.h);
      if (loaded) {
        try {
          ctx.drawImage(loaded.source, pos.x + GAP, pos.y + GAP, pos.w, pos.h);
        } catch {}
        loaded.release();
      }
      done++;
      if (onProgress) onProgress(done, positions.length);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(EXPORT_LOAD_CONCURRENCY, positions.length) }, worker)
  );

  const { width: pixelWidth, height: pixelHeight } = canvas;
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('image encoding failed'))),
      mime,
      quality
    );
  });
  canvas.width = 0; // free the bitmap now; the encoded blob is all that is needed
  canvas.height = 0;
  return { blob, width: pixelWidth, height: pixelHeight };
}

/* Streams the encoded image to the main process in chunks, which appends
 * them to the approved file. */
async function writeExportBlob(filePath, blob) {
  let offset = 0;
  do {
    const end = Math.min(offset + EXPORT_CHUNK_BYTES, blob.size);
    const chunk = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
    await window.api.writeExportChunk(filePath, chunk, end >= blob.size);
    offset = end;
  } while (offset < blob.size);
}

async function exportCollage() {
  if (exporting) return;
  if (!items.length) {
    showToast('Nothing to export');
    return;
  }
  exporting = true;
  exportBtn.disabled = true;
  // hold the collage still: a restart-with-shuffle mid-export would rebuild
  // the tiles the export is reading from
  const resumeAutoScroll = autoScroll;
  setAutoScroll(false);
  let filePath = null;
  try {
    const defaultName = `collage-${new Date().toISOString().slice(0, 10)}.png`;
    filePath = await window.api.pickExportPath(defaultName);
    if (!filePath) return;
    const jpeg = /\.jpe?g$/i.test(filePath);
    const { blob, width, height } = await renderCollageImage({
      mime: jpeg ? 'image/jpeg' : 'image/png',
      quality: 0.92,
      onProgress: (done, total) => showToast(`Exporting: rendering ${done}/${total}…`, true)
    });
    showToast('Exporting: writing file…', true);
    await writeExportBlob(filePath, blob);
    showToast(`Exported ${width}×${height} to ${basename(filePath)}`);
  } catch (err) {
    console.error('Export failed', err);
    if (filePath) window.api.abortExportWrite().catch(() => {});
    showToast('Could not export the collage');
  } finally {
    exporting = false;
    exportBtn.disabled = false;
    if (resumeAutoScroll) setAutoScroll(true);
  }
}

exportBtn.addEventListener('click', exportCollage);
