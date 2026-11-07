/* The application menu on macOS, as a template for Menu.buildFromTemplate.
 * Edit carries the standard roles, so Cmd+C, V, X and A work in every text
 * field; there is no View menu, so fullscreen and every other shortcut stay
 * with the renderer. The labels name the app explicitly because the roles
 * would take app.name, which comes from package.json's lowercase `name`. */
function buildMacMenuTemplate(appName) {
  return [
    {
      label: appName,
      submenu: [
        { role: 'about', label: `About ${appName}` },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${appName}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${appName}` }
      ]
    },
    { role: 'editMenu' },
    {
      role: 'window',
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ];
}

module.exports = { buildMacMenuTemplate };
