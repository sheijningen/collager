const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  retryDelay,
  selectDueRetries,
  canStartRetry,
  beginRetry,
  bookNextRetry,
  FIRST_RETRY_MS,
  MAX_RETRY_MS,
  SLOW_RETRY_MS,
  LONG_RETRY_MS,
  MAX_BACK_OFFS,
  FLIP_WINDOW_MS
} = require('../../src/renderer/core/retry.js');

/* a fresh booking as selectDueRetries makes it */
function booked(dueAt, rest = {}) {
  return {
    attempts: 0,
    dueAt,
    inFlight: false,
    flips: 0,
    returnedAt: null,
    backOffs: 0,
    ...rest
  };
}

test('retryDelay waits 5, 10 and 15 seconds, then half a minute for good', () => {
  assert.equal(FIRST_RETRY_MS, 5_000);
  assert.equal(retryDelay(0), 5_000);
  assert.equal(retryDelay(1), 10_000);
  assert.equal(retryDelay(2), 15_000);
  assert.equal(retryDelay(3), MAX_RETRY_MS);
  assert.equal(retryDelay(20), MAX_RETRY_MS);
  assert.equal(MAX_RETRY_MS, 30_000);
});

const missing = { hash: 'a', missing: true };
const unshowable = { hash: 'b', unshowable: true };
const fine = { hash: 'c' };
const undecodable = { hash: 'a', unshowable: true }; // the same file as `missing`, there but failing

function indexByHash(items) {
  return new Map(items.map((item) => [item.hash, item]));
}

test('an item new to the schedule is booked for the first wait, not due', () => {
  const schedule = new Map();
  assert.deepEqual(selectDueRetries(indexByHash([missing, unshowable, fine]), schedule, 1000), []);
  assert.deepEqual(schedule.get('a'), booked(1000 + FIRST_RETRY_MS));
  assert.deepEqual(schedule.get('b'), booked(1000 + FIRST_RETRY_MS));
  assert.equal(schedule.has('c'), false);
});

test('an item is due once its wait has passed', () => {
  const schedule = new Map();
  const items = [missing, unshowable];
  selectDueRetries(indexByHash(items), schedule, 1000);
  assert.deepEqual(selectDueRetries(indexByHash(items), schedule, 1000 + FIRST_RETRY_MS - 1), []);
  assert.deepEqual(selectDueRetries(indexByHash(items), schedule, 1000 + FIRST_RETRY_MS), [
    missing,
    unshowable
  ]);
});

test('an attempt in flight is not selected again until it settles', () => {
  const schedule = new Map();
  const items = [missing, unshowable];
  selectDueRetries(indexByHash(items), schedule, 1000);
  const firstDue = 1000 + FIRST_RETRY_MS;
  beginRetry(schedule, 'a');
  assert.equal(canStartRetry(schedule, 'a', firstDue), false);
  assert.equal(canStartRetry(schedule, 'b', firstDue), true);
  assert.deepEqual(selectDueRetries(indexByHash(items), schedule, firstDue), [unshowable]);
  assert.deepEqual(selectDueRetries(indexByHash(items), schedule, firstDue + MAX_RETRY_MS), [
    unshowable
  ]);
  // booked from the settle time, not the due time
  bookNextRetry(schedule, 'a', firstDue + 7000);
  assert.equal(canStartRetry(schedule, 'a', firstDue + 7000), false);
  assert.equal(canStartRetry(schedule, 'a', firstDue + 7000 + retryDelay(1)), true);
  assert.deepEqual(schedule.get('a'), booked(firstDue + 7000 + retryDelay(1), { attempts: 1 }));
});

test('answers that say the file is not coming back double the wait, up to ten minutes', () => {
  const schedule = new Map();
  selectDueRetries(indexByHash([missing]), schedule, 0);
  const waits = [];
  let now = 0;
  for (let attempt = 0; attempt < 9; attempt++) {
    bookNextRetry(schedule, 'a', now, { backOff: true });
    waits.push(schedule.get('a').dueAt - now);
    now = schedule.get('a').dueAt;
  }
  assert.deepEqual(waits, [
    10_000,
    15_000,
    30_000,
    60_000,
    120_000,
    240_000,
    480_000,
    LONG_RETRY_MS,
    LONG_RETRY_MS
  ]);
  // an answer that does not say so starts the doubling over
  bookNextRetry(schedule, 'a', now, { backOff: false });
  assert.equal(schedule.get('a').dueAt - now, MAX_RETRY_MS);
  assert.equal(schedule.get('a').backOffs, 0);
});

test('enough such answers in a row leave the file alone until the next start', () => {
  const schedule = new Map();
  selectDueRetries(indexByHash([missing]), schedule, 0);
  for (let answer = 0; answer < MAX_BACK_OFFS - 1; answer++) {
    bookNextRetry(schedule, 'a', 0, { backOff: true });
  }
  assert.notEqual(schedule.get('a').dueAt, Infinity);
  bookNextRetry(schedule, 'a', 0, { backOff: true });
  assert.equal(schedule.get('a').dueAt, Infinity);
});

