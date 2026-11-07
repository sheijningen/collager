/* Starts Electron with the given arguments from a terminal that may belong to
 * an editor. VS Code exports ELECTRON_RUN_AS_NODE, which makes the Electron
 * binary run as plain Node, and its snap exports the paths of its own GTK
 * modules, GSettings schemas and locales, with which Chromium's GTK
 * integration fails and the window comes up without a title bar. Both are
 * dropped from the environment Electron gets. */

// what the VS Code snap exports for its own GTK; it keeps the XDG_DATA_DIRS
// it found under XDG_DATA_DIRS_VSCODE_SNAP_ORIG
const SNAP_GTK_VARIABLES = [
  'GTK_PATH',
  'GTK_EXE_PREFIX',
  'GTK_IM_MODULE_FILE',
  'GSETTINGS_SCHEMA_DIR',
  'GDK_PIXBUF_MODULE_FILE',
  'GDK_PIXBUF_MODULEDIR',
  'GIO_MODULE_DIR',
  'LOCPATH'
];

/* The environment to start Electron with: `env` without ELECTRON_RUN_AS_NODE,
 * and without the GTK paths of a snap when any of them points into one. */
function cleanEnvironment(env) {
  const cleaned = { ...env };
  delete cleaned.ELECTRON_RUN_AS_NODE;
  const fromSnap = SNAP_GTK_VARIABLES.some((name) => (cleaned[name] || '').includes('/snap/'));
  if (!fromSnap) return cleaned;
  for (const name of SNAP_GTK_VARIABLES) delete cleaned[name];
  if (cleaned.XDG_DATA_DIRS_VSCODE_SNAP_ORIG) {
    cleaned.XDG_DATA_DIRS = cleaned.XDG_DATA_DIRS_VSCODE_SNAP_ORIG;
  }
  return cleaned;
}

if (require.main === module) {
  const cleaned = cleanEnvironment(process.env);
  for (const name of Object.keys(process.env)) {
    if (!(name in cleaned)) delete process.env[name];
  }
  Object.assign(process.env, cleaned);
  // Electron's own launcher, which forwards termination signals to the binary
  require('electron/cli.js');
}

module.exports = { cleanEnvironment, SNAP_GTK_VARIABLES };
