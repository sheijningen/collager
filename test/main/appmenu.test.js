const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildMacMenuTemplate } = require('../../src/main/lib/appmenu.js');

/* Every role in the template, submenus included. */
function collectRoles(items) {
  return items.flatMap((item) => [item.role, ...collectRoles(item.submenu ?? [])]).filter(Boolean);
}

test('the app menu names the app and can hide and quit it', () => {
  const [appMenu] = buildMacMenuTemplate('Collager');
  assert.equal(appMenu.label, 'Collager');
  const roles = collectRoles(appMenu.submenu);
  for (const role of ['about', 'hide', 'quit']) assert.ok(roles.includes(role), role);
  const quit = appMenu.submenu.find((item) => item.role === 'quit');
  assert.equal(quit.label, 'Quit Collager');
});

test('Edit and Window are there, Window with minimize, zoom, close and front', () => {
  const template = buildMacMenuTemplate('Collager');
  assert.ok(template.some((item) => item.role === 'editMenu'));
  const windowMenu = template.find((item) => item.role === 'window');
  assert.deepEqual(collectRoles(windowMenu.submenu), ['minimize', 'zoom', 'close', 'front']);
});

test('nothing in the menu binds fullscreen, reload or devtools', () => {
  const roles = collectRoles(buildMacMenuTemplate('Collager'));
  for (const role of ['viewMenu', 'togglefullscreen', 'reload', 'forceReload', 'toggleDevTools']) {
    assert.ok(!roles.includes(role), role);
  }
});
