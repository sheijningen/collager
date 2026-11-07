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
    scrollable: true,
    wrapped: false
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
    { top: 1000, atEnd: true, scrollable: true, wrapped: false }
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
    scrollable: false,
    wrapped: false
  });
  assert.deepEqual(advanceAutoScroll(tick({ maxScroll: -5, scrollTop: 0, elapsedSeconds: 1 })), {
    top: 0,
    atEnd: false,
    scrollable: false,
    wrapped: false
  });
});

test('with a wrap height the step runs on below it and never reaches the end', () => {
  assert.deepEqual(
    advanceAutoScroll(
      tick({
        virtualTop: 990,
        scrollTop: 990,
        wrapHeight: 1000,
        maxScroll: 1500,
        elapsedSeconds: 0.1
      })
    ).top,
    998
  );
  assert.deepEqual(
    advanceAutoScroll(
      tick({
        virtualTop: 999,
        scrollTop: 999,
        wrapHeight: 1200,
        maxScroll: 1000,
        elapsedSeconds: 0.05
      })
    ),
    { top: 1003, atEnd: false, scrollable: true, wrapped: false }
  );
});

test('a step that reaches the wrap height lands that far further up', () => {
  assert.deepEqual(
    advanceAutoScroll(
      tick({
        virtualTop: 996,
        scrollTop: 996,
        wrapHeight: 1000,
        maxScroll: 1500,
        elapsedSeconds: 0.05
      })
    ),
    { top: 0, atEnd: false, scrollable: true, wrapped: true }
  );
  assert.deepEqual(
    advanceAutoScroll(
      tick({
        virtualTop: 998,
        scrollTop: 998,
        wrapHeight: 1000,
        maxScroll: 1500,
        elapsedSeconds: 0.05
      })
    ),
    { top: 2, atEnd: false, scrollable: true, wrapped: true }
  );
});

test('a manual scroll far past the wrap height wraps by it once', () => {
  assert.deepEqual(
    advanceAutoScroll(
      tick({
        virtualTop: 500,
        scrollTop: 1300,
        wrapHeight: 1000,
        maxScroll: 1500,
        elapsedSeconds: 0.05
      })
    ),
    { top: 304, atEnd: false, scrollable: true, wrapped: true }
  );
});

test('a wrap height of 0 keeps the step stopping at the end', () => {
  assert.deepEqual(
    advanceAutoScroll(
      tick({ virtualTop: 999, scrollTop: 999, wrapHeight: 0, elapsedSeconds: 0.05 })
    ),
    { top: 1000, atEnd: true, scrollable: true, wrapped: false }
  );
});

test('with nothing to scroll a wrap height changes nothing', () => {
  assert.deepEqual(
    advanceAutoScroll(tick({ maxScroll: 0, wrapHeight: 50, scrollTop: 0, elapsedSeconds: 1 })),
    { top: 0, atEnd: false, scrollable: false, wrapped: false }
  );
});

const {
  clampScrollSpeed,
  MIN_SCROLL_SPEED,
  MAX_SCROLL_SPEED,
  DEFAULT_SCROLL_SPEED
} = require('../../src/renderer/core/autoscroll.js');

test('clampScrollSpeed keeps the speed within the slider range', () => {
  assert.equal(clampScrollSpeed(MIN_SCROLL_SPEED - 5), MIN_SCROLL_SPEED);
  assert.equal(clampScrollSpeed(MAX_SCROLL_SPEED + 5), MAX_SCROLL_SPEED);
  assert.equal(clampScrollSpeed(120), 120);
  assert.equal(clampScrollSpeed(NaN), DEFAULT_SCROLL_SPEED);
});
