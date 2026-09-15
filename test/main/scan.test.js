const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  collectMediaPaths,
  hashFile,
  hashFileSampled,
  isSampledHash,
  readExactly,
  rehashStaleItems,
  runWithConcurrency,
  typeForPath,
  probeFiles,
  SAMPLE_BYTES
} = require('../../src/main/lib/scan.js');

const SAMPLED_HASH = /^sampled-[0-9a-f]{64}$/;

const fullHashOf = async (filePath) => (await hashFile(filePath)).hash;
const sampledHashOf = async (filePath) => (await hashFileSampled(filePath)).hash;

/* what load() hands rehashStaleItems: the current size of every item whose
 * file is there */
function measureOnDisk(items) {
  const sizeOnDisk = new Map();
  for (const item of items) {
    if (item.missing) continue;
    try {
      sizeOnDisk.set(item, fs.statSync(item.path).size);
    } catch {}
  }
  return sizeOnDisk;
}

/* a file larger than the three samples together, so bytes exist outside them */
function largeVideoBytes(fill = 7) {
  return Buffer.alloc(SAMPLE_BYTES * 4, fill);
}

function makeTree(spec, base) {
  for (const [name, content] of Object.entries(spec)) {
    const p = path.join(base, name);
    if (typeof content === 'object' && !Buffer.isBuffer(content)) {
      fs.mkdirSync(p);
      makeTree(content, p);
    } else {
      fs.writeFileSync(p, content);
    }
  }
}

function tmpTree(spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collager-scan-'));
  makeTree(spec, dir);
  return dir;
}

test('typeForPath maps extensions case-insensitively', () => {
  assert.equal(typeForPath('/a/b.PNG'), 'image');
  assert.equal(typeForPath('/a/b.JpEg'), 'image');
  assert.equal(typeForPath('/a/b.gif'), 'gif');
  assert.equal(typeForPath('/a/b.mp4'), 'video');
  assert.equal(typeForPath('/a/b.webm'), 'video');
  assert.equal(typeForPath('/a/b.webp'), 'image');
  assert.equal(typeForPath('/a/b.tiff'), undefined);
  assert.equal(typeForPath('/a/noext'), undefined);
});

