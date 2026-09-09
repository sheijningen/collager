const { test } = require('node:test');
const assert = require('node:assert/strict');
const { advanceAutoScroll } = require('../../src/renderer/core/autoscroll.js');

const tick = (overrides) => ({
  virtualTop: 100,
  scrollTop: 100,
  maxScroll: 1000,
  speed: 80,
  elapsedSeconds: 0.016,
  ...overrides
});

test('advances by speed times elapsed time', () => {
  assert.deepEqual(advanceAutoScroll(tick({ elapsedSeconds: 0.05 })), {
    top: 104,
    atEnd: false,
    scrollable: true
  });
});

test('a gap between frames longer than 100 ms counts as 100 ms', () => {
  assert.equal(advanceAutoScroll(tick({ elapsedSeconds: 5 })).top, 108);
  assert.equal(advanceAutoScroll(tick({ elapsedSeconds: 0.1 })).top, 108);
});

test('a manual scroll is adopted and the step continues from there', () => {
  assert.equal(advanceAutoScroll(tick({ scrollTop: 400, elapsedSeconds: 0 })).top, 400);
  assert.equal(advanceAutoScroll(tick({ scrollTop: 400, elapsedSeconds: 0.05 })).top, 404);
});

test('rounding drift of up to 2 px is not a manual scroll, more is', () => {
  assert.equal(advanceAutoScroll(tick({ scrollTop: 100.6, elapsedSeconds: 0 })).top, 100);
  assert.equal(advanceAutoScroll(tick({ scrollTop: 102, elapsedSeconds: 0 })).top, 100);
  assert.equal(advanceAutoScroll(tick({ scrollTop: 102.5, elapsedSeconds: 0 })).top, 102.5);
});

test('stops at the end and reports it from half a pixel before', () => {
  assert.deepEqual(
    advanceAutoScroll(tick({ virtualTop: 999, scrollTop: 999, elapsedSeconds: 0.05 })),
    { top: 1000, atEnd: true, scrollable: true }
  );
  assert.equal(
    advanceAutoScroll(tick({ virtualTop: 999.5, scrollTop: 1000, elapsedSeconds: 0 })).atEnd,
    true
  );
  assert.equal(
    advanceAutoScroll(tick({ virtualTop: 999.4, scrollTop: 1000, elapsedSeconds: 0 })).atEnd,
    false
  );
  assert.equal(advanceAutoScroll(tick({ virtualTop: 500, scrollTop: 500 })).atEnd, false);
});

test('with nothing to scroll the position is adopted but never stepped', () => {
  assert.deepEqual(advanceAutoScroll(tick({ maxScroll: 0, elapsedSeconds: 1 })), {
    top: 100,
    atEnd: false,
    scrollable: false
  });
  assert.deepEqual(advanceAutoScroll(tick({ maxScroll: -5, scrollTop: 0, elapsedSeconds: 1 })), {
    top: 0,
    atEnd: false,
    scrollable: false
  });
});
