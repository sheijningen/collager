/* ---------------- status area ----------------
 * Progress of long-running work. Each job owns its own line, so no caller
 * can overwrite another's text, and a line disappears exactly when its job
 * finishes. Toasts stay for one-off messages. */

const statusEl = document.getElementById('status');
const jobs = new Set();

/* Starts a job line reading `label`. `update(detail)` turns it into
 * "label: detail", `finish()` removes it. */
export function startJob(label) {
  const line = document.createElement('div');
  line.className = 'job';
  line.textContent = label;
  statusEl.appendChild(line);
  statusEl.hidden = false;
  const job = {
    update(detail) {
      line.textContent = detail ? `${label}: ${detail}` : label;
    },
    finish() {
      if (!jobs.has(job)) return;
      jobs.delete(job);
      line.remove();
      statusEl.hidden = jobs.size === 0;
    }
  };
  jobs.add(job);
  return job;
}

export function countRunningJobs() {
  return jobs.size;
}
