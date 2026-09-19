/* A file that fails to load is missing only when it is gone; one that is on
 * disk but cannot be decoded is unshowable, with its own tile and menu. */
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'unshowable',
  async run({ js, check, waitFor, workDir, fixtures }) {
    const broken = path.join(workDir, 'broken.png');
    fs.writeFileSync(broken, 'not a png at all');
    await js(`T.addPaths(${JSON.stringify([broken])})`);
    const flagged = await waitFor(() =>
      js(`(() => {
        const item = T.state.items.find((i) => i.path.endsWith('broken.png'));
        return item && item.unshowable === true;
      })()`)
    );
    check('a present file that cannot be decoded is flagged unshowable', flagged);
    const shown = await js(`(() => {
      const item = T.state.items.find((i) => i.path.endsWith('broken.png'));
      const tile = T.tiles.get(item.hash);
      const li = T.listEntries.get(item.hash);
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }));
      const byId = (id) => document.getElementById(id);
      const menu = {
        maximizeOff: byId('ctx-open').disabled,
        openExternalOn: !byId('ctx-open-external').disabled,
        copyImageOff: byId('ctx-copy-image').disabled,
        revealOn: !byId('ctx-reveal').disabled
      };
      T.closeCtxMenu();
      tile.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const lightboxStaysShut = T.lightbox.hidden;
      return {
        notMissing: !item.missing,
        tile: tile.classList.contains('unshowable') && !tile.classList.contains('missing'),
        label: tile.querySelector('.placeholder-label').textContent,
        hint: tile.title.includes('cannot show'),
        entry: li.classList.contains('unshowable') && li.title.includes('cannot show'),
        clearMissingHidden: byId('btn-clear-missing').hidden,
        menu,
        lightboxStaysShut
      };
    })()`);
    check('the tile and the panel entry say it cannot be shown', shown.tile && shown.entry);
    check('the label names the problem', shown.label === 'cannot be shown: broken.png');
    check('the hint explains it', shown.hint);
    check('it does not count as missing', shown.notMissing && shown.clearMissingHidden);
    check(
      'the menu keeps open in default app and show in folder',
      shown.menu.maximizeOff &&
        shown.menu.copyImageOff &&
        shown.menu.openExternalOn &&
        shown.menu.revealOn
    );
    check('double-click does not maximize it', shown.lightboxStaysShut);

    // re-adding the same content from another path gives it another go
    const brokenCopy = path.join(workDir, 'broken-copy.png');
    fs.copyFileSync(broken, brokenCopy);
    await js(`T.addPaths(${JSON.stringify([brokenCopy])})`);
    const retried = await waitFor(() =>
      js(`(() => {
        const item = T.state.items.find((i) => i.path.endsWith('broken-copy.png'));
        return item && item.unshowable === true && T.state.items.length === 1;
      })()`)
    );
    check('re-adding an unshowable file adopts the new path and tries again', retried);

    // a file deleted after startup still ends up missing, not unshowable. An
    // image would replay from Chromium's memory cache, so this needs the video
    const clip = fixtures.find((fixture) => fixture.endsWith('clip.mp4'));
    if (!clip) return;
    const gone = path.join(workDir, 'gone.mp4');
    fs.copyFileSync(clip, gone);
    await js(`T.addPaths(${JSON.stringify([gone])})`);
    const hydrated = await waitFor(() =>
      js(`(() => {
        const item = T.state.items.find((i) => i.path.endsWith('gone.mp4'));
        return item && T.tiles.get(item.hash).dataset.hydrated === '1';
      })()`)
    );
    check('the copied video shows first', hydrated);
    if (!hydrated) return;
    // the tile goes before the file: Windows refuses to delete a file the
    // video element still holds open, and the player lets go a moment after
    // the element is removed, hence the retries
    await js(`T.discardTile(T.state.items.find((i) => i.path.endsWith('gone.mp4')).hash)`);
    const deleted = await waitFor(() => {
      try {
        fs.unlinkSync(gone);
        return true;
      } catch {
        return false;
      }
    });
    check('the copied video can be deleted once its tile is gone', deleted);
    if (!deleted) return;
    await js('T.render()');
    const missing = await waitFor(() =>
      js(`(() => {
        const item = T.state.items.find((i) => i.path.endsWith('gone.mp4'));
        return item.missing === true && !item.unshowable
          && T.tiles.get(item.hash).classList.contains('missing');
      })()`)
    );
    check('a file that is gone is marked missing', missing);
  }
};
