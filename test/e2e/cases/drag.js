/* Drag-to-reorder tiles with a pointer: commit, threshold, click
 * suppression and abort. */
module.exports = {
  name: 'drag',
  async run({ js, check, loadFixtures }) {
    await loadFixtures();
    const dragged = await js(`(async () => {
      const before = T.state.items.map(i => i.hash);
      const from = T.tiles.get(before[0]).getBoundingClientRect();
      const to = T.tiles.get(before[1]).getBoundingClientRect();
      const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, button: 0, isPrimary: true });
      const fx = from.x + from.width / 2, fy = from.y + from.height / 2;
      const tx = to.x + to.width / 2, ty = to.y + to.height / 2;
      T.tiles.get(before[0]).dispatchEvent(new PointerEvent('pointerdown', opts(fx, fy)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(fx + 20, fy + 20)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(tx, ty)));
      window.dispatchEvent(new PointerEvent('pointerup', opts(tx, ty)));
      await new Promise(r => setTimeout(r, 100));
      const after = T.state.items.map(i => i.hash);
      return { moved: after.indexOf(before[0]) === 1 && after.indexOf(before[1]) === 0,
               nothingSelected: T.selected.size === 0 };
    })()`);
    check('drag reorders tiles', dragged.moved);
    check('drag does not select', dragged.nothingSelected);

    const dragEdge = await js(`(async () => {
      const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, button: 0, isPrimary: true });
      const hash = T.state.items[0].hash;
      const tile = () => T.tiles.get(hash);
      const r = tile().getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;

      // the click following a completed drag is suppressed
      const r2 = T.tiles.get(T.state.items[1].hash).getBoundingClientRect();
      tile().dispatchEvent(new PointerEvent('pointerdown', opts(cx, cy)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(r2.x + 10, r2.y + 10)));
      window.dispatchEvent(new PointerEvent('pointerup', opts(r2.x + 10, r2.y + 10)));
      tile().dispatchEvent(new MouseEvent('click', opts(r2.x + 10, r2.y + 10)));
      const suppressed = T.selected.size === 0;
      await new Promise(r => setTimeout(r, 50));

      // a sub-threshold press is still a normal click-select
      const r3 = tile().getBoundingClientRect();
      tile().dispatchEvent(new PointerEvent('pointerdown', opts(r3.x + 5, r3.y + 5)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(r3.x + 8, r3.y + 8)));
      window.dispatchEvent(new PointerEvent('pointerup', opts(r3.x + 8, r3.y + 8)));
      tile().dispatchEvent(new MouseEvent('click', opts(r3.x + 8, r3.y + 8)));
      const clickStillSelects = T.selected.size === 1;
      T.selected.clear(); T.applySelection();

      // pointercancel aborts: order unchanged, no ghost left behind
      const before = T.state.items.map(i => i.hash).join();
      const r4 = tile().getBoundingClientRect();
      tile().dispatchEvent(new PointerEvent('pointerdown', opts(r4.x + 10, r4.y + 10)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(r4.x + 60, r4.y + 60)));
      window.dispatchEvent(new PointerEvent('pointercancel', opts(r4.x + 60, r4.y + 60)));
      const aborted = T.state.items.map(i => i.hash).join() === before
        && !document.getElementById('drag-ghost');
      return { suppressed, clickStillSelects, aborted };
    })()`);
    check('click after drag is suppressed', dragEdge.suppressed);
    check('sub-threshold press still click-selects', dragEdge.clickStillSelects);
    check('pointercancel aborts cleanly (no ghost, order kept)', dragEdge.aborted);
  }
};
