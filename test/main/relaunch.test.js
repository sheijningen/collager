const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildRelaunchOptions } = require('../../src/main/lib/relaunch.js');

test('repeats the arguments after the executable and appends the switch', () => {
  const options = buildRelaunchOptions(['/opt/collager', '--foo', 'bar'], undefined, '--no-gpu');
  assert.deepEqual(options, { args: ['--foo', 'bar', '--no-gpu'] });
});

test('starts the AppImage itself instead of the mounted executable', () => {
  const options = buildRelaunchOptions(
    ['/tmp/.mount_x/collager'],
    '/home/me/Collager.AppImage',
    '--no-gpu'
  );
  assert.deepEqual(options, { execPath: '/home/me/Collager.AppImage', args: ['--no-gpu'] });
});

test('an empty APPIMAGE counts as not running from an AppImage', () => {
  assert.equal(buildRelaunchOptions(['/opt/collager'], '', '--no-gpu').execPath, undefined);
});
