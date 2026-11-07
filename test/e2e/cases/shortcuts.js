/* Keyboard shortcuts and the toolbar controls they mirror. */
const { dialog } = require('electron');

module.exports = {
  name: 'shortcuts',
  async run({ js, check, waitFor }) {
    // the file dialog answers cancelled, so the shortcut runs to its end
    const showOpenDialog = dialog.showOpenDialog;
    let asked = false;
    dialog.showOpenDialog = async () => {
      asked = true;
      return { canceled: true, filePaths: [] };
    };
    let menu;
    try {
      menu = await js(`(() => {
        const button = document.getElementById('btn-files-menu');
        button.click();
        const open = T.openDropdownId() === 'files-menu';
        press('a');
        return { open, closed: T.openDropdownId() === null, focusFree: document.activeElement !== button };
      })()`);
      check('A asks for the file picker', await waitFor(() => asked));
    } finally {
      dialog.showOpenDialog = showOpenDialog;
    }
    check('A with the Files menu open closes it', menu.open && menu.closed);
    check('and leaves its button unfocused, so Space stays with auto-scroll', menu.focusFree);

    const sorted = await js(`(() => {
      const pressOn = (el, key) =>
        el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      const select = T.sortSelect;
      select.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      select.focus();
      pressOn(select, ' ');
      const released = document.activeElement !== select && T.autoScroll;
      T.setAutoScroll(false);
      select.focus();
      pressOn(select, ' ');
      const kept = document.activeElement === select && !T.autoScroll;
      select.blur();
      return { released, kept };
    })()`);
    check('a key after a pointer pick in the sort select goes to the shortcuts', sorted.released);
    check('a sort select focused by keyboard keeps its keys', sorted.kept);

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

    const named = await js(`({
      platform: window.api.platform,
      help: [...T.shortcutList.querySelectorAll('kbd')].map((kbd) => kbd.textContent),
      title: document.getElementById('btn-fullscreen').title,
      hint: document.getElementById('panel-hint').textContent
    })`);
    const fullscreenKey = process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11';
    const toggleKey = process.platform === 'darwin' ? 'cmd' : 'ctrl';
    const removeKey = process.platform === 'darwin' ? 'Del / Backspace' : 'Del';
    check('the renderer knows the platform', named.platform === process.platform, named.platform);
    check(
      "the help, the fullscreen button and the panel hint name this platform's keys",
      named.help.includes(`F / ${fullscreenKey}`) &&
        named.help.includes(removeKey) &&
        named.title.includes(fullscreenKey) &&
        named.hint.includes(`${toggleKey}: toggle`)
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
