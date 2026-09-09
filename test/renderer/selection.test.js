const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clickSelection } = require('../../src/renderer/core/selection.js');

const ORDER = ['a', 'b', 'c', 'd', 'e'];

function state(selected = [], anchor = null) {
  return { selected: new Set(selected), anchor };
}

function click(s, hash, mods = {}) {
  return clickSelection({
    selected: s.selected,
    anchor: s.anchor,
    hash,
    ctrl: mods.ctrl || false,
    shift: mods.shift || false,
    order: ORDER
  });
}

test('plain click selects only the clicked item and moves the anchor', () => {
  const next = click(state(['a', 'b'], 'a'), 'c');
  assert.deepEqual([...next.selected], ['c']);
  assert.equal(next.anchor, 'c');
});

test('ctrl-click toggles membership and moves the anchor', () => {
  const added = click(state(['a'], 'a'), 'c', { ctrl: true });
  assert.deepEqual([...added.selected].sort(), ['a', 'c']);
  assert.equal(added.anchor, 'c');

  const removed = click(added, 'a', { ctrl: true });
  assert.deepEqual([...removed.selected], ['c']);
  assert.equal(removed.anchor, 'a');
});

test('shift-click selects the range from the anchor, in both directions', () => {
  const down = click(state(['b'], 'b'), 'd', { shift: true });
  assert.deepEqual([...down.selected].sort(), ['b', 'c', 'd']);
  assert.equal(down.anchor, 'b', 'anchor stays for follow-up ranges');

  const up = click(state(['d'], 'd'), 'b', { shift: true });
  assert.deepEqual([...up.selected].sort(), ['b', 'c', 'd']);
});

test('shift-click replaces the previous selection; ctrl+shift extends it', () => {
  const replaced = click(state(['a', 'e'], 'b'), 'c', { shift: true });
  assert.deepEqual([...replaced.selected].sort(), ['b', 'c']);

  const extended = click(state(['e'], 'a'), 'b', { shift: true, ctrl: true });
  assert.deepEqual([...extended.selected].sort(), ['a', 'b', 'e']);
});

test('shift-click without a usable anchor falls back to a plain click', () => {
  const noAnchor = click(state(['a'], null), 'c', { shift: true });
  assert.deepEqual([...noAnchor.selected], ['c']);
  assert.equal(noAnchor.anchor, 'c');

  const staleAnchor = click(state(['a'], 'gone'), 'c', { shift: true });
  assert.deepEqual([...staleAnchor.selected], ['c']);
});

test('the input Set is never mutated', () => {
  const s = state(['a', 'b'], 'a');
  click(s, 'e');
  click(s, 'e', { ctrl: true });
  click(s, 'e', { shift: true });
  assert.deepEqual([...s.selected].sort(), ['a', 'b']);
});
