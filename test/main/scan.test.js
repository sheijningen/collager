const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  collectMediaPaths,
  hashFile,
  typeForPath,
  probeFiles
} = require('../../src/main/lib/scan.js');

function makeTree(spec, base) {
  for (const [name, content] of Object.entries(spec)) {
    const p = path.join(base, name);
    if (typeof content === 'object') {
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
    ['one.png', 'two.png', 'three.png'].map((f) => hashFile(path.join(dir, f)))
  );
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('hashFile rejects for unreadable files', async () => {
  await assert.rejects(hashFile(path.join(os.tmpdir(), 'collager-nope.png')));
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
  assert.ok(entries.every((e) => /^[0-9a-f]{64}$/.test(e.hash)));
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
