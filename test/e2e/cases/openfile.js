/* Paths macOS asks the app to open (dropped on the Dock icon, opened with the
 * app from Finder) go through the main process to the renderer and are added
 * like a drop. The OS event is emitted by hand, so this runs everywhere. */
const { app } = require('electron');

function emitOpenFile(filePath) {
  app.emit('open-file', { preventDefault() {} }, filePath);
}

module.exports = {
  name: 'openfile',
  async run({ js, check, waitFor, win, fixtures, expected, reloadRenderer }) {
    // a path that arrives while the page loads waits for it
    win.webContents.once('did-start-loading', () => emitOpenFile(fixtures[0]));
    await reloadRenderer();
    check(
      'a path opened while the page loads is added once it is up',
      await waitFor(async () => (await js('T.state.items.length')) === 1)
    );

    for (const fixture of fixtures) emitOpenFile(fixture);
    check(
      'opened paths are added like a drop',
      await waitFor(async () => (await js('T.state.items.length')) === expected)
    );
    await js('T.queueLibraryOperation(() => {})');
    const toast = await js('T.toastEl.textContent');
    check(
      'paths opened back to back are added as one batch',
      toast.startsWith(`added ${expected - 1} ·`),
      toast
    );
  }
};
