const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  basename,
  dirname,
  volumeRoot,
  urlForContent
} = require('../../src/renderer/core/paths.js');

test('basename handles unix and windows separators', () => {
  assert.equal(basename('/home/user/pic.png'), 'pic.png');
  assert.equal(basename('C:\\Users\\user\\pic.png'), 'pic.png');
  assert.equal(basename('pic.png'), 'pic.png');
});

test('dirname handles unix and windows separators', () => {
  assert.equal(dirname('/home/user/pic.png'), '/home/user');
  assert.equal(dirname('C:\\Users\\user\\pic.png'), 'C:\\Users\\user');
  assert.equal(dirname('pic.png'), '');
  assert.equal(dirname('/pic.png'), '/');
});

test('volumeRoot names drives, shares and the usual mounts, and nothing else', () => {
  assert.equal(volumeRoot('E:\\DCIM\\100CANON\\IMG_0001.JPG'), 'E:');
  assert.equal(volumeRoot('\\\\nas\\photos\\2024\\a.jpg'), '\\\\nas\\photos');
  assert.equal(volumeRoot('/media/stefan/EOS_DIGITAL/DCIM/a.jpg'), '/media/stefan/EOS_DIGITAL');
  assert.equal(volumeRoot('/run/media/stefan/stick/a.jpg'), '/run/media/stefan/stick');
  assert.equal(volumeRoot('/mnt/nas/photos/a.jpg'), '/mnt/nas');
  assert.equal(volumeRoot('/home/stefan/Pictures/a.jpg'), null);
});

test('urlForContent keys the URL by the hash and replaces an earlier key', () => {
  assert.equal(urlForContent('file:///a/b.png', 'abc'), 'file:///a/b.png?abc');
  assert.equal(urlForContent('file:///a/b.png?old', 'sampled-def'), 'file:///a/b.png?sampled-def');
});
