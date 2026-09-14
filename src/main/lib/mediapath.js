const fsp = require('fs').promises;
const path = require('path');
const { typeForPath } = require('./scan');

/* Whether a renderer-supplied value names an existing media file: a string
 * with a supported extension that stats as a regular file. Every IPC handler
 * that hands a path from the renderer to the shell goes through this, so the
 * renderer can never point the shell at something else. */
async function isMediaFile(filePath) {
  if (typeof filePath !== 'string' || !typeForPath(filePath)) return false;
  try {
    return (await fsp.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

/* The existing folder a media path points into, or null. A library entry
 * whose file is gone still has a folder worth showing; a value that is not a
 * media path, or whose folder does not exist, yields null. */
async function existingMediaFolder(filePath) {
  if (typeof filePath !== 'string' || !typeForPath(filePath)) return null;
  const folder = path.dirname(filePath);
  try {
    return (await fsp.stat(folder)).isDirectory() ? folder : null;
  } catch {
    return null;
  }
}

module.exports = { isMediaFile, existingMediaFolder };
