/* Keyboard shortcuts and the toolbar controls they mirror. */
module.exports = {
  name: 'shortcuts',
  async run({ js, check }) {
    const speed = await js(`(() => {
      T.setScrollSpeed(80);
      press('.');
      const faster = T.scrollSpeed === 90;
      press(','); press(',');
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
      press(' ');
      const on = T.autoScroll;
      press(' ');
      return on && !T.autoScroll;
    })()`)
    );

    check(
      '-/+ change the column count',
      await js(`(() => {
      const before = T.columns;
      press('-');
      const minus = T.columns === Math.max(T.MIN_COLUMNS, before - 1);
      press('+');
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
