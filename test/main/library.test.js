const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createLibraryStore,
  readLibraryItems,
  loadAndRepairLibrary
} = require('../../src/main/lib/library.js');
const { skipWithoutPermissionBits } = require('./helpers.js');

function tmpStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collager-lib-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, store: createLibraryStore(() => dir) };
}

const entry = (hash, overrides = {}) => ({
  path: `/media/${hash}.png`,
  hash,
  type: 'image',
  w: 1,
  h: 1,
  ...overrides
});

test('load with no library file returns empty with no problem', async (t) => {
  const { store } = tmpStore(t);
  assert.deepEqual(await store.load(), { items: [], sizeOnDisk: new Map(), problem: null });
});

test('save/load round-trip persists only the durable fields', async (t) => {
  const { dir, store } = tmpStore(t);
  const realFile = path.join(dir, 'exists.png');
  fs.writeFileSync(realFile, 'x');
  await store.save([
    {
      path: realFile,
      hash: 'h1',
      type: 'image',
      size: 1,
      w: 10,
      h: 20,
      url: 'file://stale',
      missing: true
    },
    { path: path.join(dir, 'gone.mp4'), hash: 'h2', type: 'video', size: 900, w: 640, h: 480 }
  ]);
  const { items, sizeOnDisk, problem } = await store.load();
  assert.equal(problem, null);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map(({ hash, missing }) => ({ hash, missing })),
    [
      { hash: 'h1', missing: false },
      { hash: 'h2', missing: true }
    ]
  );
  assert.deepEqual([...sizeOnDisk], [[items[0], 1]], 'only the present file is measured');
  assert.ok(items[0].url.startsWith('file://'), 'url is recomputed from path');
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  assert.equal(onDisk[0].url, undefined, 'volatile fields are not persisted');
  assert.equal(onDisk[0].missing, undefined);
  assert.deepEqual(
    onDisk.map((e) => e.size),
    [1, 900],
    'the size the hash was taken over survives a round trip'
  );
});

test('unreadable content is moved aside and reported as unreadable', async (t) => {
  const { dir, store } = tmpStore(t);
  fs.writeFileSync(path.join(dir, 'library.json'), '{not json!!');
  const { items, problem } = await store.load();
  assert.deepEqual(items, []);
  assert.equal(problem.backup, path.join(dir, 'library.json.corrupt'));
  assert.equal(fs.readFileSync(problem.backup, 'utf8'), '{not json!!');
  assert.ok(
    !fs.existsSync(path.join(dir, 'library.json')),
    'the unreadable file is moved, not copied'
  );
});

test('later unreadable files never overwrite an earlier backup', async (t) => {
  const { dir, store } = tmpStore(t);
  const contents = ['{first', '{second', '{third'];
  const backups = [];
  for (const content of contents) {
    fs.writeFileSync(path.join(dir, 'library.json'), content);
    backups.push((await store.load()).problem.backup);
  }
  assert.equal(new Set(backups).size, 3, 'three distinct backup names');
  backups.forEach((backup, index) => {
    assert.equal(fs.readFileSync(backup, 'utf8'), contents[index]);
  });
  assert.equal(path.basename(backups[0]), 'library.json.corrupt');
  assert.match(path.basename(backups[1]), /^library\.json\.corrupt\.\d+$/);
  assert.match(path.basename(backups[2]), /^library\.json\.corrupt\.\d+(-\d+)?$/);
});

