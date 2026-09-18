/* Bounded parallelism for a batch of async work. The main process keeps its
 * own copy of this pool: the two sides cannot share a module. */

/* Runs `task(element, index)` over `list` with at most `concurrency` calls in
 * flight, and reports each completion as `onProgress(done, total)`. A task
 * must handle its own failures: one that rejects fails the whole run. */
export async function runWithConcurrency(list, concurrency, task, onProgress = null) {
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < list.length) {
      const index = cursor++;
      await task(list[index], index);
      done++;
      if (onProgress) onProgress(done, list.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
}
