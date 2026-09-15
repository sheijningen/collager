const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildListKey } = require('../../src/renderer/core/listkey.js');

const wide = { hash: 'aaa', path: '/media/wide.png', type: 'image', missing: false };
const tall = { hash: 'bbb', path: '/media/tall.png', type: 'image', missing: false };

test('the same items in the same order give the same key', () => {
  assert.equal(
    buildListKey([wide, tall], 'added'),
    buildListKey([{ ...wide }, { ...tall }], 'added')
  );
});

test('order, sort mode and every shown field change the key', () => {
  const base = buildListKey([wide, tall], 'added');
  assert.notEqual(buildListKey([tall, wide], 'added'), base);
  assert.notEqual(buildListKey([wide, tall], 'name'), base);
  assert.notEqual(buildListKey([wide, { ...tall, path: '/moved/tall.png' }], 'added'), base);
  assert.notEqual(buildListKey([wide, { ...tall, type: 'gif' }], 'added'), base);
  assert.notEqual(buildListKey([wide, { ...tall, missing: true }], 'added'), base);
});

test('fields the list does not show leave the key alone', () => {
  const base = buildListKey([wide, tall], 'added');
  assert.equal(buildListKey([wide, { ...tall, w: 10, h: 20, url: 'file:///x' }], 'added'), base);
});

test('an empty list has a key per sort mode', () => {
  assert.notEqual(buildListKey([], 'added'), buildListKey([], 'name'));
});
