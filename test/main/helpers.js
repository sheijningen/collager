const fs = require('fs');
const os = require('os');
const path = require('path');

/* A fresh directory under the OS temp root, removed when the test ends. */
function createTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `collager-${prefix}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/* Root and Windows ignore permission bits, so a test that locks a file has
 * nothing to check there. */
function skipWithoutPermissionBits(t) {
  if (process.platform !== 'win32' && process.getuid?.() !== 0) return false;
  t.skip('permission bits not enforceable here');
  return true;
}

module.exports = { createTempDir, skipWithoutPermissionBits };
