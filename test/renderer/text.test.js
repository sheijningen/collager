const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatCount,
  describeAddOutcome,
  describeRemoval,
  fileProblem,
  tileLabel
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

test('fileProblem tells a gone file from one that cannot be decoded', () => {
  assert.equal(fileProblem({ missing: true }), 'missing');
  assert.equal(fileProblem({ unshowable: true }), 'unshowable');
  assert.equal(fileProblem({ missing: true, unshowable: true }), 'missing');
  assert.equal(fileProblem({}), null);
});

test('tileLabel prefixes the name with the problem', () => {
  assert.equal(tileLabel({}, 'a.png'), 'a.png');
  assert.equal(tileLabel({ missing: true }, 'a.png'), 'missing: a.png');
  assert.equal(tileLabel({ unshowable: true }, 'a.mp4'), 'cannot be shown: a.mp4');
});

const {
  hintForFileProblem,
  badgeLabel,
  clearMissingLabel,
  describeLibraryProblem,
  describeStartupNotes
} = require('../../src/renderer/core/text.js');

test('hintForFileProblem explains each problem and is silent without one', () => {
  assert.match(hintForFileProblem('missing'), /moved or renamed/);
  assert.match(hintForFileProblem('unshowable'), /cannot show it/);
  assert.equal(hintForFileProblem(null), '');
});

test('badgeLabel names the three media types', () => {
  assert.equal(badgeLabel('image'), 'IMG');
  assert.equal(badgeLabel('gif'), 'GIF');
  assert.equal(badgeLabel('video'), 'VID');
});

test('describeLibraryProblem names the backup, or says the file stays put', () => {
  assert.equal(
    describeLibraryProblem({ backup: '/home/me/.config/collager/library.json.corrupt' }),
    'The library file could not be read, starting empty. It was kept as library.json.corrupt.'
  );
  assert.match(describeLibraryProblem({ backup: null }), /stays where it is and saving is off/);
});

test('describeStartupNotes points at the menu entry with its exact label', () => {
  assert.equal(describeStartupNotes({ missingCount: 0, collapsed: 0 }), '');
  assert.equal(
    describeStartupNotes({ missingCount: 2, collapsed: 0 }),
    `2 files missing on disk, see Collage > ${clearMissingLabel(2)}`
  );
  assert.equal(describeStartupNotes({ missingCount: 0, collapsed: 1 }), '1 duplicate merged');
  assert.match(
    describeStartupNotes({ missingCount: 1, collapsed: 3 }),
    /missing on disk.* · 3 duplicates merged$/
  );
});