test('collectMediaPaths keeps supported files, skips others', async (t) => {
  const dir = tmpTree({ 'a.png': 'x', 'b.MP4': 'x', 'c.txt': 'x', 'd.webm': 'x', 'e.tiff': 'x' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { found, skipped } = await collectMediaPaths([
    path.join(dir, 'a.png'),
    path.join(dir, 'b.MP4'),
    path.join(dir, 'c.txt'),
    path.join(dir, 'd.webm'),
    path.join(dir, 'e.tiff')
  ]);
  assert.deepEqual(found.map((p) => path.basename(p)).sort(), ['a.png', 'b.MP4', 'd.webm']);
  assert.equal(skipped.length, 2);
});

test('collectMediaPaths recurses into directories', async (t) => {
  const dir = tmpTree({
    'top.png': 'x',
    sub: { 'nested.gif': 'x', deeper: { 'deep.jpg': 'x', 'skip.doc': 'x' } }
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { found, skipped } = await collectMediaPaths([dir]);
  assert.deepEqual(found.map((p) => path.basename(p)).sort(), [
    'deep.jpg',
    'nested.gif',
    'top.png'
  ]);
  assert.deepEqual(
    skipped.map((p) => path.basename(p)),
    ['skip.doc']
  );
});

test('collectMediaPaths reports nonexistent paths as skipped', async () => {
  const ghost = path.join(os.tmpdir(), 'collager-does-not-exist-42.png');
  const { found, skipped } = await collectMediaPaths([ghost]);
  assert.equal(found.length, 0);
  assert.deepEqual(skipped, [ghost]);
});

test('collectMediaPaths survives symlink cycles without duplicates', async (t) => {
  const dir = tmpTree({ sub: { 'pic.png': 'x' } });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  try {
    fs.symlinkSync(dir, path.join(dir, 'sub', 'loop'), 'dir');
  } catch {
    t.skip('cannot create symlinks on this system');
    return;
  }
  const { found } = await collectMediaPaths([dir]);
  assert.deepEqual(
    found.map((p) => path.basename(p)),
    ['pic.png']
  );
});

test('hashFile: identical content hashes equal, different content differs', async (t) => {
  const dir = tmpTree({ 'one.png': 'same-bytes', 'two.png': 'same-bytes', 'three.png': 'other' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const [h1, h2, h3] = await Promise.all(
    ['one.png', 'two.png', 'three.png'].map((f) => fullHashOf(path.join(dir, f)))
  );
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('hashFile rejects for unreadable files', async () => {
  await assert.rejects(fullHashOf(path.join(os.tmpdir(), 'collager-nope.png')));
});

test('runWithConcurrency: bounds the calls in flight, visits every index, reports each completion', async () => {
  const list = Array.from({ length: 10 }, (_, index) => `item-${index}`);
  const seen = [];
  const progress = [];
  let inFlight = 0;
  let mostInFlight = 0;
  await runWithConcurrency(
    list,
    3,
    async (element, index) => {
      inFlight++;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push([element, index]);
      inFlight--;
    },
    (done, total) => progress.push([done, total])
  );
  assert.equal(mostInFlight, 3);
  assert.deepEqual(
    seen.sort((a, b) => a[1] - b[1]),
    list.map((element, index) => [element, index])
  );
  assert.deepEqual(
    progress,
    list.map((_, index) => [index + 1, 10])
  );
});

test('runWithConcurrency: an empty list runs nothing and reports nothing', async () => {
  let calls = 0;
  await runWithConcurrency(
    [],
    4,
    async () => calls++,
    () => calls++
  );
  assert.equal(calls, 0);
});

test('probeFiles: hashes concurrently, keeps discovery order, types entries', async (t) => {
  const dir = tmpTree({ 'a.png': 'aaa', 'b.gif': 'bbb', 'c.mp4': 'ccc', 'skip.txt': 'x' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { entries, skippedCount } = await probeFiles([dir]);
  assert.deepEqual(
    entries.map((e) => path.basename(e.path)),
    ['a.png', 'b.gif', 'c.mp4']
  );
  assert.deepEqual(
    entries.map((e) => e.type),
    ['image', 'gif', 'video']
  );
  assert.ok(entries.slice(0, 2).every((e) => /^[0-9a-f]{64}$/.test(e.hash)));
  assert.match(entries[2].hash, SAMPLED_HASH, 'videos get the sampled hash');
  assert.deepEqual(
    entries.map((e) => e.size),
    [3, 3, 3],
    'the size the hash was taken over travels with the entry'
  );
  assert.equal(skippedCount, 1);
});

test('probeFiles: reports progress once per file, ending at total', async (t) => {
  const dir = tmpTree({ 'a.png': 'aa', 'b.png': 'bb', 'c.gif': 'cc' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  await probeFiles([dir], 2, (done, total) => calls.push([done, total]));
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(([d]) => d).sort(), [1, 2, 3]);
  assert.ok(calls.every(([, t2]) => t2 === 3));
});

test('probeFiles: unreadable file counts as skipped, not a rejection', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('permission bits not enforceable here');
    return;
  }
  const dir = tmpTree({ 'ok.png': 'x', 'locked.png': 'x' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.chmodSync(path.join(dir, 'locked.png'), 0);
  const { entries, skippedCount } = await probeFiles([dir]);
  assert.deepEqual(
    entries.map((e) => path.basename(e.path)),
    ['ok.png']
  );
  assert.equal(skippedCount, 1);
});

test('hashFileSampled: same bytes hash equal, prefix marks the scheme', async (t) => {
  const dir = tmpTree({ 'a.mp4': largeVideoBytes(), 'b.mp4': largeVideoBytes() });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const [a, b] = await Promise.all(['a.mp4', 'b.mp4'].map((f) => sampledHashOf(path.join(dir, f))));
  assert.equal(a, b);
  assert.match(a, SAMPLED_HASH);
  assert.ok(isSampledHash(a));
  assert.ok(!isSampledHash(a.slice('sampled-'.length)));
  assert.ok(!isSampledHash(undefined));
});

test('hashFileSampled: a change inside any sample or in the size changes the hash', async (t) => {
  const base = largeVideoBytes();
  const inStart = largeVideoBytes();
  inStart[10] = 1;
  const inMiddle = largeVideoBytes();
  inMiddle[Math.floor(base.length / 2)] = 1;
  const inEnd = largeVideoBytes();
  inEnd[base.length - 10] = 1;
  const longer = Buffer.concat([base, Buffer.from([7])]);
  const dir = tmpTree({
    'base.mp4': base,
    'start.mp4': inStart,
    'middle.mp4': inMiddle,
    'end.mp4': inEnd,
    'longer.mp4': longer
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const hashes = await Promise.all(
    ['base.mp4', 'start.mp4', 'middle.mp4', 'end.mp4', 'longer.mp4'].map((f) =>
      sampledHashOf(path.join(dir, f))
    )
  );
  assert.equal(new Set(hashes).size, hashes.length, 'all five differ');
});

test('hashFileSampled: bytes outside the samples do not take part', async (t) => {
  const base = largeVideoBytes();
  const outside = largeVideoBytes();
  outside[SAMPLE_BYTES + 100] = 1; // between the start and middle samples
  const dir = tmpTree({ 'base.mp4': base, 'outside.mp4': outside });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(
    await sampledHashOf(path.join(dir, 'base.mp4')),
    await sampledHashOf(path.join(dir, 'outside.mp4'))
  );
});

test('hashFileSampled: small files are hashed whole', async (t) => {
  const small = Buffer.alloc(SAMPLE_BYTES * 2, 3);
  const changed = Buffer.from(small);
  changed[SAMPLE_BYTES + 100] = 1; // would fall outside the samples of a large file
  const dir = tmpTree({ 'small.mp4': small, 'changed.mp4': changed, 'empty.mp4': '' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.notEqual(
    await sampledHashOf(path.join(dir, 'small.mp4')),
    await sampledHashOf(path.join(dir, 'changed.mp4'))
  );
  assert.match(await sampledHashOf(path.join(dir, 'empty.mp4')), SAMPLED_HASH);
});

test('hashFileSampled: files up to three samples long are hashed whole, longer ones sampled', async (t) => {
  const exact = Buffer.alloc(SAMPLE_BYTES * 3, 5);
  const exactChanged = Buffer.from(exact);
  exactChanged[SAMPLE_BYTES + 100] = 1;
  const over = Buffer.alloc(SAMPLE_BYTES * 3 + 1, 5);
  const overChanged = Buffer.from(over);
  overChanged[SAMPLE_BYTES * 2] = 1; // the single byte between the middle and end samples
  const dir = tmpTree({
    'exact.mp4': exact,
    'exact-changed.mp4': exactChanged,
    'over.mp4': over,
    'over-changed.mp4': overChanged
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const hashOf = (name) => sampledHashOf(path.join(dir, name));
  assert.notEqual(await hashOf('exact.mp4'), await hashOf('exact-changed.mp4'));
  assert.equal(await hashOf('over.mp4'), await hashOf('over-changed.mp4'));
});

test('hashFile and hashFileSampled report the byte size the hash covers', async (t) => {
  const large = largeVideoBytes();
  const dir = tmpTree({ 'pic.png': 'seven b', 'clip.mp4': large, 'small.mp4': 'tiny' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal((await hashFile(path.join(dir, 'pic.png'))).size, 7);
  assert.equal((await hashFileSampled(path.join(dir, 'clip.mp4'))).size, large.length);
  assert.equal((await hashFileSampled(path.join(dir, 'small.mp4'))).size, 4);
});

test('readExactly fills the whole range and rejects when the file runs out', async (t) => {
  const dir = tmpTree({ 'ten.bin': '0123456789' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const handle = await fs.promises.open(path.join(dir, 'ten.bin'), 'r');
  t.after(() => handle.close());
  assert.equal((await readExactly(handle, 2, 5)).toString(), '23456');
  assert.equal((await readExactly(handle, 0, 10)).toString(), '0123456789');
  await assert.rejects(readExactly(handle, 5, 10), /ran out after 5/);
  await assert.rejects(readExactly(handle, 10, 1), /ran out after 0/);
});

test('hashFileSampled rejects for unreadable files', async () => {
  await assert.rejects(sampledHashOf(path.join(os.tmpdir(), 'collager-nope.mp4')));
});

test('rehashStaleItems: rehashes present videos with a full hash, leaves the rest', async (t) => {
  const dir = tmpTree({ 'clip.mp4': 'video bytes', 'pic.png': 'image bytes' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clip = path.join(dir, 'clip.mp4');
  const legacy = await fullHashOf(clip);
  const already = await sampledHashOf(clip);
  const items = [
    { path: clip, hash: legacy, type: 'video', missing: false },
    { path: path.join(dir, 'pic.png'), hash: 'imagehash', type: 'image', missing: false },
    { path: path.join(dir, 'gone.mp4'), hash: 'legacy-missing', type: 'video', missing: true },
    {
      path: path.join(dir, 'other.mp4'),
      hash: 'sampled-' + 'a'.repeat(64),
      type: 'video',
      missing: false
    }
  ];
  const { items: kept, rehashed, collapsed } = await rehashStaleItems(items, measureOnDisk(items));
  assert.equal(rehashed, 1);
  assert.equal(collapsed, 0);
  assert.deepEqual(
    kept.map((i) => i.hash),
    [already, 'imagehash', 'legacy-missing', 'sampled-' + 'a'.repeat(64)]
  );
});

test('rehashStaleItems: nothing to do reports no work', async () => {
  const items = [{ path: '/x.png', hash: 'h', type: 'image', size: 1, missing: false }];
  const result = await rehashStaleItems(items, measureOnDisk(items));
  assert.deepEqual(result, { items, rehashed: 0, collapsed: 0, changed: false });
});

test('rehashStaleItems: an unreadable video keeps its hash while the others move', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('permission bits not enforceable here');
    return;
  }
  const dir = tmpTree({ 'ok.mp4': 'fine', 'locked.mp4': 'locked' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.chmodSync(path.join(dir, 'locked.mp4'), 0);
  const items = [
    { path: path.join(dir, 'locked.mp4'), hash: 'full-locked', type: 'video', missing: false },
    { path: path.join(dir, 'ok.mp4'), hash: 'full-ok', type: 'video', missing: false }
  ];
  const { items: kept, rehashed, collapsed } = await rehashStaleItems(items, measureOnDisk(items));
  assert.equal(rehashed, 1);
  assert.equal(collapsed, 0);
  assert.equal(kept[0].hash, 'full-locked');
  assert.match(kept[1].hash, SAMPLED_HASH);
});

test('rehashStaleItems: only rehashed videos collapse, other duplicate hashes are kept', async (t) => {
  const dir = tmpTree({ 'clip.mp4': 'video bytes' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const items = [
    { path: '/a.png', hash: 'same-image', type: 'image', missing: false },
    { path: '/b.png', hash: 'same-image', type: 'image', missing: false },
    { path: path.join(dir, 'clip.mp4'), hash: 'full-clip', type: 'video', missing: false }
  ];
  const { items: kept, collapsed } = await rehashStaleItems(items, measureOnDisk(items));
  assert.equal(collapsed, 0);
  assert.equal(kept.length, 3);
});

test('rehashStaleItems: entries that collide after rehashing collapse to one', async (t) => {
  const dir = tmpTree({ 'one.mp4': 'same video', 'two.mp4': 'same video' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const one = path.join(dir, 'one.mp4');
  const two = path.join(dir, 'two.mp4');
  const items = [
    { path: one, hash: 'full-a', type: 'video', missing: false },
    { path: two, hash: 'full-b', type: 'video', missing: false }
  ];
  const { items: kept, rehashed, collapsed } = await rehashStaleItems(items, measureOnDisk(items));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].path, one);
  assert.equal(rehashed, 2);
  assert.equal(collapsed, 1);
});

test('rehashStaleItems: a legacy entry that rehashes onto a sampled entry collapses, the earlier one stays', async (t) => {
  const dir = tmpTree({ 'one.mp4': 'same video', 'two.mp4': 'same video' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const one = path.join(dir, 'one.mp4');
  const two = path.join(dir, 'two.mp4');
  const legacy = () => ({ path: one, hash: 'full-one', type: 'video', missing: false });
  const sampled = async () => ({
    path: two,
    hash: await sampledHashOf(two),
    type: 'video',
    missing: false
  });
  for (const items of [
    [legacy(), await sampled()],
    [await sampled(), legacy()]
  ]) {
    const {
      items: kept,
      rehashed,
      collapsed
    } = await rehashStaleItems(items, measureOnDisk(items));
    assert.equal(rehashed, 1);
    assert.equal(collapsed, 1);
    assert.deepEqual(
      kept.map((i) => i.path),
      [items[0].path]
    );
  }
});

test('rehashStaleItems: a rehash that lands on a missing entry keeps the present one, in either order', async (t) => {
  const dir = tmpTree({ 'done.mp4': 'the finished copy' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const done = path.join(dir, 'done.mp4');
  const finished = await sampledHashOf(done);
  const movedAway = () => ({
    path: path.join(dir, 'moved-away.mp4'),
    hash: finished,
    type: 'video',
    size: 17,
    missing: true
  });
  const partialCopy = () => ({
    path: done,
    hash: 'sampled-' + 'b'.repeat(64),
    type: 'video',
    size: 4,
    missing: false
  });
  for (const items of [
    [movedAway(), partialCopy()],
    [partialCopy(), movedAway()]
  ]) {
    const {
      items: kept,
      rehashed,
      collapsed
    } = await rehashStaleItems(items, measureOnDisk(items));
    assert.equal(rehashed, 1);
    assert.equal(collapsed, 1);
    assert.deepEqual(
      kept.map((i) => [path.basename(i.path), i.missing]),
      [['done.mp4', false]]
    );
    assert.equal(kept[0].hash, finished);
  }
});

test('rehashStaleItems: an item whose size moved is rehashed, one whose size holds is not', async (t) => {
  const dir = tmpTree({ 'grown.png': 'now longer', 'same.png': 'steady' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const grown = path.join(dir, 'grown.png');
  const same = path.join(dir, 'same.png');
  const items = [
    { path: grown, hash: 'hash-of-the-partial-copy', type: 'image', size: 4, missing: false },
    { path: same, hash: 'untouched', type: 'image', size: fs.statSync(same).size, missing: false }
  ];
  const { rehashed, collapsed, changed } = await rehashStaleItems(items, measureOnDisk(items));
  assert.equal(rehashed, 1);
  assert.equal(collapsed, 0);
  assert.equal(changed, true);
  assert.equal(items[0].hash, await fullHashOf(grown));
  assert.equal(items[0].size, fs.statSync(grown).size);
  assert.equal(items[1].hash, 'untouched');
});

test('rehashStaleItems: a video whose size moved is rehashed under the sampled scheme', async (t) => {
  const dir = tmpTree({ 'clip.mp4': largeVideoBytes() });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clip = path.join(dir, 'clip.mp4');
  const items = [
    { path: clip, hash: 'sampled-' + 'a'.repeat(64), type: 'video', size: 12, missing: false }
  ];
  const { rehashed } = await rehashStaleItems(items, measureOnDisk(items));
  assert.equal(rehashed, 1);
  assert.equal(items[0].hash, await sampledHashOf(clip));
  assert.equal(items[0].size, SAMPLE_BYTES * 4);
});

test('rehashStaleItems: entries saved before sizes were recorded get one without rehashing', async (t) => {
  const dir = tmpTree({ 'pic.png': 'bytes', 'gone.png': 'x' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pic = path.join(dir, 'pic.png');
  const items = [
    { path: pic, hash: 'kept', type: 'image', missing: false },
    { path: path.join(dir, 'gone.png'), hash: 'away', type: 'image', missing: true }
  ];
  const { rehashed, changed } = await rehashStaleItems(items, measureOnDisk(items));
  assert.equal(rehashed, 0);
  assert.equal(changed, true, 'the filled-in sizes are worth saving');
  assert.equal(items[0].hash, 'kept');
  assert.equal(items[0].size, 5);
  assert.equal(items[1].size, undefined, 'a missing file cannot be measured');
});

test('rehashStaleItems: a failed rehash keeps the old size so the next start retries', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('permission bits not enforceable here');
    return;
  }
  const dir = tmpTree({ 'locked.png': 'much longer than claimed' });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.chmodSync(path.join(dir, 'locked.png'), 0);
  const items = [
    { path: path.join(dir, 'locked.png'), hash: 'stale', type: 'image', size: 2, missing: false }
  ];
  const { rehashed, changed } = await rehashStaleItems(items, measureOnDisk(items));
  assert.equal(rehashed, 0);
  assert.equal(changed, false);
  assert.equal(items[0].hash, 'stale');
  assert.equal(items[0].size, 2);
});
