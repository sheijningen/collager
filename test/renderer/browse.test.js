const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findShowableNeighbour } = require('../../src/renderer/core/browse.js');

const items = [
  { hash: 'a' },
  { hash: 'b', missing: true },
  { hash: 'c', unshowable: true },
  { hash: 'd' },
  { hash: 'e' }
];

test('steps to the next and previous showable item', () => {
  assert.equal(findShowableNeighbour(items, 'd', 1).hash, 'e');
  assert.equal(findShowableNeighbour(items, 'e', -1).hash, 'd');
});

test('skips missing and unshowable items', () => {
  assert.equal(findShowableNeighbour(items, 'a', 1).hash, 'd');
  assert.equal(findShowableNeighbour(items, 'd', -1).hash, 'a');
});

test('stops at either end and on an unknown item', () => {
  assert.equal(findShowableNeighbour(items, 'a', -1), null);
  assert.equal(findShowableNeighbour(items, 'e', 1), null);
  assert.equal(findShowableNeighbour(items, 'zzz', 1), null);
});
