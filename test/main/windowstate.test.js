const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parseWindowState,
  fitBounds,
  createWindowStateStore,
  DEFAULT_SIZE
} = require('../../src/main/lib/windowstate.js');
const { createTempDir } = require('./helpers.js');

const saved = { x: 100, y: 50, width: 800, height: 600, maximized: false };

test('parseWindowState takes a complete state and nothing less', () => {
  assert.deepEqual(parseWindowState(JSON.stringify(saved)), saved);
  assert.deepEqual(parseWindowState(JSON.stringify({ ...saved, maximized: true })), {
    ...saved,
    maximized: true
  });
  // anything but true is not maximized
  assert.equal(parseWindowState(JSON.stringify({ ...saved, maximized: 'yes' })).maximized, false);
  assert.equal(parseWindowState('not json'), null);
  assert.equal(parseWindowState('[1, 2]'), null);
  assert.equal(parseWindowState(JSON.stringify({ x: 1, y: 2, width: 800 })), null);
  assert.equal(parseWindowState(JSON.stringify({ ...saved, x: 1.5 })), null);
  assert.equal(parseWindowState(JSON.stringify({ ...saved, width: 10 })), null);
  assert.equal(parseWindowState(JSON.stringify({ ...saved, height: NaN })), null);
});

const displays = [
  { x: 0, y: 0, width: 1920, height: 1050 },
  { x: 1920, y: 0, width: 1280, height: 800 }
];

test('fitBounds keeps bounds that sit on a display', () => {
  assert.deepEqual(fitBounds(saved, displays), { x: 100, y: 50, width: 800, height: 600 });
  const second = { ...saved, x: 2000, y: 100 };
  assert.deepEqual(fitBounds(second, displays), { x: 2000, y: 100, width: 800, height: 600 });
});

test('fitBounds pulls a window that hangs off its display back onto it', () => {
  const edge = { ...saved, x: 1920 - 64, y: -500 };
  assert.deepEqual(fitBounds(edge, [displays[0]]), { x: 1120, y: 0, width: 800, height: 600 });
  const below = { ...saved, x: 2500, y: 700 };
  assert.deepEqual(fitBounds(below, displays), { x: 2400, y: 200, width: 800, height: 600 });
  // too little of it on the display to count as its display
  const gone = { ...saved, x: 1920 - 63, y: -500 };
  assert.deepEqual(fitBounds(gone, [displays[0]]), DEFAULT_SIZE);
});

test('fitBounds falls back to the default size when the display is gone or nothing is saved', () => {
  assert.deepEqual(fitBounds({ ...saved, x: 5000, y: 5000 }, displays), DEFAULT_SIZE);
  assert.deepEqual(fitBounds(null, displays), DEFAULT_SIZE);
  assert.deepEqual(fitBounds(saved, []), DEFAULT_SIZE);
});

test('fitBounds caps the size to the work area of the display and places it inside', () => {
  const huge = { ...saved, x: 2000, y: 10, width: 3000, height: 2000 };
  assert.deepEqual(fitBounds(huge, displays), { x: 1920, y: 0, width: 1280, height: 800 });
});

test('the store round-trips the state and answers null for a missing file', (t) => {
  const dir = path.join(createTempDir(t, 'win'), 'not', 'yet');
  const store = createWindowStateStore(() => dir);
  assert.equal(store.load(), null);
  store.save(saved);
  assert.deepEqual(store.load(), saved);
  fs.writeFileSync(path.join(dir, 'window.json'), '{');
  assert.equal(store.load(), null);
});
