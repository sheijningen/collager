/* Toolbar menus: the Files, Collage and Scroll dropdowns (anchoring, focus,
 * dismissal, actions closing versus settings staying open), the window
 * controls at the right edge, the Escape ladder, and the toolbar wrapping in
 * a narrow or short window. */
module.exports = {
  name: 'toolbar',
  async run({ js, check, win, loadFixtures }) {
    await loadFixtures();
    const menu = await js(`(() => {
      const trigger = document.getElementById('btn-collage-menu');
      const popup = document.getElementById('collage-menu');
      trigger.click();
      const anchor = trigger.getBoundingClientRect();
      const rect = popup.getBoundingClientRect();
      const opened = !popup.hidden && T.openDropdownId() === 'collage-menu';
      const anchored = rect.top >= anchor.bottom && Math.abs(rect.left - anchor.left) < 1;
      const onScreen = rect.right <= window.innerWidth && rect.left >= 0;
      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      const popupFocused = document.activeElement === popup;
      trigger.click();
      const toggledOff = popup.hidden && T.openDropdownId() === null;
      const focusReturned = document.activeElement === trigger;
      trigger.click();
      // focus events only fire while the window has OS focus, which a test run
      // cannot assume, so deliver what Tab would produce
      document.getElementById('btn-clear').dispatchEvent(new FocusEvent('focusout', {
        bubbles: true, relatedTarget: document.getElementById('btn-toolbar-toggle')
      }));
      const tabOutCloses = popup.hidden;
      trigger.click();
      T.scroller.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const outsideCloses = popup.hidden;
      trigger.click();
      const columnsBefore = T.columns;
      document.getElementById('btn-col-plus').click();
      const stepperKeepsOpen = !popup.hidden && T.columns === columnsBefore + 1;
      const countShown = document.getElementById('col-count').textContent === String(T.columns);
      document.getElementById('btn-col-minus').click();
      const steppedBack = !popup.hidden && T.columns === columnsBefore;
      const order = T.state.items.map((i) => i.hash).join();
      // a fixed draw makes the Fisher-Yates pass rotate the list, so the
      // order provably changes
      const random = Math.random;
      Math.random = () => 0;
      try {
        document.getElementById('btn-shuffle').click();
      } finally {
        Math.random = random;
      }
      const shuffleKeepsOpen = !popup.hidden && trigger.getAttribute('aria-expanded') === 'true';
      const shuffled = T.state.items.map((i) => i.hash).join() !== order;
      T.closeDropdown();
      return {
        opened, anchored, onScreen, expanded, popupFocused, toggledOff, focusReturned,
        tabOutCloses, outsideCloses, stepperKeepsOpen, countShown, steppedBack, shuffleKeepsOpen, shuffled
      };
    })()`);
    check('the Collage menu opens under its button', menu.opened && menu.anchored && menu.onScreen);
    check('the open menu is announced and focused', menu.expanded && menu.popupFocused);
    check('the menu button toggles the menu', menu.toggledOff && menu.focusReturned);
    check('moving focus out of the menu closes it', menu.tabOutCloses);
    check('a click outside closes the menu', menu.outsideCloses);
    check(
      'the column stepper changes the count and keeps the menu open',
      menu.stepperKeepsOpen && menu.countShown && menu.steppedBack
    );
    check(
      'shuffle re-orders the collage and keeps the menu open',
      menu.shuffleKeepsOpen && menu.shuffled
    );

    const files = await js(`(() => {
      const trigger = document.getElementById('btn-files-menu');
      const label = document.getElementById('panel-toggle-label');
      trigger.click();
      const opened = T.openDropdownId() === 'files-menu';
      const addShown = document.getElementById('btn-add').offsetParent !== null;
      const saysHide = T.panelOpen && label.textContent.includes('Hide');
      document.getElementById('btn-panel').click();
      const collapsed = !T.panelOpen && document.getElementById('panel').classList.contains('collapsed');
      const closed = T.openDropdownId() === null;
      const saysShow = label.textContent.includes('Show');
      T.setPanelOpen(true);
      return { opened, addShown, saysHide, collapsed, closed, saysShow };
    })()`);
    check('the Files menu holds the add action', files.opened && files.addShown);
    check(
      'the panel toggle in the Files menu collapses the panel and closes the menu',
      files.saysHide && files.collapsed && files.closed
    );
    check('the panel toggle label says what a click does', files.saysShow);

    const scrollMenu = await js(`(() => {
      const trigger = document.getElementById('btn-scroll-menu');
      const first = T.state.items[0].hash;
      T.selected.add(first);
      T.applySelection();
      trigger.click();
      const opened = T.openDropdownId() === 'scroll-menu';
      const sliderShown = T.speedSlider.offsetParent !== null;
      T.setScrollSpeed(120);
      const readout = document.getElementById('scroll-speed-value').textContent === '120 px/s';
      T.setScrollSpeed(80);
      const loop = document.getElementById('scroll-loop');
      loop.click();
      const settingKeepsOpen = T.openDropdownId() === 'scroll-menu';
      loop.click();
      const label = document.getElementById('autoscroll-label');
      const saysStart = label.textContent.includes('Start');
      // a mouse press focuses the item before the click lands, and a mouse
      // click carries a detail count; element.click() would look like keyboard
      // activation, which hands focus back to the menu button
      const startItem = document.getElementById('btn-autoscroll');
      startItem.focus();
      startItem.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      const started = T.autoScroll && T.openDropdownId() === null;
      const marked = trigger.classList.contains('active') &&
        !document.getElementById('scroll-state').hidden && label.textContent.includes('Stop');
      const focusDropped = document.activeElement !== trigger;
      press(' ');
      const spaceStops = !T.autoScroll && T.openDropdownId() === null;
      T.setAutoScroll(false);
      const unmarked = !trigger.classList.contains('active') &&
        document.getElementById('scroll-state').hidden;
      trigger.click();
      startItem.focus();
      startItem.click(); // keyboard activation: focus returns to the menu button
      const keyboardFocusReturns = document.activeElement === trigger;
      T.setAutoScroll(false);
      trigger.click();
      press('Escape');
      const escapeClosesMenuFirst = T.openDropdownId() === null && T.selected.has(first);
      press('Escape');
      const escapeThenClears = T.selected.size === 0;
      trigger.click();
      press('F1');
      const helpClosesMenu = T.openDropdownId() === null && !T.helpOverlay.hidden;
      T.closeOverlays();
      return {
        opened, sliderShown, readout, settingKeepsOpen, saysStart, started, marked, unmarked,
        focusDropped, spaceStops, keyboardFocusReturns, escapeClosesMenuFirst, escapeThenClears,
        helpClosesMenu
      };
    })()`);
    check(
      'the Scroll menu holds the auto-scroll settings',
      scrollMenu.opened && scrollMenu.sliderShown
    );
    check('the speed readout follows the setter', scrollMenu.readout);
    check('changing a setting keeps the menu open', scrollMenu.settingKeepsOpen);
    check(
      'starting auto-scroll from the menu closes it and marks the Scroll button',
      scrollMenu.saysStart && scrollMenu.started && scrollMenu.marked && scrollMenu.unmarked
    );
    check(
      'a mouse click on a menu item leaves no button focused, so Space still works',
      scrollMenu.focusDropped && scrollMenu.spaceStops
    );
    check(
      'keyboard activation of an item returns focus to the menu button',
      scrollMenu.keyboardFocusReturns
    );
    check(
      'Escape closes the menu before touching the selection',
      scrollMenu.escapeClosesMenuFirst && scrollMenu.escapeThenClears
    );
    check('opening the help overlay closes the menu', scrollMenu.helpClosesMenu);

    const rightEdge = await js(`(() => {
      const toggle = document.getElementById('btn-toolbar-toggle').getBoundingClientRect();
      const help = document.getElementById('btn-help').getBoundingClientRect();
      const fullscreen = document.getElementById('btn-fullscreen').getBoundingClientRect();
      const scroll = document.getElementById('btn-scroll-menu').getBoundingClientRect();
      return {
        ordered: scroll.right < fullscreen.left && fullscreen.right <= help.left && help.right <= toggle.left,
        nextToToggle: toggle.left - help.right < 20,
        aligned: Math.abs(help.top - toggle.top) < 1 && Math.abs(help.height - toggle.height) < 1
      };
    })()`);
    check(
      'fullscreen and help sit at the right edge next to the toolbar toggle',
      rightEdge.ordered && rightEdge.nextToToggle && rightEdge.aligned
    );

    // a narrow window wraps the toolbar instead of overflowing it; the
    // harness reset restores the window size afterwards
    win.setSize(400, 600);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const narrow = await js(`(() => {
      const toolbar = document.getElementById('toolbar');
      const bar = toolbar.getBoundingClientRect();
      const shown = [...toolbar.querySelectorAll('button, span')]
        .filter((el) => getComputedStyle(el).display !== 'none');
      const inside = shown.every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= window.innerWidth + 0.5;
      });
      const wrapped = bar.height > 48;
      const scrollerRect = T.scroller.getBoundingClientRect();
      const workspaceFits = scrollerRect.top >= bar.bottom - 0.5 && scrollerRect.bottom <= window.innerHeight + 0.5;
      const decorationsDropped = !shown.includes(document.getElementById('toolbar-hint')) &&
        !shown.includes(document.getElementById('item-count'));
      return { width: window.innerWidth, inside, wrapped, workspaceFits, decorationsDropped };
    })()`);
    check(
      'a narrow window keeps every toolbar control inside it',
      narrow.width <= 400 && narrow.inside
    );
    check(
      'the toolbar wrapped and the collage fills the rest of the window',
      narrow.wrapped && narrow.workspaceFits
    );
    check('the hint and item count make way first', narrow.decorationsDropped);

    // a window shorter than the settings popup gets a scrolling popup
    win.setSize(900, 120);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const short = await js(`(() => {
      document.getElementById('btn-scroll-menu').click();
      const popup = document.getElementById('scroll-menu');
      const rect = popup.getBoundingClientRect();
      const scrollable = popup.scrollHeight > popup.clientHeight;
      popup.scrollTop = popup.scrollHeight;
      const awake = document.getElementById('scroll-awake').getBoundingClientRect();
      const lastRowReachable =
        scrollable && awake.top >= rect.top - 0.5 && awake.bottom <= rect.bottom + 0.5;
      T.closeDropdown();
      return {
        height: window.innerHeight,
        onScreen: rect.top >= 0 && rect.bottom <= window.innerHeight,
        lastRowReachable
      };
    })()`);
    check(
      'a short window keeps the settings popup on screen',
      short.height <= 120 && short.onScreen && short.lastRowReachable
    );
  }
};
