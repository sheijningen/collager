const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  packItems,
  sortItems,
  clampColumns,
  basename,
  reorderByHash,
  fitExportScale,
  MAX_EXPORT_SIDE,
  MAX_EXPORT_AREA,
  GAP,
  MISSING_W,
  MISSING_H,
  DEFAULT_COLUMNS
} = require('../../src/renderer/core/layout.js');

function item(overrides = {}) {
  return {
    hash: Math.random().toString(36).slice(2),
    path: '/a/x.png',
    type: 'image',
    w: 100,
    h: 100,
    ...overrides
  };
}

test('packItems: empty list gives no positions and zero height', () => {
  const { positions, height } = packItems([], 1000, 3);
  assert.equal(positions.length, 0);
  assert.equal(height, 0);
});

test('packItems: item is scaled to column width with aspect ratio preserved', () => {
  const it = item({ w: 300, h: 500 });
  const { positions } = packItems([it], 1000, 2);
  const colWidth = Math.floor((1000 - GAP) / 2);
  assert.equal(positions[0].w, colWidth);
  assert.equal(positions[0].h, Math.round(500 * (colWidth / 300)));
});

test('packItems: items go into the currently shortest column', () => {
  // tall item fills column 0, next two should land in column 1
  const tall = item({ w: 100, h: 1000 });
  const small1 = item({ w: 100, h: 100 });
  const small2 = item({ w: 100, h: 100 });
  const { positions } = packItems([tall, small1, small2], 1000, 2);
  assert.equal(positions[0].x, 0);
  assert.notEqual(positions[1].x, 0);
  assert.equal(positions[2].x, positions[1].x);
  assert.equal(positions[2].y, positions[1].y + positions[1].h + GAP);
});

test('packItems: total height is the tallest column without trailing gap', () => {
  const a = item({ w: 100, h: 200 });
  const b = item({ w: 100, h: 100 });
  const { positions, height } = packItems([a, b], 1000, 2);
  const colWidth = positions[0].w;
  assert.equal(height, Math.round(200 * (colWidth / 100)));
});

test('packItems: single column stacks everything vertically', () => {
  const list = [item(), item(), item()];
  const { positions } = packItems(list, 500, 1);
  assert.deepEqual(
    positions.map((p) => p.x),
    [0, 0, 0]
  );
  assert.equal(positions[1].y, positions[0].h + GAP);
});

test('packItems: missing/unmeasured items use fallback dimensions', () => {
  const missing = item({ missing: true, w: undefined, h: undefined });
  const { positions } = packItems([missing], 1000, 4);
  const colWidth = positions[0].w;
  assert.equal(positions[0].h, Math.round(MISSING_H * (colWidth / MISSING_W)));
});

test('packItems: height is never below 1px even for extreme aspect ratios', () => {
  const sliver = item({ w: 10000, h: 1 });
  const { positions } = packItems([sliver], 300, 8);
  assert.ok(positions[0].h >= 1);
});

test('clampColumns: clamps to [1, 8] and defaults non-numbers', () => {
  assert.equal(clampColumns(0), 1);
  assert.equal(clampColumns(-5), 1);
  assert.equal(clampColumns(99), 8);
  assert.equal(clampColumns(3), 3);
  assert.equal(clampColumns(2.9), 2);
  assert.equal(clampColumns(NaN), DEFAULT_COLUMNS);
  assert.equal(clampColumns(undefined), DEFAULT_COLUMNS);
});

test('basename handles unix and windows separators', () => {
  assert.equal(basename('/home/user/pic.png'), 'pic.png');
  assert.equal(basename('C:\\Users\\user\\pic.png'), 'pic.png');
  assert.equal(basename('pic.png'), 'pic.png');
});