test('when the unreadable file cannot be moved, saving is refused until a clean load', async (t) => {
  if (skipWithoutPermissionBits(t)) return;
  const { dir, store } = tmpStore(t);
  fs.writeFileSync(path.join(dir, 'library.json'), '{not json');
  fs.chmodSync(dir, 0o555); // no new files, no unlink
  try {
    const { problem } = await store.load();
    assert.deepEqual(problem, { backup: null });
    await assert.rejects(store.save([entry('h1')]), /must stay as it is/);
    assert.equal(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'), '{not json', 'untouched');
  } finally {
    fs.chmodSync(dir, 0o755);
  }
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify([entry('h2')]));
  assert.equal((await store.load()).problem, null);
  await store.save([entry('h3')]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'))[0].hash, 'h3');
});

test('readLibraryItems rejects anything but an array of entries', () => {
  for (const bad of ['{"a":1}', '"str"', '42', 'null', '{not json']) {
    assert.throws(() => readLibraryItems(bad), Error, bad);
  }
  assert.deepEqual(readLibraryItems('[]'), []);
});

test('entries need a path and a hash; a repeated hash keeps its first entry', () => {
  for (const bad of [
    '[null]',
    '[{"hash":"x"}]',
    '[{"path":42,"hash":"x"}]',
    '[{"path":"/a"}]',
    '[{"path":"/a","hash":""}]',
    '["str"]'
  ]) {
    assert.throws(() => readLibraryItems(bad), /malformed/, bad);
  }
  const items = readLibraryItems(
    JSON.stringify([entry('a'), entry('a', { path: '/other.png' }), entry('b')])
  );
  assert.deepEqual(
    items.map((i) => [i.hash, i.path]),
    [
      ['a', '/media/a.png'],
      ['b', '/media/b.png']
    ]
  );
  assert.equal(items[0].size, undefined, 'a size is optional on read');
});

test('loadAndRepairLibrary brings stale entries up to date and saves them', async (t) => {
  const { dir, store } = tmpStore(t);
  const pic = path.join(dir, 'pic.png');
  const clip = path.join(dir, 'clip.mp4');
  fs.writeFileSync(pic, 'picture bytes');
  fs.writeFileSync(clip, 'video bytes');
  fs.writeFileSync(
    path.join(dir, 'library.json'),
    JSON.stringify([
      { path: pic, hash: 'kept', type: 'image' },
      { path: clip, hash: 'full-content-hash', type: 'video' },
      { path: path.join(dir, 'gone.png'), hash: 'away', type: 'image', size: 3 }
    ])
  );
  const { items, problem, collapsed } = await loadAndRepairLibrary(store);
  assert.equal(problem, null);
  assert.equal(collapsed, 0);
  assert.deepEqual(
    items.map((i) => [i.hash, i.size, i.missing]),
    [
      ['kept', 13, false],
      [items[1].hash, 11, false],
      ['away', 3, true]
    ]
  );
  assert.match(items[1].hash, /^sampled-/);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  assert.deepEqual(
    onDisk.map((e) => [e.hash, e.size]),
    items.map((i) => [i.hash, i.size]),
    'the repaired entries are saved'
  );
});

test('loadAndRepairLibrary leaves an up-to-date library file alone', async (t) => {
  const { dir, store } = tmpStore(t);
  const pic = path.join(dir, 'pic.png');
  fs.writeFileSync(pic, 'picture bytes');
  const saves = [];
  const counting = {
    load: () => store.load(),
    save: (items) => {
      saves.push(items);
      return store.save(items);
    }
  };
  await store.save([{ path: pic, hash: 'current', type: 'image', size: 13 }]);
  const { items, collapsed } = await loadAndRepairLibrary(counting);
  assert.equal(items[0].hash, 'current');
  assert.equal(collapsed, 0);
  assert.deepEqual(saves, [], 'nothing changed, so nothing is written');
});

test('loadAndRepairLibrary still resolves when the save fails', async (t) => {
  const { dir } = tmpStore(t);
  const pic = path.join(dir, 'pic.png');
  fs.writeFileSync(pic, 'picture bytes');
  const item = { path: pic, hash: 'kept', type: 'image', missing: false };
  const failing = {
    load: async () => ({ items: [item], sizeOnDisk: new Map([[item, 13]]), problem: null }),
    save: () => Promise.reject(new Error('disk full'))
  };
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  t.after(() => {
    console.error = original;
  });
  const { items } = await loadAndRepairLibrary(failing);
  assert.deepEqual(items, [{ path: pic, hash: 'kept', type: 'image', size: 13, missing: false }]);
  assert.equal(errors.length, 1, 'the failure is logged, not thrown');
});

test('malformed entries in a file are moved aside, never thrown', async (t) => {
  const { dir, store } = tmpStore(t);
  fs.writeFileSync(path.join(dir, 'library.json'), '[{"path":42}]');
  const result = await store.load(); // must not reject
  assert.equal(result.problem.backup, path.join(dir, 'library.json.corrupt'));
  assert.deepEqual(result.items, []);
  assert.ok(fs.existsSync(path.join(dir, 'library.json.corrupt')));
});

test('saves are atomic: no tmp file left, content is valid JSON', async (t) => {
  const { dir, store } = tmpStore(t);
  await store.save([entry('h')]);
  assert.ok(!fs.existsSync(path.join(dir, 'library.json.tmp')));
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')));
});

test('concurrent saves serialize; last write wins and file stays valid', async (t) => {
  const { dir, store } = tmpStore(t);
  const batches = Array.from({ length: 20 }, (_, i) =>
    Array.from({ length: i + 1 }, (_, j) => entry(`h${j}`))
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
