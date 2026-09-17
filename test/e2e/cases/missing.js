/* Missing files: the explanatory tooltip, repair by re-adding, and the
 * clear-missing button. */
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

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

    const clearMissing = await js(`(() => {
      const btn = document.getElementById('btn-clear-missing');
      const hiddenWhenNoneMissing = btn.hidden;
      T.state.items[0].missing = true;
      T.state.items[1].missing = true;
      T.render();
      const visible = !btn.hidden && btn.textContent.includes('2');
      const liCoded = T.listEntries.get(T.state.items[0].hash).classList.contains('missing');
      return { hiddenWhenNoneMissing, visible, liCoded, before: T.state.items.length };
    })()`);
    check(
      'clear-missing button only shows while something is missing',
      clearMissing.hiddenWhenNoneMissing && clearMissing.visible
    );
    check('missing entries are color-coded in the panel', clearMissing.liCoded);

    // the question names the outcome; Keep is the second button
    let question = null;
    dialog.showMessageBox = async (_win, options) => {
      question = options;
      return { response: 1 };
    };
    await js('T.clearMissing()');
    check(
      'the question names what Remove would do',
      question !== null &&
        question.buttons[0] === 'Remove 2 missing files' &&
        question.buttons[1] === 'Keep'
    );
    check(
      'choosing Keep keeps everything',
      (await js('T.state.items.length')) === clearMissing.before
    );
    dialog.showMessageBox = async () => ({ response: 0 });
    await js('T.clearMissing()');
    const removed = await js(`({
      exact: T.state.items.length === ${clearMissing.before} - 2 && !T.state.items.some((i) => i.missing),
      hiddenAgain: document.getElementById('btn-clear-missing').hidden
    })`);
    check(
      'choosing Remove removes exactly the missing items',
      removed.exact && removed.hiddenAgain
    );
  }
};
