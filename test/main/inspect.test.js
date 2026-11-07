const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { inspectMediaFile, nameFormat } = require('../../src/main/lib/inspect.js');
const { createTempDir, skipWithoutPermissionBits } = require('./helpers.js');

const tmpDir = (t) => createTempDir(t, 'inspect');

test('a file that is not there reports the stat error with its path', async (t) => {
  const gone = path.join(tmpDir(t), 'gone.png');
  const report = await inspectMediaFile(gone);
  assert.equal(report.present, false);
  assert.match(report.detail, /^ENOENT: no such file or directory/);
  assert.ok(report.detail.includes(gone));
});

test('a folder or a bad path is not a present file', async (t) => {
  const folder = path.join(tmpDir(t), 'folder.png');
  fs.mkdirSync(folder);
  assert.deepEqual(await inspectMediaFile(folder), {
    present: false,
    detail: 'not a regular file'
  });
  assert.deepEqual(await inspectMediaFile(''), { present: false, detail: 'not a media path' });
  assert.deepEqual(await inspectMediaFile(undefined), {
    present: false,
    detail: 'not a media path'
  });
});

test('a path without a media extension is not looked at, even when it exists', async (t) => {
  const notes = path.join(tmpDir(t), 'notes.txt');
  fs.writeFileSync(notes, 'secret');
  assert.deepEqual(await inspectMediaFile(notes), { present: false, detail: 'not a media path' });
});

test('a readable file reports its size and what its first bytes announce', async (t) => {
  const file = path.join(tmpDir(t), 'pic.png');
  fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]));
  assert.deepEqual(await inspectMediaFile(file), {
    present: true,
    detail: '11 bytes, starts with 89 50 4e 47 0d 0a 1a 0a (PNG)'
  });
});

test('a short file shows the bytes it has, an empty one says so', async (t) => {
  const dir = tmpDir(t);
  const short = path.join(dir, 'short.jpg');
  fs.writeFileSync(short, 'ab');
  assert.equal((await inspectMediaFile(short)).detail, '2 bytes, starts with 61 62 (text)');
  const empty = path.join(dir, 'empty.jpg');
  fs.writeFileSync(empty, '');
  assert.deepEqual(await inspectMediaFile(empty), { present: true, detail: 'empty file' });
});

test('a file that cannot be read is present with the read error', async (t) => {
  if (skipWithoutPermissionBits(t)) return;
  const file = path.join(tmpDir(t), 'locked.png');
  fs.writeFileSync(file, 'x');
  fs.chmodSync(file, 0o000);
  const report = await inspectMediaFile(file);
  assert.equal(report.present, true);
  assert.match(report.detail, /^EACCES: permission denied/);
});

const bytes = (...values) => Buffer.from(values);
const text = (value) => Buffer.from(value, 'latin1');

test('nameFormat names the media formats and their look-alikes', () => {
  assert.equal(nameFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'PNG');
  assert.equal(nameFormat(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)), 'JPEG');
  assert.equal(nameFormat(text('GIF89a\x01\x00')), 'GIF');
  assert.equal(nameFormat(text('RIFF\x00\x00\x00\x00WEBPVP8 ')), 'RIFF WEBP');
  assert.equal(nameFormat(text('RIFF\x00\x00\x00\x00AVI LIST')), 'RIFF AVI');
  assert.equal(nameFormat(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x01)), 'Matroska or WebM');
  assert.equal(nameFormat(text('\x00\x00\x00\x18ftypisom')), 'ftyp isom, MP4 family');
  assert.equal(nameFormat(text('\x00\x00\x00\x18ftypheic')), 'ftyp heic, HEIF');
  assert.equal(nameFormat(text('\x00\x00\x00\x18ftypavif')), 'ftyp avif, AVIF');
  assert.equal(nameFormat(text('\x00\x00\x00\x14ftypqt  ')), 'ftyp qt, QuickTime');
  assert.equal(nameFormat(text('<!DOCTYPE html>')), 'HTML');
  assert.equal(nameFormat(text('<svg xmlns="h')), 'SVG');
  assert.equal(nameFormat(text('<!DOCTYPE svg PUBLIC')), 'SVG');
  assert.equal(nameFormat(text('%PDF-1.7\n')), 'PDF');
});

test('nameFormat falls back to text or to no signature', () => {
  assert.equal(nameFormat(text('not a png at all')), 'text');
  assert.equal(nameFormat(bytes(0x00, 0x01, 0x02, 0x03)), 'no known media signature');
  assert.equal(nameFormat(bytes()), 'no known media signature');
  // a truncated ftyp box has no brand to name
  assert.equal(nameFormat(text('\x00\x00\x00\x18ftyp')), 'no known media signature');
});
