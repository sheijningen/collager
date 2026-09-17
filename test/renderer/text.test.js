const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatCount,
  describeAddOutcome,
  describeRemoval
} = require('../../src/renderer/core/text.js');

test('formatCount picks the singular only for exactly one', () => {
  assert.equal(formatCount(1, 'item'), '1 item');
  assert.equal(formatCount(0, 'item'), '0 items');
  assert.equal(formatCount(3, 'missing file'), '3 missing files');
});

test('formatCount takes an explicit plural', () => {
  assert.equal(formatCount(2, 'entry', 'entries'), '2 entries');
  assert.equal(formatCount(1, 'entry', 'entries'), '1 entry');
});

const nothingLeftOut = { unsupportedCount: 0, unsupportedExtensions: [], unreadableCount: 0 };

test('describeAddOutcome joins one fragment per outcome', () => {
  assert.equal(
    describeAddOutcome({
      added: 3,
      duplicates: 2,
      unsupportedCount: 12,
      unsupportedExtensions: ['.heic', '.mov'],
      unreadableCount: 1
    }),
    'added 3 · 2 duplicates skipped · 12 unsupported files skipped (.heic, .mov) · 1 item could not be read'
  );
  assert.equal(describeAddOutcome({ added: 1, duplicates: 0, ...nothingLeftOut }), 'added 1');
  assert.equal(
    describeAddOutcome({ added: 0, duplicates: 0, ...nothingLeftOut }),
    'Nothing to add'
  );
});

test('describeAddOutcome names no format when none has an extension', () => {
  assert.equal(
    describeAddOutcome({
      added: 0,
      duplicates: 0,
      unsupportedCount: 1,
      unsupportedExtensions: [],
      unreadableCount: 0
    }),
    '1 unsupported file skipped'
  );
});

test('describeAddOutcome caps the list at three formats', () => {
  const outcome = (unsupportedExtensions) =>
    describeAddOutcome({
      added: 0,
      duplicates: 0,
      unsupportedCount: 9,
      unsupportedExtensions,
      unreadableCount: 0
    });
  assert.equal(
    outcome(['.heic', '.mov', '.aae', '.xmp', '.db']),
    '9 unsupported files skipped (.heic, .mov, .aae, +2 more)'
  );
  assert.equal(
    outcome(['.heic', '.mov', '.aae']),
    '9 unsupported files skipped (.heic, .mov, .aae)'
  );
});

test('describeRemoval names the outcome on the button', () => {
  assert.deepEqual(describeRemoval('all 12 items'), {
    message: 'Remove all 12 items from the collage?',
    confirmLabel: 'Remove all 12 items'
  });
});
