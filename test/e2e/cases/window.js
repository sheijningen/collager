/* Window channels exposed on window.api, fullscreen state and keep-awake, and
 * the bounds the main process remembers for the next start. */
const { powerSaveBlocker } = require('electron');
const fs = require('fs');
const path = require('path');

/* Blocker ids count up from 0 in this process, so scanning a small range
 * covers every blocker the app can have started. */
const anyBlockerStarted = () =>
  Array.from({ length: 32 }, (_, id) => id).some((id) => powerSaveBlocker.isStarted(id));

module.exports = {
  name: 'window',
  async run({ js, check, win, workDir, waitFor }) {
    check(
      'is-fullscreen answers over IPC',
      typeof (await js('window.api.isFullscreen()')) === 'boolean'
    );

    // the close handler runs on the event alone, so the window stays; the
    // state it writes follows the window manager's resize events, hence the wait
    const stateFile = path.join(workDir, 'userdata', 'window.json');
    const current = () =>
      JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() });
    let remembered = null;
    const written = await waitFor(() => {
      win.emit('close', { preventDefault() {} });
      try {
        remembered = fs.readFileSync(stateFile, 'utf8');
      } catch {
        return false;
      }
      return remembered === current();
    });
    check(
      'closing writes the normal bounds and the maximized state for the next start',
      written,
      `${remembered} vs ${current()}`
    );

    /* send() has no reply, but a later invoke() from the same renderer is
     * delivered after it, so once isFullscreen resolves the blocker has been
     * handled. */
    await js('window.api.setKeepAwake(true); window.api.isFullscreen()');
    check('keep-awake starts a power save blocker', anyBlockerStarted());
    await js('window.api.setKeepAwake(false); window.api.isFullscreen()');
    check('keep-awake off releases the blocker', !anyBlockerStarted());
  }
};
