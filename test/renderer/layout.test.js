const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  packItems,
  sortItems,
  clampColumns,
  hasOwnDimensions,
  reorderByHash,
  GAP,
  MISSING_W,
  MISSING_H,
  DEFAULT_COLUMNS
} = require('../../src/renderer/core/layout.js');
const { basename } = require('../../src/renderer/core/paths.js');

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

test('hasOwnDimensions: the fallback, a zero or an absent side are not dimensions of its own', () => {
  assert.equal(hasOwnDimensions(item({ w: MISSING_W, h: MISSING_H })), false);
  assert.equal(hasOwnDimensions(item({ w: 0, h: 100 })), false);
  assert.equal(hasOwnDimensions(item({ w: 100, h: 0 })), false);
  assert.equal(hasOwnDimensions(item({ w: undefined, h: 100 })), false);
  assert.equal(hasOwnDimensions(item({ w: 100, h: undefined })), false);
  assert.equal(hasOwnDimensions(item({ w: 640, h: 480 })), true);
  // one fallback side next to a real one is a real measure
  assert.equal(hasOwnDimensions(item({ w: MISSING_W, h: 480 })), true);
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

test('packItems: a present item without dimensions gets the fallback size', () => {
  const colWidth = Math.floor((1000 - GAP) / 2);
  const { positions } = packItems(
    [item({ w: 0, h: 0 }), item({ w: undefined, h: undefined })],
    1000,
    2
  );
  for (const pos of positions) assert.equal(pos.h, Math.round(MISSING_H * (colWidth / MISSING_W)));
});

const { packClones, shuffleItems, reconcileOrder } = require('../../src/renderer/core/layout.js');

test('packItems: stops once every column reaches the stop height', () => {
  const list = [item({ h: 300 }), item({ h: 100 }), item({ h: 100 }), item(), item()];
  // a 100 px column: tiles keep their native size
  const { positions, height } = packItems(list, 100 * 2 + GAP, 2, 150);
  // the 100 px column takes a second tile, then both columns are past 150
  assert.equal(positions.length, 3);
  assert.equal(height, 300);
  assert.deepEqual(positions, packItems(list, 100 * 2 + GAP, 2).positions.slice(0, 3));
});

test('packClones: clones sit wrapHeight below where packItems puts the item', () => {
  const list = [item({ h: 300 }), item({ h: 120 }), item({ h: 80 }), item({ h: 200 })];
  const { positions: real } = packItems(list, 1000, 3);
  const { positions, wrapHeight } = packClones(list, 1000, 3, 777, Infinity);
  assert.equal(wrapHeight, 777 + GAP);
  assert.deepEqual(
    positions,
    real.map((pos) => ({ ...pos, y: pos.y + wrapHeight, clone: true }))
  );
});

test('packClones: every column starts level one gap below the collage', () => {
  const list = [item(), item(), item()];
  const { positions } = packClones(list, 1000, 3, 500, Infinity);
  assert.deepEqual(
    positions.map((pos) => pos.y),
    [500 + GAP, 500 + GAP, 500 + GAP]
  );
});

test('packClones: stops once every column covers the minimum height', () => {
  // 100 px square tiles in two columns: two rows reach 200 + GAP
  const list = Array.from({ length: 10 }, () => item());
  const { positions, height } = packClones(list, 100 * 2 + GAP, 2, 1000, 150);
  assert.equal(positions.length, 4);
  assert.equal(height, 200 + GAP);
});

test('packClones: a list too short to cover the minimum is packed once, not repeated', () => {
  const single = item();
  const one = packClones([single], 1000, 3, 400, 5000);
  assert.equal(one.positions.length, 1);
  assert.equal(one.positions[0].item, single);
  assert.equal(one.positions[0].y, 400 + GAP);
  assert.equal(one.height, one.positions[0].h);

  const few = [item(), item({ h: 50 })];
  const { positions } = packClones(few, 1000, 2, 400, 5000);
  assert.deepEqual(
    positions.map((pos) => pos.item),
    few
  );
});

test('packClones: an empty list gives no clones', () => {
  const { positions, height, wrapHeight } = packClones([], 1000, 3, 0, 500);
  assert.equal(positions.length, 0);
  assert.equal(height, 0);
  assert.equal(wrapHeight, GAP);
});

test('shuffleItems: returns a reordered copy and leaves the list alone', () => {
  const list = [item(), item(), item(), item()];
  const before = list.slice();
  // always picking index 0 rotates the first item to the back, step by step
  const shuffled = shuffleItems(list, () => 0);
  assert.deepEqual(list, before);
  assert.deepEqual(shuffled, [before[1], before[2], before[3], before[0]]);
  assert.deepEqual(
    shuffleItems(list, () => 0.999),
    before
  );
  assert.deepEqual(
    shuffleItems([], () => 0),
    []
  );
});

test('reconcileOrder: the same items keep their order', () => {
  const [first, second, third] = [item(), item(), item()];
  assert.deepEqual(reconcileOrder([third, first, second], [first, second, third]), [
    third,
    first,
    second
  ]);
  assert.deepEqual(reconcileOrder([], []), []);
});

test('reconcileOrder: gone items go and the rest keep their places', () => {
  const [first, second, third] = [item(), item(), item()];
  // an item merged away still in the prepared order never comes back
  assert.deepEqual(reconcileOrder([third, first, second], [first, third]), [third, first]);
  // a copy with the same hash is another object, so it is not the same item
  assert.deepEqual(reconcileOrder([{ ...first }, second], [first, second]), [second, first]);
});

test('reconcileOrder: new items follow at the end in library order', () => {
  const [first, second, third, fourth] = [item(), item(), item(), item()];
  const order = [second, first];
  assert.deepEqual(reconcileOrder(order, [first, fourth, second, third]), [
    second,
    first,
    fourth,
    third
  ]);
  assert.deepEqual(order, [second, first]);
});
