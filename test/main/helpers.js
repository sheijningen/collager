/* Root and Windows ignore permission bits, so a test that locks a file has
 * nothing to check there. */
function skipWithoutPermissionBits(t) {
  if (process.platform !== 'win32' && process.getuid?.() !== 0) return false;
  t.skip('permission bits not enforceable here');
  return true;
}

module.exports = { skipWithoutPermissionBits };
