const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  targetConsumesKey,
  normalizeShortcutKey,
  SCROLL_KEYS,
  RANGE_INPUT_KEYS
} = require('../../src/renderer/core/keys.js');

test('no target or a plain element consumes nothing', () => {
  assert.equal(targetConsumesKey(null, ' '), false);
  assert.equal(targetConsumesKey({}, ' '), false);
  assert.equal(targetConsumesKey({ tagName: 'DIV' }, 's'), false);
  assert.equal(targetConsumesKey({ tagName: 'BODY' }, ' '), false);
});

test('text-like inputs, textareas and selects consume every key', () => {
  for (const type of ['text', 'search', 'number', undefined]) {
    assert.equal(targetConsumesKey({ tagName: 'INPUT', type }, 's'), true, `type ${type}`);
  }
  assert.equal(targetConsumesKey({ tagName: 'TEXTAREA' }, 'F1'), true);
  assert.equal(targetConsumesKey({ tagName: 'SELECT' }, 'ArrowDown'), true);
});

test('buttons need Space and Enter, checkboxes and radios only Space', () => {
  assert.equal(targetConsumesKey({ tagName: 'BUTTON' }, ' '), true);
  assert.equal(targetConsumesKey({ tagName: 'BUTTON' }, 'Enter'), true);
  assert.equal(targetConsumesKey({ tagName: 'BUTTON' }, 's'), false);
  assert.equal(targetConsumesKey({ tagName: 'INPUT', type: 'checkbox' }, ' '), true);
  assert.equal(targetConsumesKey({ tagName: 'INPUT', type: 'checkbox' }, 'Enter'), false);
  assert.equal(targetConsumesKey({ tagName: 'INPUT', type: 'radio' }, ' '), true);
});

test('sliders keep the arrow and paging keys and nothing else', () => {
  const slider = { tagName: 'INPUT', type: 'range' };
  for (const key of [
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
    'PageUp',
    'PageDown'
  ]) {
    assert.equal(targetConsumesKey(slider, key), true, key);
  }
  assert.equal(targetConsumesKey(slider, ' '), false);
  assert.equal(targetConsumesKey(slider, ','), false);
});

test('a focused video keeps Space and the arrows for its controls', () => {
  assert.equal(targetConsumesKey({ tagName: 'VIDEO' }, ' '), true);
  assert.equal(targetConsumesKey({ tagName: 'VIDEO' }, 'ArrowRight'), true);
  assert.equal(targetConsumesKey({ tagName: 'VIDEO' }, 'f'), false);
});

test('normalizeShortcutKey lowercases letters and leaves named keys alone', () => {
  assert.equal(normalizeShortcutKey('S'), 's');
  assert.equal(normalizeShortcutKey('s'), 's');
  assert.equal(normalizeShortcutKey('?'), '?');
  assert.equal(normalizeShortcutKey('F1'), 'F1');
  assert.equal(normalizeShortcutKey('Escape'), 'Escape');
});

test('SCROLL_KEYS is Space plus every key a slider consumes', () => {
  assert.equal(SCROLL_KEYS[0], ' ');
  assert.deepEqual(SCROLL_KEYS.slice(1), RANGE_INPUT_KEYS);
});
