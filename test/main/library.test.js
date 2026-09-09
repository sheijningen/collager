const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLibraryStore } = require('../../src/main/lib/library.js');

function tmpStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collager-lib-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: createLibraryStore(() => dir) };
}

test('load with no library file returns empty, not corrupted', async (t) => {
  const { store } = tmpStore(t);
  assert.deepEqual(await store.load(), { items: [], corrupted: false });
});

test('save/load round-trip persists only the durable fields', async (t) => {
  const { dir, store } = tmpStore(t);
  const realFile = path.join(dir, 'exists.png');
  fs.writeFileSync(realFile, 'x');
  await store.save([
    { path: realFile, hash: 'h1', type: 'image', w: 10, h: 20, url: 'file://stale', missing: true },
    { path: path.join(dir, 'gone.mp4'), hash: 'h2', type: 'video', w: 640, h: 480 }
  ]);
  const { items, corrupted } = await store.load();
  assert.equal(corrupted, false);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map(({ hash, missing }) => ({ hash, missing })),
    [
      { hash: 'h1', missing: false },
      { hash: 'h2', missing: true }
    ]
  );
  assert.ok(items[0].url.startsWith('file://'), 'url is recomputed from path');
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  assert.equal(onDisk[0].url, undefined, 'volatile fields are not persisted');
  assert.equal(onDisk[0].missing, undefined);
});

test('corrupt library file: load returns corrupted flag and keeps a backup', async (t) => {
  const { dir, store } = tmpStore(t);
  fs.writeFileSync(path.join(dir, 'library.json'), '{not json!!');
  const { items, corrupted } = await store.load();
  assert.equal(corrupted, true);
  assert.deepEqual(items, []);
  assert.equal(fs.readFileSync(path.join(dir, 'library.json.corrupt'), 'utf8'), '{not json!!');
});

test('non-array JSON is treated as corrupt', async (t) => {
  const { dir, store } = tmpStore(t);
  fs.writeFileSync(path.join(dir, 'library.json'), '{"a":1}');
  assert.equal((await store.load()).corrupted, true);
});

test('malformed entries (null, missing path) are corrupt, backed up, never thrown', async (t) => {
  for (const bad of ['[null]', '[{"hash":"x"}]', '[{"path":42}]', '["str"]']) {
    const { dir, store } = tmpStore(t);
    fs.writeFileSync(path.join(dir, 'library.json'), bad);
    const result = await store.load(); // must not reject
    assert.equal(result.corrupted, true, `input: ${bad}`);
    assert.deepEqual(result.items, []);
    assert.ok(fs.existsSync(path.join(dir, 'library.json.corrupt')), `backup for: ${bad}`);
  }
});

test('saves are atomic: no tmp file left, content is valid JSON', async (t) => {
  const { dir, store } = tmpStore(t);
  await store.save([{ path: '/x.png', hash: 'h', type: 'image', w: 1, h: 1 }]);
  assert.ok(!fs.existsSync(path.join(dir, 'library.json.tmp')));
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')));
});

test('concurrent saves serialize; last write wins and file stays valid', async (t) => {
  const { dir, store } = tmpStore(t);
  const batches = Array.from({ length: 20 }, (_, i) =>
    Array.from({ length: i + 1 }, (_, j) => ({
      path: `/f${j}.png`,
      hash: `h${j}`,
      type: 'image',
      w: 1,
      h: 1
    }))
  );
  await Promise.all(batches.map((b) => store.save(b)));
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  assert.equal(onDisk.length, 20, 'last enqueued save is the final state');
});

test('save creates the directory if it does not exist yet', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'collager-lib-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dir = path.join(base, 'not', 'yet', 'created');
  const store = createLibraryStore(() => dir);
  await store.save([]);
  assert.ok(fs.existsSync(path.join(dir, 'library.json')));
});
