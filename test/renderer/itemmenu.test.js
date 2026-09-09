const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  menuActsOnSelection,
  menuHeader,
  removeLabel
} = require('../../src/renderer/core/itemmenu.js');

test('the menu acts on the selection only for several items including the clicked one', () => {
  assert.equal(menuActsOnSelection(2, true), true);
  assert.equal(menuActsOnSelection(1, true), false, 'one selected item is not a selection');
  assert.equal(menuActsOnSelection(3, false), false, 'the clicked item is outside it');
  assert.equal(menuActsOnSelection(0, false), false);
});

test('the header is the path for one item and a count for a selection', () => {
  assert.equal(menuHeader('/media/a.png', 1, false), '/media/a.png');
  assert.equal(menuHeader('/media/a.png', 2, true), '2 items selected');
});

test('the remove label names the selection size when acting on it', () => {
  assert.equal(removeLabel(1, false), 'Remove from collage');
  assert.equal(removeLabel(3, true), 'Remove 3 selected');
});
