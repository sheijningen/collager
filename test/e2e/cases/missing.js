/* Missing files: the explanatory tooltip and the clear-missing button. */
module.exports = {
  name: 'missing',
  async run({ js, check, loadFixtures }) {
    await loadFixtures();
    const missingTip = await js(`(() => {
      const item = T.state.items[0];
      item.missing = true;
      const old = T.tiles.get(item.hash);
      T.observer.unobserve(old); T.dehydrate(old); old.remove(); T.tiles.delete(item.hash);
      T.render();
      const tile = T.tiles.get(item.hash);
      const tileHint = tile.classList.contains('missing') && tile.title.includes('external drive');
      const li = T.listEntries.get(item.hash);
      const listHint = li.title.includes(item.path) && li.title.includes('moved or renamed');
      item.missing = false;
      T.observer.unobserve(tile); tile.remove(); T.tiles.delete(item.hash);
      T.render();
      return tileHint && listHint;
    })()`);
    check('missing files explain themselves in a tooltip', missingTip);

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
