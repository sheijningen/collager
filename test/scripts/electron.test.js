const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanEnvironment, SNAP_GTK_VARIABLES } = require('../../scripts/electron.js');

test('ELECTRON_RUN_AS_NODE is dropped, the rest stays', () => {
  const env = { ELECTRON_RUN_AS_NODE: '1', HOME: '/home/me', GTK_PATH: '/usr/lib/gtk-3.0' };
  assert.deepEqual(cleanEnvironment(env), { HOME: '/home/me', GTK_PATH: '/usr/lib/gtk-3.0' });
  assert.equal(env.ELECTRON_RUN_AS_NODE, '1', 'the given environment is left alone');
});

test('the GTK paths of a snap go, and XDG_DATA_DIRS gets its pre-snap value back', () => {
  const env = {
    HOME: '/home/me',
    GTK_MODULES: 'gail:atk-bridge',
    XDG_DATA_DIRS: '/home/me/snap/code/1/.local/share:/snap/code/1/usr/share:/usr/share',
    XDG_DATA_DIRS_VSCODE_SNAP_ORIG: '/usr/share'
  };
  for (const name of SNAP_GTK_VARIABLES) env[name] = `/snap/code/1/usr/${name}`;
  assert.deepEqual(cleanEnvironment(env), {
    HOME: '/home/me',
    GTK_MODULES: 'gail:atk-bridge',
    XDG_DATA_DIRS: '/usr/share',
    XDG_DATA_DIRS_VSCODE_SNAP_ORIG: '/usr/share'
  });
});

test('GTK paths outside a snap are kept', () => {
  const env = { GTK_PATH: '/usr/lib/gtk-3.0', GSETTINGS_SCHEMA_DIR: '/usr/share/glib-2.0/schemas' };
  assert.deepEqual(cleanEnvironment(env), env);
});
