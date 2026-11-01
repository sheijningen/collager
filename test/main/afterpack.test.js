const { test } = require('node:test');
const assert = require('node:assert/strict');
const signAdHoc = require('../../build/afterpack.js');

test('the afterPack hook leaves Linux and Windows builds alone', () => {
  for (const platform of ['linux', 'win32']) {
    // a context without packager or appOutDir would throw if the hook read them
    assert.equal(signAdHoc({ electronPlatformName: platform }), undefined);
  }
});
