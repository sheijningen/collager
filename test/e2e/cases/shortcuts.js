/* Keyboard shortcuts and the toolbar controls they mirror. */
module.exports = {
  name: 'shortcuts',
  async run({ js, check }) {
    const speed = await js(`(() => {
      const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      T.setScrollSpeed(80);
      key('.');
      const faster = T.scrollSpeed === 90;
      key(','); key(',');
      const slower = T.scrollSpeed === 70;
      const sliderSynced = parseInt(T.speedSlider.value, 10) === 70;
      T.setScrollSpeed(80);
      return { faster, slower, sliderSynced };
    })()`);
    check('"." raises the auto-scroll speed', speed.faster);
    check('"," lowers it and the slider follows', speed.slower && speed.sliderSynced);

    check(
      'Space toggles auto-scroll',
      await js(`(() => {
      const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      key(' ');
      const on = T.autoScroll;
      key(' ');
      return on && !T.autoScroll;
    })()`)
    );

    check(
      '-/+ change the column count',
      await js(`(() => {
      const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      const before = T.columns;
      key('-');
      const minus = T.columns === Math.max(T.MIN_COLUMNS, before - 1);
      key('+');
      return minus && T.columns === before;
    })()`)
    );

    check(
      'the column buttons step repeatedly',
      await js(`(() => {
      const before = T.columns;
      T.setColumns(3);
      document.getElementById('btn-col-plus').click();
      document.getElementById('btn-col-plus').click();
      const stepped = T.columns === 5;
      T.setColumns(before);
      return stepped;
    })()`)
    );
  }
};