test('a slow answer books the next attempt minutes out', () => {
  const schedule = new Map();
  selectDueRetries(indexByHash([missing]), schedule, 1000);
  bookNextRetry(schedule, 'a', 2000, { slow: true });
  assert.equal(schedule.get('a').dueAt, 2000 + SLOW_RETRY_MS);
  bookNextRetry(schedule, 'a', 3000, { slow: false });
  assert.equal(schedule.get('a').dueAt, 3000 + retryDelay(2));
});

test('a file that comes back and fails to decode twice in quick succession is left alone', () => {
  const schedule = new Map();
  const fineAgain = { hash: 'a' };
  selectDueRetries(indexByHash([undecodable]), schedule, 1000);
  bookNextRetry(schedule, 'a', 2000, { cameBack: true });
  assert.equal(schedule.get('a').returnedAt, 2000);
  // failing again soon after is one flip
  selectDueRetries(indexByHash([undecodable]), schedule, 2000 + FLIP_WINDOW_MS - 1);
  assert.equal(schedule.get('a').flips, 1);
  assert.equal(schedule.get('a').returnedAt, null);
  bookNextRetry(schedule, 'a', 3000, { cameBack: true });
  selectDueRetries(indexByHash([fineAgain]), schedule, 3500);
  // a failure long after a return is not a flip
  selectDueRetries(indexByHash([undecodable]), schedule, 3000 + FLIP_WINDOW_MS);
  assert.equal(schedule.get('a').flips, 1);
  bookNextRetry(schedule, 'a', 4000, { cameBack: true });
  selectDueRetries(indexByHash([undecodable]), schedule, 4500);
  assert.equal(schedule.get('a').flips, 2);
  assert.equal(schedule.get('a').dueAt, Infinity);
  assert.deepEqual(
    selectDueRetries(indexByHash([undecodable]), schedule, Number.MAX_SAFE_INTEGER),
    []
  );
});

test('a return that holds for the window ends the run of flips', () => {
  const schedule = new Map();
  selectDueRetries(indexByHash([undecodable]), schedule, 1000);
  bookNextRetry(schedule, 'a', 2000, { cameBack: true });
  selectDueRetries(indexByHash([undecodable]), schedule, 2500);
  assert.equal(schedule.get('a').flips, 1);
  bookNextRetry(schedule, 'a', 3000, { cameBack: true });
  selectDueRetries(indexByHash([{ hash: 'a' }]), schedule, 3000 + FLIP_WINDOW_MS);
  assert.equal(schedule.get('a').flips, 0);
  assert.equal(schedule.get('a').returnedAt, null);
});

test('every attempt books the next one after a longer wait', () => {
  const schedule = new Map();
  selectDueRetries(indexByHash([missing]), schedule, 1000);
  const firstDue = 1000 + FIRST_RETRY_MS;
  beginRetry(schedule, 'a');
  bookNextRetry(schedule, 'a', firstDue);
  assert.deepEqual(schedule.get('a'), booked(firstDue + retryDelay(1), { attempts: 1 }));
  assert.deepEqual(
    selectDueRetries(indexByHash([missing]), schedule, firstDue + retryDelay(1) - 1),
    []
  );
  assert.deepEqual(selectDueRetries(indexByHash([missing]), schedule, firstDue + retryDelay(1)), [
    missing
  ]);
});

test('starting or booking a hash that is not scheduled is ignored', () => {
  const schedule = new Map();
  beginRetry(schedule, 'zzz');
  bookNextRetry(schedule, 'zzz', 5);
  assert.equal(schedule.size, 0);
  assert.equal(canStartRetry(schedule, 'zzz', 5), false);
});

test('an item that shows again keeps its entry, so failing again continues the backoff', () => {
  const schedule = new Map();
  selectDueRetries(indexByHash([missing]), schedule, 1000);
  bookNextRetry(schedule, 'a', 2000);
  bookNextRetry(schedule, 'a', 3000);
  selectDueRetries(indexByHash([{ hash: 'a' }]), schedule, 4000);
  assert.deepEqual(schedule.get('a'), booked(3000 + retryDelay(2), { attempts: 2 }));
  // not due until the longer wait ends
  assert.deepEqual(
    selectDueRetries(indexByHash([missing]), schedule, 3000 + retryDelay(2) - 1),
    []
  );
  assert.deepEqual(selectDueRetries(indexByHash([missing]), schedule, 3000 + retryDelay(2)), [
    missing
  ]);
});

test('an item that left the library leaves the schedule', () => {
  const schedule = new Map();
  selectDueRetries(indexByHash([missing, unshowable]), schedule, 1000);
  selectDueRetries(indexByHash([unshowable]), schedule, 2000);
  assert.deepEqual([...schedule.keys()], ['b']);
  // a fresh failure restarts the short wait
  selectDueRetries(indexByHash([missing, unshowable]), schedule, 5000);
  assert.deepEqual(schedule.get('a'), booked(5000 + FIRST_RETRY_MS));
});
