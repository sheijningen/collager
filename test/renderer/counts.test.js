const { test } = require('node:test');
const assert = require('node:assert/strict');
const { countByExtension, extensionOf } = require('../../src/renderer/core/counts.js');

const item = (path) => ({ path });

test('the extension is the last suffix, lowercased', () => {
  assert.equal(extensionOf('/media/holiday.PNG'), '.png');
  assert.equal(extensionOf('C:\\media\\clip.final.mp4'), '.mp4');
});

test('a name without a usable dot has no extension', () => {
  assert.equal(extensionOf('/media/README'), '');
  assert.equal(extensionOf('/media/.hidden'), '');
  assert.equal(extensionOf('/media.dir/plain'), '');
});

test('the total counts every item', () => {
  const counted = countByExtension([item('/a.png'), item('/b.mp4'), item('/c.png')]);
  assert.equal(counted.total, 3);
});

test('groups are biggest first, ties alphabetical', () => {
  const counted = countByExtension([
    item('/a.webm'),
    item('/b.png'),
    item('/c.png'),
    item('/d.gif')
  ]);
  assert.deepEqual(counted.extensions, [
    { extension: '.png', count: 2 },
    { extension: '.gif', count: 1 },
    { extension: '.webm', count: 1 }
  ]);
});

test('files without an extension group together', () => {
  const counted = countByExtension([item('/media/one'), item('/media/two'), item('/media/a.gif')]);
  assert.deepEqual(counted.extensions, [
    { extension: 'no extension', count: 2 },
    { extension: '.gif', count: 1 }
  ]);
});

test('an empty library has no groups', () => {
  assert.deepEqual(countByExtension([]), { total: 0, extensions: [] });
});
