/* Missing files: the explanatory tooltip, repair by re-adding, and the
 * clear-missing button. */
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'missing',
  async run({ js, check, workDir, fixtures, loadFixtures }) {
    await loadFixtures();
    const missingTip = await js(`(() => {
      const item = T.state.items[0];
      item.missing = true;
      T.discardTile(item.hash);
      T.render();
      const tile = T.tiles.get(item.hash);
      const tileHint = tile.classList.contains('missing') && tile.title.includes('external drive');
      const li = T.listEntries.get(item.hash);
      const listHint = li.title.includes(item.path) && li.title.includes('moved or renamed');
      item.missing = false;
      T.discardTile(item.hash);
      T.render();
      return tileHint && listHint;
    })()`);
    check('missing files explain themselves in a tooltip', missingTip);

    // re-adding the same content from a new path repairs the entry, and the
    // panel entry follows the new name
    const movedDir = path.join(workDir, 'moved');
    fs.mkdirSync(movedDir, { recursive: true });
    const movedPath = path.join(movedDir, 'tall-moved.png');
    fs.copyFileSync(
      fixtures.find((fixture) => fixture.endsWith('tall.png')),
      movedPath
    );
    const repaired = await js(`(async () => {
      const item = T.state.items.find((i) => i.path.endsWith('tall.png'));
      item.missing = true;
      T.render();
      await T.addPaths(${JSON.stringify([movedPath])});
      const li = T.listEntries.get(item.hash);
      return !item.missing && item.path === ${JSON.stringify(movedPath)}
        && li.querySelector('.fname').textContent === 'tall-moved.png' && li.title === item.path;
    })()`);
    check('re-adding repairs a missing entry and renames its panel entry', repaired);

    const clearMissing = await js(`(async () => {
      const btn = document.getElementById('btn-clear-missing');
      const hiddenWhenNoneMissing = btn.hidden;
      T.state.items[0].missing = true;
      T.state.items[1].missing = true;
      T.render();
      const visible = !btn.hidden && btn.textContent.includes('2');
      const liCoded = T.listEntries.get(T.state.items[0].hash).classList.contains('missing');
      const before = T.state.items.length;
      window.confirm = () => false;
      btn.click();
      const cancelKeeps = T.state.items.length === before;
      window.confirm = () => true;
      btn.click();
      await new Promise((r) => setTimeout(r, 100));
      return {
        hiddenWhenNoneMissing, visible, liCoded, cancelKeeps,
        removed: T.state.items.length === before - 2 && !T.state.items.some((i) => i.missing),
        hiddenAgain: btn.hidden
      };
    })()`);
    check(
      'clear-missing button only shows while something is missing',
      clearMissing.hiddenWhenNoneMissing && clearMissing.visible
    );
    check('missing entries are color-coded in the panel', clearMissing.liCoded);
    check('cancelling the confirmation keeps everything', clearMissing.cancelKeeps);
    check(
      'confirming removes exactly the missing items',
      clearMissing.removed && clearMissing.hiddenAgain
    );
  }
};
