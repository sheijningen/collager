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

function typeForPath(filePath) {
  return MEDIA_EXTS[path.extname(filePath).toLowerCase()];
}

/* Resolves to the SHA-256 of the whole file and the number of bytes that went
 * into it. */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let size = 0;
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => {
      hash.update(chunk);
      size += chunk.length;
    });
    stream.on('end', () => resolve({ hash: hash.digest('hex'), size }));
  });
}

const SAMPLE_BYTES = 1024 * 1024;
const SAMPLED_HASH_PREFIX = 'sampled-';

/* Reads exactly `length` bytes at `offset`. A read may return fewer bytes than
 * asked (network and FUSE mounts do this), so it reads until the buffer is
 * full. Running out before that means the file shrank under us, and hashing
 * the short sample would silently give it another identity, so it rejects. */
async function readExactly(handle, offset, length) {
  const buffer = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(buffer, filled, length - filled, offset + filled);
    if (bytesRead === 0) throw new Error(`${length} bytes at ${offset} ran out after ${filled}`);
    filled += bytesRead;
  }
  return buffer;
}

/* Videos are identified by a SHA-256 over their byte size and three 1 MiB
 * samples (start, middle, end) rather than every byte: hashing a folder of
 * videos would otherwise read gigabytes. Files no longer than the three
 * samples together are hashed whole. The prefix marks the scheme, so an
 * entry hashed over its full content can be told apart and migrated. */
async function hashFileSampled(filePath) {
  const handle = await fsp.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    const hash = crypto.createHash('sha256');
    const sizeBytes = Buffer.alloc(8);
    sizeBytes.writeBigUInt64BE(BigInt(size));
    hash.update(sizeBytes);
    const ranges =
      size <= SAMPLE_BYTES * 3
        ? [{ offset: 0, length: size }]
        : [
            { offset: 0, length: SAMPLE_BYTES },
            { offset: Math.floor((size - SAMPLE_BYTES) / 2), length: SAMPLE_BYTES },
            { offset: size - SAMPLE_BYTES, length: SAMPLE_BYTES }
          ];
    for (const { offset, length } of ranges) hash.update(await readExactly(handle, offset, length));
    return { hash: SAMPLED_HASH_PREFIX + hash.digest('hex'), size };
  } finally {
    await handle.close();
  }
}

function isSampledHash(hash) {
  return typeof hash === 'string' && hash.startsWith(SAMPLED_HASH_PREFIX);
}

/* Resolves to the hash for the media type and the byte size it was taken
 * over, both from the same read of the file, so an entry never stores a size
 * that describes different bytes than its hash does. */
function hashMedia(filePath, type) {
  return type === 'video' ? hashFileSampled(filePath) : hashFile(filePath);
}

/* Runs `task(element, index)` over `list` with at most `concurrency` calls in
 * flight, so a batch of disk reads overlaps without flooding the disk, and
 * reports each completion as `onProgress(done, total)`. A task must handle
 * its own failures: one that rejects fails the whole run. */
async function runWithConcurrency(list, concurrency, task, onProgress = null) {
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < list.length) {
      const index = cursor++;
      await task(list[index], index);
      done++;
      if (onProgress) onProgress(done, list.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
}

/* Distinct extensions of `paths`, the ones that dominate the drop first so a
 * capped list still names them. A dotfile has no extension and is left out. */
function summarizeExtensions(paths) {
  const counts = new Map();
  for (const filePath of paths) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext) counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([extA, countA], [extB, countB]) => countB - countA || extA.localeCompare(extB))
    .map(([ext]) => ext);
}

// Expand dropped paths: directories are walked recursively (symlink cycles
// are guarded via realpath). Every path walked lands in exactly one of the
// three lists.
async function collectMediaPaths(inputPaths) {
  const found = [];
  const unsupported = [];
  const unreadable = [];
  const visitedDirs = new Set();

  async function walk(entryPath) {
    let stat;
    try {
      stat = await fsp.stat(entryPath);
    } catch {
      unreadable.push(entryPath);
      return;
    }
    if (stat.isDirectory()) {
      let real;
      try {
        real = await fsp.realpath(entryPath);
      } catch {
        unreadable.push(entryPath);
        return;
      }
      if (visitedDirs.has(real)) return;
      visitedDirs.add(real);
      let entries;
      try {
        entries = await fsp.readdir(entryPath);
      } catch {
        unreadable.push(entryPath);
        return;
      }
      for (const entry of entries) await walk(path.join(entryPath, entry));
    } else if (typeForPath(entryPath)) {
      found.push(entryPath);
    } else {
      unsupported.push(entryPath);
    }
  }

  for (const inputPath of inputPaths) await walk(inputPath);
  return { found, unsupported, unreadable };
}

