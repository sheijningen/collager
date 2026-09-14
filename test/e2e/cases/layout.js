/* Masonry layout: measured dimensions and aspect ratios, one tile per item. */
module.exports = {
  name: 'layout',
  async run({ js, check, expected, loadFixtures }) {
    await loadFixtures();
    const layoutOk = await js(`(() => {
      const it = T.state.items.find(i => i.path.endsWith('tall.png'));
      const t = T.tiles.get(it.hash);
      const w = parseFloat(t.style.width), h = parseFloat(t.style.height);
      return it.w === 150 && it.h === 250 && Math.abs(h / w - 250 / 150) < 0.02;
    })()`);
    check('dimensions measured and aspect ratio preserved in layout', layoutOk);
    check(
      'all tiles laid out',
      (await js(`document.querySelectorAll('.tile').length`)) === expected
    );
  }
};
