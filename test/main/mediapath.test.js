const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isMediaFile, existingMediaFolder } = require('../../src/main/lib/mediapath.js');

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collager-mediapath-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('accepts an existing regular file with a media extension', async (t) => {
  const dir = tmpDir(t);
  for (const name of ['pic.PNG', 'clip.mp4', 'anim.gif', 'photo.webp']) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, 'x');
    assert.equal(await isMediaFile(file), true, name);
  }
});

test('follows a symlink to a media file', async (t) => {
  const dir = tmpDir(t);
  const target = path.join(dir, 'real.jpg');
  fs.writeFileSync(target, 'x');
  const link = path.join(dir, 'link.jpg');
  try {
    fs.symlinkSync(target, link);
  } catch {
    t.skip('cannot create symlinks on this system');
    return;
  }
  assert.equal(await isMediaFile(link), true);
});

test('rejects non-strings and unsupported extensions', async (t) => {
  const dir = tmpDir(t);
  const script = path.join(dir, 'run.sh');
  fs.writeFileSync(script, 'echo');
  assert.equal(await isMediaFile(script), false);
  assert.equal(await isMediaFile(undefined), false);
  assert.equal(await isMediaFile(null), false);
  assert.equal(await isMediaFile(42), false);
  assert.equal(await isMediaFile(''), false);
});

test('rejects paths that do not exist or are not regular files', async (t) => {
  const dir = tmpDir(t);
  assert.equal(await isMediaFile(path.join(dir, 'gone.png')), false);
  const folder = path.join(dir, 'folder.png');
  fs.mkdirSync(folder);
  assert.equal(await isMediaFile(folder), false);
});

test('existingMediaFolder gives the folder of a media path whether or not the file exists', async (t) => {
  const dir = tmpDir(t);
  fs.writeFileSync(path.join(dir, 'here.png'), 'x');
  assert.equal(await existingMediaFolder(path.join(dir, 'here.png')), dir);
  assert.equal(await existingMediaFolder(path.join(dir, 'gone.mp4')), dir);
});

test('existingMediaFolder is null for non-media paths and missing folders', async (t) => {
  const dir = tmpDir(t);
  assert.equal(await existingMediaFolder(path.join(dir, 'notes.txt')), null);
  assert.equal(await existingMediaFolder(path.join(dir, 'nowhere', 'pic.png')), null);
  assert.equal(await existingMediaFolder(null), null);
  assert.equal(await existingMediaFolder(''), null);
  // a folder component that is a file, not a directory
  fs.writeFileSync(path.join(dir, 'file.sh'), 'echo');
  assert.equal(await existingMediaFolder(path.join(dir, 'file.sh', 'pic.png')), null);
});
