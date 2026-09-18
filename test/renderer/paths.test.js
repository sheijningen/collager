const { test } = require('node:test');
const assert = require('node:assert/strict');
const { basename } = require('../../src/renderer/core/paths.js');

test('basename handles unix and windows separators', () => {
  assert.equal(basename('/home/user/pic.png'), 'pic.png');
  assert.equal(basename('C:\\Users\\user\\pic.png'), 'pic.png');
  assert.equal(basename('pic.png'), 'pic.png');
});
