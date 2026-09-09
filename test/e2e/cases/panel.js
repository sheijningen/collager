/* File panel: listing, sorting, selection shared with the collage, the
 * Escape ladder, batch remove. */
module.exports = {
  name: 'panel',
  async run({ js, check, readLibraryWhen, expected, loadFixtures }) {
    await loadFixtures();
    check('file panel lists every item', (await js('T.fileList.children.length')) === expected);

    // a render that changes nothing the list shows leaves its DOM alone, so an
    // open context menu stays anchored to its entry; a rebuild closes it
    const memo = await js(`(() => {
      const li = T.fileList.children[0];
      T.openCtxMenu(T.state.items[0], 10, 10, 'list');
      T.setColumns(T.columns + 1);
      T.render();
      return { sameNode: T.fileList.children[0] === li, menuOpen: !T.ctxMenu.hidden };
    })()`);
    check('an unrelated render keeps the list DOM', memo.sameNode);
    check('an unrelated render keeps the context menu open', memo.menuOpen);
    const menuClosedByRebuild = await js(
      `T.sortSelect.value = 'name'; T.sortSelect.dispatchEvent(new Event('change')); T.ctxMenu.hidden`
    );
    check('rebuilding the list closes the context menu', menuClosedByRebuild);
    const names = await js(
      `[...T.fileList.children].map(li => li.querySelector('.fname').textContent)`
    );
    check(
      'list sorts by name',
      JSON.stringify(names) === JSON.stringify(names.slice().sort((a, b) => a.localeCompare(b)))
    );

    await js(`T.fileList.children[0].click()`);
    await js(
      `T.fileList.children[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))`
    );
    check('shift-click selects a range', (await js('T.selected.size')) === 2);
    check(
      'selection shows on tiles',
      (await js(`document.querySelectorAll('.tile.selected').length`)) === 2
    );

    // the same selection can be built from the tiles, and shows in the list
    const fromTiles = await js(`(() => {
      const click = (hash, mods) =>
        T.tiles.get(hash).dispatchEvent(new MouseEvent('click', { bubbles: true, ...mods }));
      const [first, second] = T.state.items;
      click(first.hash, {});
      const one = T.selected.size === 1 && T.selected.has(first.hash);
      click(second.hash, { ctrlKey: true });
      const two = T.selected.size === 2 && T.selected.has(first.hash);
      const listed = document.querySelectorAll('#file-list li.selected').length;
      click(second.hash, { ctrlKey: true });
      const untoggled = T.selected.size === 1 && T.selected.has(first.hash);
      click(second.hash, {});
      const plainReplaces = T.selected.size === 1 && T.selected.has(second.hash);
      return { one, two, listed, untoggled, plainReplaces };
    })()`);
    check('clicking a tile selects it alone', fromTiles.one && fromTiles.plainReplaces);
    check('ctrl-click on a tile adds and removes it', fromTiles.two && fromTiles.untoggled);
    check('a tile selection shows in the file panel', fromTiles.listed === 2);

    await js(`T.selected.clear(); T.selected.add(T.state.items[0].hash);
      T.selected.add(T.state.items[1].hash); T.applySelection();`);

    // escape ladder: one layer per press
    const ladder = await js(`(async () => {
      T.openLightbox(T.state.items[0]);
      press('Escape');
      const lightboxOnly = T.lightbox.hidden && T.selected.size === 2;
      T.helpOverlay.hidden = false;
      press('Escape');
      const overlayOnly = T.helpOverlay.hidden && T.selected.size === 2;
      press('Escape');
      const selectionCleared = T.selected.size === 0;
      T.selected.add(T.state.items[0].hash); T.selected.add(T.state.items[1].hash); T.applySelection();
      return { lightboxOnly, overlayOnly, selectionCleared };
    })()`);
    check('Escape closes the lightbox and keeps the selection', ladder.lightboxOnly);
    check('Escape closes an overlay and keeps the selection', ladder.overlayOnly);
    check('Escape then clears the selection', ladder.selectionCleared);

    await js(`window.confirm = () => true; T.removeSelectedBtn.click(); void 0`);
    check(
      'batch remove removes the selection',
      (await js('T.state.items.length')) === expected - 2
    );
    check('selection is empty after removal', (await js('T.selected.size')) === 0);
    check('the removal is persisted', (await readLibraryWhen(expected - 2)) !== null);
  }
};
