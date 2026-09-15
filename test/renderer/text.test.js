const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatCount } = require('../../src/renderer/core/text.js');

test('formatCount picks the singular only for exactly one', () => {
  assert.equal(formatCount(1, 'item'), '1 item');
  assert.equal(formatCount(0, 'item'), '0 items');
  assert.equal(formatCount(3, 'missing file'), '3 missing files');
});

test('formatCount takes an explicit plural', () => {
  assert.equal(formatCount(2, 'entry', 'entries'), '2 entries');
  assert.equal(formatCount(1, 'entry', 'entries'), '1 entry');
});
