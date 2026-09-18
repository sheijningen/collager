const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mayCarryMedia, explainEmptyDrop } = require('../../src/renderer/core/drop.js');

test('files and links may carry media, text does not', () => {
  assert.equal(mayCarryMedia(['Files']), true);
  assert.equal(mayCarryMedia(['text/uri-list', 'text/html']), true);
  assert.equal(mayCarryMedia(['text/plain']), false);
});

test('a drop of links is explained', () => {
  assert.match(explainEmptyDrop(['text/uri-list', 'text/html'], 0), /on this computer/);
});

test('a file without a location on disk is explained the same way', () => {
  assert.match(explainEmptyDrop(['Files'], 1), /on this computer/);
});

test('plain text or an empty drop says nothing', () => {
  assert.equal(explainEmptyDrop(['text/plain'], 0), null);
  assert.equal(explainEmptyDrop([], 0), null);
});
