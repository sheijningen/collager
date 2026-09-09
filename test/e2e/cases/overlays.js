/* Help and about overlays. */
const pkg = require('../../../package.json');

module.exports = {
  name: 'overlays',
  async run({ js, check, waitFor }) {
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }))`);
    check('F1 opens the shortcuts overlay', await js('!T.helpOverlay.hidden'));
    check(
      'the overlay lists every binding',
      await js(`T.shortcutList.querySelectorAll('tr').length === T.SHORTCUTS.length`)
    );
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    check('Escape closes the overlay', await js('T.helpOverlay.hidden'));

    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))`);
    // the about data arrives over IPC
    await waitFor(() => js(`document.getElementById('about-version').textContent !== ''`), 5000);
    const aboutOk = await js(`(() => ({
      open: !T.aboutOverlay.hidden,
      name: document.getElementById('about-name').textContent,
      version: document.getElementById('about-version').textContent
    }))()`);
    check(
      'about shows package.json metadata',
      aboutOk.open &&
        aboutOk.name === ((pkg.build && pkg.build.productName) || pkg.name) &&
        aboutOk.version === `version ${pkg.version}`
    );
    await js('T.closeOverlays(); void 0');
  }
};