test('sortItems: by name is case-insensitive and does not mutate input', () => {
  const list = [
    item({ path: '/z/Bravo.png' }),
    item({ path: '/a/alpha.png' }),
    item({ path: '/m/Charlie.png' })
  ];
  const original = list.slice();
  const sorted = sortItems(list, 'name');
  assert.deepEqual(
    sorted.map((i) => basename(i.path)),
    ['alpha.png', 'Bravo.png', 'Charlie.png']
  );
  assert.deepEqual(list, original);
});

test('sortItems: by path uses the full path', () => {
  const list = [item({ path: '/z/a.png' }), item({ path: '/a/z.png' })];
  assert.deepEqual(
    sortItems(list, 'path').map((i) => i.path),
    ['/a/z.png', '/z/a.png']
  );
});

test('sortItems: by type groups gif < image < video, names break ties', () => {
  const list = [
    item({ type: 'video', path: '/v.mp4' }),
    item({ type: 'image', path: '/b.png' }),
    item({ type: 'gif', path: '/g.gif' }),
    item({ type: 'image', path: '/a.png' })
  ];
  assert.deepEqual(
    sortItems(list, 'type').map((i) => i.path),
    ['/g.gif', '/a.png', '/b.png', '/v.mp4']
  );
});

function hashes(list) {
  return list.map((i) => i.hash);
}

test('reorderByHash: dragging down inserts after the target', () => {
  const list = ['a', 'b', 'c', 'd'].map((h) => item({ hash: h }));
  assert.deepEqual(hashes(reorderByHash(list, 'a', 'c')), ['b', 'c', 'a', 'd']);
});

test('reorderByHash: dragging up inserts before the target', () => {
  const list = ['a', 'b', 'c', 'd'].map((h) => item({ hash: h }));
  assert.deepEqual(hashes(reorderByHash(list, 'd', 'b')), ['a', 'd', 'b', 'c']);
});

test('reorderByHash: adjacent swap (the most common drag)', () => {
  const list = ['a', 'b', 'c'].map((h) => item({ hash: h }));
  assert.deepEqual(hashes(reorderByHash(list, 'a', 'b')), ['b', 'a', 'c']);
  assert.deepEqual(hashes(reorderByHash(list, 'b', 'a')), ['b', 'a', 'c']);
});

test('reorderByHash: self-drop and unknown hashes are no-ops, input not mutated', () => {
  const list = ['a', 'b', 'c'].map((h) => item({ hash: h }));
  const before = hashes(list);
  assert.deepEqual(hashes(reorderByHash(list, 'b', 'b')), before);
  assert.deepEqual(hashes(reorderByHash(list, 'nope', 'b')), before);
  assert.deepEqual(hashes(reorderByHash(list, 'b', 'nope')), before);
  assert.deepEqual(hashes(list), before);
});

test('sortItems: added mode keeps collage order', () => {
  const list = [item({ path: '/c.png' }), item({ path: '/a.png' }), item({ path: '/b.png' })];
  assert.deepEqual(
    sortItems(list, 'added').map((i) => i.path),
    ['/c.png', '/a.png', '/b.png']
  );
});

test('fitExportScale: images within the limits keep their size', () => {
  assert.equal(fitExportScale(1800, 5000), 1);
  assert.equal(fitExportScale(MAX_EXPORT_SIDE, 100), 1);
});

test('fitExportScale: the longest side is brought down to the side limit', () => {
  const scale = fitExportScale(1000, 40000);
  assert.ok(scale < 1);
  assert.equal(Math.round(40000 * scale), MAX_EXPORT_SIDE);
});

test('fitExportScale: the area limit wins when both sides are allowed', () => {
  const side = 10000; // under the side limit, but 100M pixels
  const scale = fitExportScale(side, side);
  assert.ok(scale < 1);
  assert.ok(Math.abs(side * scale * (side * scale) - MAX_EXPORT_AREA) < side);
});

test('fitExportScale: custom limits and degenerate sizes', () => {
  assert.equal(fitExportScale(200, 100, 100, 1e9), 0.5);
  assert.equal(fitExportScale(0, 100), 1);
  assert.equal(fitExportScale(100, NaN), 1);
});
