/* The schedule on which a file that could not be shown is looked at again:
 * 5 s after the failure, then 10 s and 15 s later, then every 30 s. */

import { fileProblem } from './text.js';

const EARLY_RETRIES_MS = [5_000, 10_000, 15_000];
export const FIRST_RETRY_MS = EARLY_RETRIES_MS[0];
export const MAX_RETRY_MS = 30_000;
// a file that is not about to come back (gone from a folder that is there,
// or there but undecodable) waits twice as long after each such answer
export const LONG_RETRY_MS = 10 * 60_000;
const BACK_OFF_FROM = 3; // answers in a row before the wait starts doubling
export const MAX_BACK_OFFS = 10; // answers in a row (about half an hour) before it is left alone
// an answer this slow that finds no file comes from a share that is dropping
// out, whose files then wait this long between attempts so they do not hold
// up the others
export const SLOW_ANSWER_MS = 5_000;
export const SLOW_RETRY_MS = 5 * 60_000;
// failing to decode this soon after coming back is a flip, not a return
export const FLIP_WINDOW_MS = 60_000;
const MAX_FLIPS = 2;

/* How long to wait before the next attempt after `attempts` of them. */
export function retryDelay(attempts) {
  return EARLY_RETRIES_MS[attempts] ?? MAX_RETRY_MS;
}

/* Syncs `schedule` (hash -> { attempts, dueAt, inFlight, flips, returnedAt,
 * backOffs })
 * with `itemsByHash` and returns the items due at `now` whose previous
 * attempt has settled. A newly failing item is booked, not due. An entry
 * outlives the problem, so a file that fails again after coming back keeps
 * its grown interval, and one that fails to decode twice in a row within
 * FLIP_WINDOW_MS of returning is left alone. Only a hash that left the
 * library is dropped. */
export function selectDueRetries(itemsByHash, schedule, now) {
  const due = [];
  for (const item of itemsByHash.values()) {
    const entry = schedule.get(item.hash);
    if (!fileProblem(item)) {
      // a return that held for the window ends the run of flips
      if (entry && entry.returnedAt !== null && now - entry.returnedAt >= FLIP_WINDOW_MS) {
        entry.flips = 0;
        entry.returnedAt = null;
      }
      continue;
    }
    if (!entry) {
      schedule.set(item.hash, {
        attempts: 0,
        dueAt: now + retryDelay(0),
        inFlight: false,
        flips: 0,
        returnedAt: null,
        backOffs: 0
      });
      continue;
    }
    if (entry.returnedAt !== null) {
      // a file that is gone again is a drive unplugged again, not a flip
      if (item.unshowable && now - entry.returnedAt < FLIP_WINDOW_MS) entry.flips += 1;
      entry.returnedAt = null;
      if (entry.flips >= MAX_FLIPS) entry.dueAt = Infinity;
    }
    if (canStartRetry(schedule, item.hash, now)) due.push(item);
  }
  for (const hash of [...schedule.keys()]) {
    if (!itemsByHash.has(hash)) schedule.delete(hash);
  }
  return due;
}

/* Whether `hash` is booked, due at `now` and not being attempted. */
export function canStartRetry(schedule, hash, now) {
  const entry = schedule.get(hash);
  return entry !== undefined && !entry.inFlight && entry.dueAt <= now;
}

/* Marks the attempt for `hash` as started: it is not selected again before
 * it settles. */
export function beginRetry(schedule, hash) {
  const entry = schedule.get(hash);
  if (entry) entry.inFlight = true;
}

/* Books the next attempt for `hash` after one that settled at `now`: after
 * the grown wait, doubled for every `backOff` answer in a row beyond the
 * first few up to LONG_RETRY_MS and never again after MAX_BACK_OFFS of
 * them, or SLOW_RETRY_MS at least after a `slow` answer. `cameBack` records
 * a file that showed again. */
export function bookNextRetry(
  schedule,
  hash,
  now,
  { cameBack = false, slow = false, backOff = false } = {}
) {
  const entry = schedule.get(hash);
  if (!entry) return;
  entry.inFlight = false;
  entry.attempts += 1;
  entry.backOffs = backOff ? entry.backOffs + 1 : 0;
  if (cameBack) entry.returnedAt = now;
  if (entry.backOffs >= MAX_BACK_OFFS) {
    entry.dueAt = Infinity;
    return;
  }
  let delay = retryDelay(entry.attempts);
  const doublings = Math.max(0, entry.backOffs - BACK_OFF_FROM);
  if (doublings) delay = Math.min(delay * 2 ** doublings, LONG_RETRY_MS);
  if (slow) delay = Math.max(delay, SLOW_RETRY_MS);
  entry.dueAt = now + delay;
}
