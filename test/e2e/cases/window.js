/* Window channels exposed on window.api: fullscreen state and keep-awake. */
const { powerSaveBlocker } = require('electron');

/* Blocker ids count up from 0 in this process, so scanning a small range
 * covers every blocker the app can have started. */
const anyBlockerStarted = () =>
  Array.from({ length: 32 }, (_, id) => id).some((id) => powerSaveBlocker.isStarted(id));

module.exports = {
  name: 'window',
  async run({ js, check }) {
    check(
      'is-fullscreen answers over IPC',
      typeof (await js('window.api.isFullscreen()')) === 'boolean'
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
