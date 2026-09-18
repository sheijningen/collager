const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runWithConcurrency } = require('../../src/renderer/core/concurrency.js');

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('never has more tasks in flight than the concurrency', async () => {
  let inFlight = 0;
  let peak = 0;
  await runWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await settle();
    inFlight--;
  });
  assert.equal(peak, 2);
});

test('visits every element once, with its index, and reports each completion', async () => {
  const seen = [];
  const progress = [];
  await runWithConcurrency(
    ['a', 'b', 'c'],
    5,
    async (element, index) => {
      seen.push([element, index]);
    },
    (done, total) => progress.push([done, total])
  );
  assert.deepEqual(seen.sort(), [
    ['a', 0],
    ['b', 1],
    ['c', 2]
  ]);
  assert.deepEqual(progress, [
    [1, 3],
    [2, 3],
    [3, 3]
  ]);
});

test('a rejecting task fails the whole run', async () => {
  await assert.rejects(
    runWithConcurrency([1, 2], 1, async (element) => {
      if (element === 2) throw new Error('boom');
    }),
    /boom/
  );
});

test('an empty list resolves without calling the task', async () => {
  let calls = 0;
  await runWithConcurrency([], 3, async () => calls++);
  assert.equal(calls, 0);
});
