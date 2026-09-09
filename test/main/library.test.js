const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createLibraryStore,
  readLibraryDocument,
  migrateDocument,
  UnreadableLibraryError,
  LIBRARY_VERSION,
  MIGRATIONS
} = require('../../src/main/lib/library.js');

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
  assert.deepEqual(await store.load(), { items: [], problem: null });
});

test('save/load round-trip persists only the durable fields, versioned', async (t) => {
  const { dir, store } = tmpStore(t);
  const realFile = path.join(dir, 'exists.png');
  fs.writeFileSync(realFile, 'x');
  await store.save([
    { path: realFile, hash: 'h1', type: 'image', w: 10, h: 20, url: 'file://stale', missing: true },
    { path: path.join(dir, 'gone.mp4'), hash: 'h2', type: 'video', w: 640, h: 480 }
  ]);
  const { items, problem } = await store.load();
  assert.equal(problem, null);
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
  assert.equal(onDisk.version, LIBRARY_VERSION);
  assert.equal(onDisk.items[0].url, undefined, 'volatile fields are not persisted');
  assert.equal(onDisk.items[0].missing, undefined);
});

test('a bare array (the version 0 file) loads and is saved back versioned', async (t) => {
  const { dir, store } = tmpStore(t);
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify([entry('h0')]));
  const { items, problem } = await store.load();
  assert.equal(problem, null);
  assert.deepEqual(
    items.map((i) => i.hash),
    ['h0']
  );
  await store.save(items);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  assert.equal(onDisk.version, LIBRARY_VERSION);
  assert.equal(onDisk.items.length, 1);
});

test('every version bump has its migration step', () => {
  assert.equal(MIGRATIONS.length, LIBRARY_VERSION);
});

test('migrateDocument runs each step in order and stamps the target version', () => {
  const steps = [
    (doc) => ({ version: 1, items: doc.items }),
    (doc) => ({ items: doc.items.map((i) => ({ ...i, extra: true })) }) // forgets version
  ];
  const result = migrateDocument({ version: 0, items: [{ path: '/a', hash: 'a' }] }, steps, 2);
  assert.deepEqual(result, { version: 2, items: [{ path: '/a', hash: 'a', extra: true }] });
  const untouched = migrateDocument({ version: 2, items: [] }, steps, 2);
  assert.deepEqual(untouched, { version: 2, items: [] });
});

test('unreadable content is moved aside and reported as unreadable', async (t) => {
  const { dir, store } = tmpStore(t);
  fs.writeFileSync(path.join(dir, 'library.json'), '{not json!!');
  const { items, problem } = await store.load();
  assert.deepEqual(items, []);
  assert.equal(problem.reason, 'unreadable');
  assert.equal(problem.backup, path.join(dir, 'library.json.corrupt'));
  assert.equal(fs.readFileSync(problem.backup, 'utf8'), '{not json!!');
  assert.ok(
    !fs.existsSync(path.join(dir, 'library.json')),
    'the unreadable file is moved, not copied'
  );
});

test('a library written by a newer app is left in place and saving is refused', async (t) => {
  const { dir, store } = tmpStore(t);
  const newer = JSON.stringify({ version: LIBRARY_VERSION + 1, items: [], future: true });
  fs.writeFileSync(path.join(dir, 'library.json'), newer);
  const { items, problem } = await store.load();
  assert.deepEqual(items, []);
  assert.deepEqual(problem, { reason: 'newer-version', backup: null });
  await assert.rejects(store.save([entry('h1')]), /must stay as it is/);
  assert.equal(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'), newer, 'untouched');
  assert.ok(!fs.existsSync(path.join(dir, 'library.json.corrupt')));
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
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('permission bits not enforceable here');
    return;
  }
  const { dir, store } = tmpStore(t);
  fs.writeFileSync(path.join(dir, 'library.json'), '{not json');
  fs.chmodSync(dir, 0o555); // no new files, no unlink
  try {
    const { problem } = await store.load();
    assert.equal(problem.reason, 'unreadable');
    assert.equal(problem.backup, null);
    await assert.rejects(store.save([entry('h1')]), /must stay as it is/);
    assert.equal(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'), '{not json', 'untouched');
  } finally {
    fs.chmodSync(dir, 0o755);
  }
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify([entry('h2')]));
  assert.equal((await store.load()).problem, null);
  await store.save([entry('h3')]);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).items[0].hash,
    'h3'
  );
});

test('readLibraryDocument rejects documents without a usable version or items', () => {
  const unreadable = (raw) => {
    assert.throws(
      () => readLibraryDocument(raw),
      (err) => {
        assert.ok(err instanceof UnreadableLibraryError);
        assert.equal(err.reason, 'unreadable');
        return true;
      }
    );
  };
  unreadable('{"items":[]}');
  unreadable('{"version":-1,"items":[]}');
  unreadable('{"version":"1","items":[]}');
  unreadable('{"version":1}');
  unreadable('{"version":1,"items":{}}');
  unreadable('{"a":1}');
  unreadable('"str"');
  assert.deepEqual(readLibraryDocument('{"version":1,"items":[]}'), { version: 1, items: [] });
  assert.throws(
    () => readLibraryDocument(`{"version":${LIBRARY_VERSION + 1},"items":[]}`),
    (err) => err.reason === 'newer-version'
  );
});

test('entries need a path and a hash; a repeated hash keeps its first entry', () => {
  for (const bad of [
    '[null]',
    '[{"hash":"x"}]',
    '[{"path":42,"hash":"x"}]',
    '[{"path":"/a"}]',
    '[{"path":"/a","hash":""}]',
    '["str"]',
    '{"version":1,"items":[null]}'
  ]) {
    assert.throws(() => readLibraryDocument(bad), /malformed/, bad);
  }
  const { items } = readLibraryDocument(
    JSON.stringify([entry('a'), entry('a', { path: '/other.png' }), entry('b')])
  );
  assert.deepEqual(
    items.map((i) => [i.hash, i.path]),
    [
      ['a', '/media/a.png'],
      ['b', '/media/b.png']
    ]
  );
});

test('malformed entries in a file are moved aside, never thrown', async (t) => {
  const { dir, store } = tmpStore(t);
  fs.writeFileSync(path.join(dir, 'library.json'), '[{"path":42}]');
  const result = await store.load(); // must not reject
  assert.equal(result.problem.reason, 'unreadable');
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
  assert.equal(onDisk.items.length, 20, 'last enqueued save is the final state');
});

test('save creates the directory if it does not exist yet', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'collager-lib-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const dir = path.join(base, 'not', 'yet', 'created');
  const store = createLibraryStore(() => dir);
  await store.save([]);
  assert.ok(fs.existsSync(path.join(dir, 'library.json')));
});
