const fsp = require('fs').promises;
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

/**
 * Gate for writing exported images. The renderer may only write to the path
 * the native save dialog returned, once per approval, as chunks that arrive
 * in order; the encoded image can run to hundreds of megabytes, so it never
 * crosses IPC in one piece. An abandoned write is discarded (file removed)
 * when the next export is approved or the renderer aborts.
 */
function createExportWriter() {
  let approvedPath = null;
  let current = null; // { path, handle } while a write is in progress

  async function discardCurrent(removeFile) {
    if (current === null) return;
    const { path: filePath, handle } = current;
    current = null;
    try {
      await handle.close();
    } catch {}
    if (removeFile) {
      try {
        await fsp.unlink(filePath);
      } catch {}
    }
  }

  return {
    /* Records the dialog's choice as the only writable path. A name without
     * a known image extension is saved as PNG, since the renderer derives the
     * encoding from the extension. Returns the path to write, or null. */
    async approve(filePath) {
      await discardCurrent(true);
      if (typeof filePath !== 'string' || !filePath) {
        approvedPath = null;
        return null;
      }
      const extension = path.extname(filePath).toLowerCase();
      approvedPath = IMAGE_EXTENSIONS.has(extension) ? filePath : `${filePath}.png`;
      return approvedPath;
    },

    /* Appends one chunk; the first chunk consumes the approval and creates
     * the file, `last` closes it. */
    async writeChunk(filePath, bytes, last) {
      if (!(bytes instanceof Uint8Array)) throw new Error('export payload must be bytes');
      if (current === null) {
        if (approvedPath === null || filePath !== approvedPath) {
          throw new Error('export destination was not chosen through the save dialog');
        }
        approvedPath = null;
        current = { path: filePath, handle: await fsp.open(filePath, 'w') };
      } else if (filePath !== current.path) {
        throw new Error('another export is being written');
      }
      try {
        await current.handle.write(bytes);
      } catch (err) {
        await discardCurrent(true);
        throw err;
      }
      if (last) await discardCurrent(false);
    },

    abort() {
      return discardCurrent(true);
    }
  };
}

module.exports = { createExportWriter, IMAGE_EXTENSIONS };