/* Expand paths, then hash the found media with bounded concurrency so a
 * large drop overlaps its disk reads. Returns entries in discovery order,
 * and counts what was left out: unsupported formats (with the extensions,
 * so the user learns what to convert) and files that could not be read,
 * a failed hash included. */
async function probeFiles(inputPaths, concurrency = 4, onProgress = null) {
  const { found, unsupported, unreadable } = await collectMediaPaths(inputPaths);
  const entries = new Array(found.length);
  await runWithConcurrency(
    found,
    concurrency,
    async (filePath, index) => {
      const type = typeForPath(filePath);
      try {
        // the size lets a later load tell that the file changed (a copy that
        // was still running when it was dropped)
        const { hash, size } = await hashMedia(filePath, type);
        entries[index] = { path: filePath, hash, type, size };
      } catch {
        unreadable.push(filePath);
      }
    },
    onProgress
  );
  return {
    entries: entries.filter(Boolean),
    unsupportedCount: unsupported.length,
    unsupportedExtensions: summarizeExtensions(unsupported),
    unreadableCount: unreadable.length
  };
}

/* Rehashes items whose stored hash no longer describes the file: the size on
 * disk moved away from the stored one (a copy that was still running when it
 * was added), or a video hash predates the sampled scheme. `sizeOnDisk` holds
 * the current size of every present item; an item without one is missing and
 * left alone. Items without a stored size get theirs filled in. When a rehash
 * lands on another entry's hash the two hold the same media under two names:
 * a present entry survives over a missing one, otherwise the earlier one does.
 * Resolves to the items to keep, the rehashed and collapsed counts, and
 * whether anything changed and is worth saving. Items are updated in place. */
async function rehashStaleItems(items, sizeOnDisk, concurrency = 4) {
  const stale = [];
  let sized = 0;
  for (const item of items) {
    const size = sizeOnDisk.get(item);
    if (size === undefined) continue;
    const outdatedScheme = item.type === 'video' && !isSampledHash(item.hash);
    const contentMoved = typeof item.size === 'number' && item.size !== size;
    if (outdatedScheme || contentMoved) {
      // the size lands with the new hash, so a failed rehash stays stale
      stale.push(item);
      continue;
    }
    if (typeof item.size !== 'number') sized++;
    item.size = size;
  }
  if (!stale.length) return { items, rehashed: 0, collapsed: 0, changed: sized > 0 };

  const rehashedItems = new Set();
  await runWithConcurrency(stale, concurrency, async (item) => {
    try {
      const { hash, size } = await hashMedia(item.path, item.type);
      item.hash = hash;
      item.size = size;
      rehashedItems.add(item);
    } catch {
      // unreadable right now: keeps its hash and is retried on the next start
    }
  });
  const rehashedHashes = new Set([...rehashedItems].map((item) => item.hash));
  // a missing entry must not outlive a present one on the same hash, or the
  // library would show a missing tile for a file that is on disk
  const survivorByHash = new Map();
  for (const item of items) {
    if (!rehashedHashes.has(item.hash)) continue;
    const survivor = survivorByHash.get(item.hash);
    if (!survivor || (survivor.missing && !item.missing)) survivorByHash.set(item.hash, item);
  }
  const kept = items.filter(
    (item) => !rehashedHashes.has(item.hash) || survivorByHash.get(item.hash) === item
  );
  return {
    items: kept,
    rehashed: rehashedItems.size,
    collapsed: items.length - kept.length,
    changed: sized > 0 || rehashedItems.size > 0
  };
}

module.exports = {
  MEDIA_EXTS,
  SAMPLE_BYTES,
  typeForPath,
  readExactly,
  hashFile,
  hashFileSampled,
  isSampledHash,
  runWithConcurrency,
  summarizeExtensions,
  collectMediaPaths,
  probeFiles,
  rehashStaleItems
};
