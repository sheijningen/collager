/* File panel: listing, sorting, selection shared with the collage, the
 * Escape ladder, batch remove. */
module.exports = {
  name: 'panel',
  async run({ js, check, readLibraryWhen, expected, loadFixtures }) {
    await loadFixtures();
    check('file panel lists every item', (await js('T.fileList.children.length')) === expected);
    await js(
      `T.sortSelect.value = 'name'; T.sortSelect.dispatchEvent(new Event('change')); void 0`
    );
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

    // escape ladder: one layer per press
    const ladder = await js(`(async () => {
      const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      T.openLightbox(T.state.items[0]);
      escape();
      const lightboxOnly = T.lightbox.hidden && T.selected.size === 2;
      T.helpOverlay.hidden = false;
      escape();
      const overlayOnly = T.helpOverlay.hidden && T.selected.size === 2;
      escape();
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
