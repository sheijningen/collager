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

    const clicked = await js(`(() => {
      // a real key press targets whatever has focus, which press() cannot do
      const pressOn = (el, key) =>
        el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      const mouseClick = (el) => {
        el.focus(); // what the browser does on the press itself
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      };
      const button = document.getElementById('btn-toolbar-toggle');
      mouseClick(button);
      const buttonBlurred = document.activeElement !== button;
      pressOn(document.activeElement, ' ');
      const scrollsAfterClick = T.autoScroll;
      T.setAutoScroll(false);
      T.setToolbarOpen(true);

      const box = document.getElementById('scroll-loop');
      mouseClick(box);
      const boxBlurred = document.activeElement !== box;
      mouseClick(box); // back to the setting the case started with

      button.focus();
      pressOn(button, ' ');
      const keyboardKeepsSpace = !T.autoScroll;
      button.blur();
      return { buttonBlurred, scrollsAfterClick, boxBlurred, keyboardKeepsSpace };
    })()`);
    check(
      'a clicked button hands Space back to auto-scroll',
      clicked.buttonBlurred && clicked.scrollsAfterClick
    );
    check('a clicked checkbox drops focus too', clicked.boxBlurred);
    check('a button focused by keyboard keeps Space for itself', clicked.keyboardKeepsSpace);

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
