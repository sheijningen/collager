const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clampMenuPosition } = require('../../src/renderer/core/menuposition.js');

const viewport = { viewportWidth: 1000, viewportHeight: 800 };
const menu = { width: 200, height: 100 };

test('a menu that fits opens at the pointer', () => {
  assert.deepEqual(clampMenuPosition({ x: 300, y: 200, ...menu, ...viewport }), {
    left: 300,
    top: 200
  });
});

test('near the right or bottom edge it is pushed back inside by the margin', () => {
  const { left, top } = clampMenuPosition({ x: 950, y: 780, ...menu, ...viewport });
  assert.equal(left, 792);
  assert.equal(top, 692);
});

test('it never goes past the margin at the top or left', () => {
  assert.deepEqual(clampMenuPosition({ x: 0, y: 0, ...menu, ...viewport }), { left: 8, top: 8 });
  // a menu taller than the viewport still starts at the top margin
  const tall = clampMenuPosition({ x: 100, y: 100, width: 200, height: 2000, ...viewport });
  assert.equal(tall.top, 8);
});
