const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPrefs } = require('../../src/renderer/core/prefs.js');

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map)
  };
}

test('bool: defaults when unset, decodes 1/0', () => {
  const prefs = createPrefs(fakeStorage({ 'collager.on': '1', 'collager.off': '0' }));
  assert.equal(prefs.bool('on', false), true);
  assert.equal(prefs.bool('off', true), false);
  assert.equal(prefs.bool('unset', true), true);
  assert.equal(prefs.bool('unset', false), false);
});

test('int: clamps to range, defaults on garbage or unset', () => {
  const prefs = createPrefs(
    fakeStorage({
      'collager.speed': '250',
      'collager.low': '-5',
      'collager.high': '9999',
      'collager.junk': 'banana'
    })
  );
  assert.equal(prefs.int('speed', 80, 10, 600), 250);
  assert.equal(prefs.int('low', 80, 10, 600), 10);
  assert.equal(prefs.int('high', 80, 10, 600), 600);
  assert.equal(prefs.int('junk', 80, 10, 600), 80);
  assert.equal(prefs.int('unset', 80, 10, 600), 80);
});

test('string: raw value or default', () => {
  const prefs = createPrefs(fakeStorage({ 'collager.sort': 'name' }));
  assert.equal(prefs.string('sort', 'added'), 'name');
  assert.equal(prefs.string('unset', 'added'), 'added');
});

test('set: encodes booleans as 1/0, numbers as strings, applies the prefix', () => {
  const storage = fakeStorage();
  const prefs = createPrefs(storage);
  prefs.set('a', true);
  prefs.set('b', false);
  prefs.set('c', 42);
  prefs.set('d', 'name');
  assert.deepEqual(storage.dump(), {
    'collager.a': '1',
    'collager.b': '0',
    'collager.c': '42',
    'collager.d': 'name'
  });
});

test('round-trip: what set() writes, the readers decode', () => {
  const storage = fakeStorage();
  const prefs = createPrefs(storage);
  prefs.set('flag', true);
  prefs.set('n', 123);
  prefs.set('s', 'path');
  assert.equal(prefs.bool('flag', false), true);
  assert.equal(prefs.int('n', 0, 0, 1000), 123);
  assert.equal(prefs.string('s', ''), 'path');
});
