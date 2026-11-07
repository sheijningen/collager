/* Sort collage by in the Collage menu: the submenu folds and unfolds, and its orders
 * reorder the collage and are saved. */
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'sort',
  async run({ js, check, waitFor, loadFixtures, libraryFile, workDir, expected, makePng }) {
    await loadFixtures();
    // first by name, last by path: the two orders must come out different
    const nested = path.join(workDir, 'sort', 'zzz', 'aaa.png');
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.writeFileSync(nested, makePng(50, 30, [250, 200, 40]));
    await js(`T.addPaths(${JSON.stringify([nested])})`);
    check(
      'a file in a folder sorting after the fixtures is added',
      await waitFor(() => js(`T.state.items.length === ${expected + 1}`))
    );
    const sorted = await js(`(() => {
      const hashes = () => T.state.items.map((item) => item.hash).join();
      const expected = (mode) => T.sortItems(T.state.items, mode).map((item) => item.hash).join();
      const submenu = document.getElementById('sort-menu');
      const pick = (mode) => {
        document.getElementById('btn-collage-menu').click();
        const foldedAtOpen = submenu.hidden;
        document.getElementById('btn-sort-by').click();
        const unfolded = !submenu.hidden && T.openDropdownId() === 'collage-menu';
        const wanted = expected(mode);
        document.querySelector('#sort-menu [data-sort=' + JSON.stringify(mode) + ']').click();
        return { foldedAtOpen, unfolded, closed: T.openDropdownId() === null, sorted: hashes() === wanted, order: wanted };
      };
      // the fixtures load in name order, so a reversed collage shows the sort
      T.state.items = T.state.items.slice().reverse();
      T.render();
      const reversed = hashes();
      const byName = pick('name');
      const changed = byName.order !== reversed;
      const byType = pick('type');
      const byPath = pick('path');
      return { byName, changed, byType, byPath };
    })()`);
    check('the Collage menu opens with Sort collage by folded', sorted.byName.foldedAtOpen);
    check('Sort collage by unfolds its orders and keeps the menu open', sorted.byName.unfolded);
    check(
      'Name reorders the collage by file name and closes the menu',
      sorted.changed && sorted.byName.sorted && sorted.byName.closed
    );
    check('the submenu is folded again the next time the menu opens', sorted.byType.foldedAtOpen);
    check(
      'Type and Path reorder the collage too, Path by the folder before the name',
      sorted.byType.sorted && sorted.byPath.sorted && sorted.byPath.order !== sorted.byName.order
    );
    check(
      'the new order is saved',
      await waitFor(() => {
        try {
          const saved = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
          return saved.map((item) => item.hash).join() === sorted.byPath.order;
        } catch {
          return false;
        }
      })
    );
  }
};
