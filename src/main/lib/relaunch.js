/* Options for app.relaunch that start this app again with one more switch.
 * An AppImage runs from a mount the runtime removes when the process exits,
 * so the executable path would be gone by the time the relaunch starts; the
 * runtime names the image itself in APPIMAGE and that is what gets started. */
function buildRelaunchOptions(argv, appImagePath, extraSwitch) {
  const options = { args: argv.slice(1).concat(extraSwitch) };
  if (appImagePath) options.execPath = appImagePath;
  return options;
}

module.exports = { buildRelaunchOptions };
