const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const MEDIA_EXTS = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image', // animated webp plays in <img> just like gif
  '.gif': 'gif',
  '.mp4': 'video',
  '.webm': 'video'
};

function typeForPath(p) {
  return MEDIA_EXTS[path.extname(p).toLowerCase()];
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Expand dropped paths: directories are walked recursively (symlink cycles
// are guarded via realpath), files are kept if their extension is supported.
async function collectMediaPaths(inputPaths) {
  const found = [];
  const skipped = [];
  const visitedDirs = new Set();

  async function walk(p) {
    let stat;
    try {
      stat = await fsp.stat(p);
    } catch {
      skipped.push(p);
      return;
    }
    if (stat.isDirectory()) {
      let real;
      try {
        real = await fsp.realpath(p);
      } catch {
        skipped.push(p);
        return;
      }
      if (visitedDirs.has(real)) return;
      visitedDirs.add(real);
      let entries;
      try {
        entries = await fsp.readdir(p);
      } catch {
        skipped.push(p);
        return;
      }
      for (const entry of entries) await walk(path.join(p, entry));
    } else {
      if (typeForPath(p)) found.push(p);
      else skipped.push(p);
    }
  }

  for (const p of inputPaths) await walk(p);
  return { found, skipped };
}

/* Expand paths, then hash the found media with bounded concurrency (large
 * video folders would otherwise read gigabytes strictly serially). Returns
 * entries in discovery order; unreadable files count as skipped. */
async function probeFiles(inputPaths, concurrency = 4, onProgress = null) {
  const { found, skipped } = await collectMediaPaths(inputPaths);
  const entries = new Array(found.length);
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < found.length) {
      const index = cursor++;
      const filePath = found[index];
      try {
        const hash = await hashFile(filePath);
        entries[index] = { path: filePath, hash, type: typeForPath(filePath) };
      } catch {
        skipped.push(filePath);
      }
      done++;
      if (onProgress) onProgress(done, found.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, found.length) }, worker));
  return { entries: entries.filter(Boolean), skippedCount: skipped.length };
}

module.exports = { MEDIA_EXTS, typeForPath, hashFile, collectMediaPaths, probeFiles };
