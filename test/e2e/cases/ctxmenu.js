/* Item context menu on tiles: which actions it offers, how it narrows to
 * remove on a multi-selection, and that auto-scroll's last tick does not
 * close it. */
module.exports = {
  name: 'ctxmenu',
  async run({ js, check, win, waitFor, loadFixtures }) {
    await loadFixtures();

    /* The menu is dismissed by what moves its own anchor and nothing else, so
     * it knows which surface it was opened on. Each scroll is waited out
     * through waitFor: the scroll event is delivered asynchronously, and a
     * menu that stays open has to be judged after it would have arrived. */
    const CONTEXT_CLICK = `(element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: rect.x + 5, clientY: rect.y + 5 }));
    }`;
    const settled = () =>
      js(`new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`);

    // one column makes the collage taller than the window, so it can scroll
    await js(`T.setColumns(1); void 0`);
    await settled();
    check(
      'the collage scrolls at one column',
      await js(`T.scroller.scrollHeight > T.scroller.clientHeight`)
    );

    // a tile's menu goes when the collage scrolls under it
    check(
      'right-click on a tile opens the item menu',
      await js(`(${CONTEXT_CLICK})(T.tiles.get(T.state.items[0].hash)); !T.ctxMenu.hidden`)
    );
    await js(`T.scroller.scrollTop = 150; void 0`);
    check('a collage scroll closes a tile menu', await waitFor(() => js(`T.ctxMenu.hidden`)));

    // an entry sits still while the collage scrolls, so its menu stays
    await js(`T.scroller.scrollTop = 0; void 0`);
    await waitFor(() => js(`T.scroller.scrollTop === 0`));
    await settled();
    check(
      'right-clicking a panel entry opens the item menu',
      await js(`(${CONTEXT_CLICK})(T.fileList.children[0]);
        !T.ctxMenu.hidden && document.getElementById('ctx-path').textContent.length > 0`)
    );
    await js(`T.scroller.scrollTop = 150; void 0`);
    await waitFor(() => js(`T.scroller.scrollTop === 150`));
    await settled();
    check('a collage scroll leaves an entry menu open', await js(`!T.ctxMenu.hidden`));

    // a list scroll does close it. The fixtures never overflow the list on
    // their own, so it is squeezed for this check and let go again after.
    await js(
      `T.closeCtxMenu(); T.fileList.style.flex = 'none'; T.fileList.style.height = '40px'; void 0`
    );
    await settled();
    check(
      'the squeezed list scrolls',
      await js(`T.fileList.scrollHeight > T.fileList.clientHeight`)
    );
    const entryBeforeListScroll = await js(
      `(${CONTEXT_CLICK})(T.fileList.children[0]); T.fileList.scrollTop = 20; !T.ctxMenu.hidden`
    );
    check(
      'a list scroll closes an entry menu',
      entryBeforeListScroll && (await waitFor(() => js(`T.ctxMenu.hidden`)))
    );
    await js(
      `T.fileList.style.flex = ''; T.fileList.style.height = ''; T.fileList.scrollTop = 0; void 0`
    );

    // a rebuilt list (a sort change, panel open) leaves a tile menu alone
    const rebuilt = await js(`(() => {
      (${CONTEXT_CLICK})(T.tiles.get(T.state.items[0].hash));
      const opened = !T.ctxMenu.hidden;
      T.sortSelect.value = 'name'; T.sortSelect.dispatchEvent(new Event('change'));
      const stillOpen = !T.ctxMenu.hidden;
      T.closeCtxMenu();
      T.sortSelect.value = 'added'; T.sortSelect.dispatchEvent(new Event('change'));
      return { opened, stillOpen };
    })()`);
    check('a rebuilt list leaves a tile menu open', rebuilt.opened && rebuilt.stillOpen);

    // maximize from the menu shows the item enlarged
    const maximized = await js(`(() => {
      (${CONTEXT_CLICK})(T.tiles.get(T.state.items[0].hash));
      document.getElementById('ctx-open').click();
      const shown = !T.lightbox.hidden && T.ctxMenu.hidden;
      T.closeLightbox();
      return shown;
    })()`);
    check('maximize from the menu shows the item enlarged', maximized);

    // a re-laid-out collage does move tiles, so a tile's menu goes with it
    const collageWork = await js(`(() => {
      T.closeCtxMenu();
      (${CONTEXT_CLICK})(T.tiles.get(T.state.items[0].hash));
      const opened = !T.ctxMenu.hidden;
      T.render();
      return { opened, closedByRelayout: T.ctxMenu.hidden };
    })()`);
    check(
      'a re-laid-out collage closes a tile menu',
      collageWork.opened && collageWork.closedByRelayout
    );

    // work on the hidden list (a tile's media reporting its file gone calls
    // renderList directly) leaves a tile's menu alone
    await js(`T.scroller.scrollTop = 0; T.setPanelOpen(false); void 0`);
    await waitFor(() => js(`T.scroller.scrollTop === 0`));
    await settled();
    const listWork = await js(`(() => {
      (${CONTEXT_CLICK})(T.tiles.get(T.state.items[0].hash));
      const opened = !T.ctxMenu.hidden;
      T.renderList();
      return { opened, stillOpen: !T.ctxMenu.hidden };
    })()`);
    check('list work leaves a tile menu open', listWork.opened && listWork.stillOpen);
    await js(`T.closeCtxMenu(); T.setPanelOpen(true); T.setColumns(2); void 0`);
    await settled();

    const tileMenu = await js(`(async () => {
      const byId = (id) => document.getElementById(id);
      const rightClick = (tile) => {
        const rect = tile.getBoundingClientRect();
        tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
          clientX: rect.x + 10, clientY: rect.y + 10 }));
      };
      const item = T.state.items.find((i) => i.path.endsWith('square.png'));
      const tile = T.tiles.get(item.hash);
      rightClick(tile);
      const opened = !T.ctxMenu.hidden && byId('ctx-path').textContent === item.path;
      const copyImageShown = !byId('ctx-copy-image').hidden;
      const enabled = !byId('ctx-open').disabled && !byId('ctx-reveal').disabled;
      const singleLabel = byId('ctx-remove').textContent === 'Remove from collage';
      T.closeCtxMenu();

      // no bitmap copy for animated media
      const gif = T.state.items.find((i) => i.type === 'gif');
      rightClick(T.tiles.get(gif.hash));
      const copyImageHiddenForGif = byId('ctx-copy-image').hidden;
      T.closeCtxMenu();

      const singleActions = ['ctx-open', 'ctx-open-external', 'ctx-copy', 'ctx-copy-image',
        'ctx-reveal'];
      const singleMenuFor = (i) => singleActions.every((id) => !byId(id).hidden)
        && byId('ctx-path').textContent === i.path
        && byId('ctx-remove').textContent === 'Remove from collage';

      // a multi-selection containing the item leaves remove as the only action
      T.selected.clear(); T.selected.add(item.hash); T.selected.add(gif.hash); T.applySelection();
      rightClick(tile);
      const selectionLabel = byId('ctx-remove').textContent === 'Remove 2 selected';
      const selectionCount = byId('ctx-path').textContent === '2 items selected';
      const singleActionsHidden =
        singleActions.every((id) => byId(id).hidden) && !byId('ctx-remove').hidden;
      T.closeCtxMenu();

      // right-click does not change the selection, so an item outside it still
      // gets the whole single-item menu, acting on itself alone
      const outsider = T.state.items.find((i) => i.type === 'image' && i.hash !== item.hash);
      rightClick(T.tiles.get(outsider.hash));
      const outsiderSingle = singleMenuFor(outsider) && T.selected.size === 2;
      T.closeCtxMenu();

      // one selected item is not a multi-selection
      T.selected.clear(); T.selected.add(item.hash); T.applySelection();
      rightClick(tile);
      const loneSelectionSingle = singleMenuFor(item);
      T.closeCtxMenu();
      T.selected.clear(); T.applySelection();

      // missing items keep only the actions that don't need the file, plus
      // showing in the file manager, which falls back to the folder
      item.missing = true;
      rightClick(tile);
      const missingDisabled = byId('ctx-open').disabled && byId('ctx-open-external').disabled
        && byId('ctx-copy-image').disabled && !byId('ctx-copy').disabled;
      const missingKeepsReveal = !byId('ctx-reveal').disabled;
      T.closeCtxMenu();
      item.missing = false;

      // remove through the menu takes exactly the clicked item
      const before = T.state.items.length;
      rightClick(tile);
      byId('ctx-remove').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const removed = T.state.items.length === before - 1
        && !T.state.items.some((i) => i.hash === item.hash) && T.ctxMenu.hidden;

      // remove on a multi-selection takes every selected item, not just the
      // one the menu was opened on
      const pair = T.state.items.slice(0, 2);
      T.selected.clear(); for (const i of pair) T.selected.add(i.hash); T.applySelection();
      const beforePair = T.state.items.length;
      rightClick(T.tiles.get(pair[0].hash));
      byId('ctx-remove').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const pairRemoved = T.state.items.length === beforePair - 2
        && !T.state.items.some((i) => pair.some((p) => p.hash === i.hash))
        && T.selected.size === 0;

      return { opened, copyImageShown, copyImageHiddenForGif, enabled, singleLabel,
        selectionLabel, selectionCount, singleActionsHidden, outsiderSingle,
        loneSelectionSingle, missingDisabled, missingKeepsReveal, removed, pairRemoved };
    })()`);
    check('the menu opens on a tile with its actions live', tileMenu.opened && tileMenu.enabled);
    check(
      'copy image is offered for still images only',
      tileMenu.copyImageShown && tileMenu.copyImageHiddenForGif
    );
    check('remove label follows the selection', tileMenu.singleLabel && tileMenu.selectionLabel);
    check(
      'a multi-selection leaves remove as the only action, under a count',
      tileMenu.singleActionsHidden && tileMenu.selectionCount
    );
    check('an item outside the selection keeps the single-item menu', tileMenu.outsiderSingle);
    check('one selected item is not a multi-selection', tileMenu.loneSelectionSingle);
    check('missing items disable the file-based actions', tileMenu.missingDisabled);
    check('a missing item can still be shown in the file manager', tileMenu.missingKeepsReveal);

    /* A file whose folder is gone too has nothing to open, so the click has to
     * say so. The path points nowhere, so no file manager window opens. */
    const goneFolder = await js(`(async () => {
      const item = T.state.items[0];
      const realPath = item.path;
      item.path = '/collager-no-such-folder/gone.png';
      item.missing = true;
      T.openCtxMenu(item, 10, 10, 'tile');
      const enabled = !document.getElementById('ctx-reveal').disabled;
      document.getElementById('ctx-reveal').click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const toast = T.toastEl.hidden ? '' : T.toastEl.textContent;
      item.path = realPath;
      item.missing = false;
      return { enabled, toast };
    })()`);
    check(
      'a missing file whose folder is gone too reports it',
      goneFolder.enabled && /folder is gone as well/.test(goneFolder.toast)
    );
    check('remove from the menu removes the clicked item', tileMenu.removed);
    check('remove on a multi-selection removes all of it', tileMenu.pairRemoved);

    // the scroll event of auto-scroll's last tick is delivered after a real
    // right-click opened the menu and must not close it; a synthetic
    // contextmenu event cannot reproduce that ordering, so send real input.
    // The removals above left few items, so one column keeps the collage
    // taller than the window; the check is only worth anything if it scrolls.
    await js(`T.setColumns(1); T.scroller.scrollTop = 0; void 0`);
    await settled();
    check(
      'the collage scrolls for the auto-scroll checks',
      await js(`T.scroller.scrollHeight > T.scroller.clientHeight`)
    );
    // aim at the middle of the top tile's visible part, measured before the
    // collage starts moving: the tile drifts up during the round trip to main,
    // and a stalled frame can make that a jump, so an edge would be missed
    const topTile = await js(`(() => {
      const first = [...T.lastPositions.values()].sort((a, b) => a.y - b.y)[0];
      const rect = T.tiles.get(first.item.hash).getBoundingClientRect();
      const visible = Math.min(rect.bottom, window.innerHeight) - rect.y;
      T.setAutoScroll(true);
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + visible / 2) };
    })()`);
    for (const type of ['mouseDown', 'mouseUp']) {
      win.webContents.sendInputEvent({
        type,
        button: 'right',
        x: topTile.x,
        y: topTile.y,
        clickCount: 1
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    const tileMenuUnderAutoScroll = await js(`(async () => {
      const open = !T.ctxMenu.hidden;
      const atOpen = T.scroller.scrollTop;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const held = T.scroller.scrollTop === atOpen;
      T.closeCtxMenu();
      return { open, held };
    })()`);
    check('the menu survives auto-scroll running', tileMenuUnderAutoScroll.open);
    check('auto-scroll holds while a tile menu is up', tileMenuUnderAutoScroll.held);

    // a panel entry sits still while the collage moves, so its menu neither
    // stops auto-scroll nor gets closed by it
    const entryMenuUnderAutoScroll = await js(`(async () => {
      T.scroller.scrollTop = 0;
      (${CONTEXT_CLICK})(T.fileList.children[0]);
      const opened = !T.ctxMenu.hidden;
      await new Promise((resolve) => setTimeout(resolve, 300));
      const moved = T.scroller.scrollTop > 0;
      const stillOpen = !T.ctxMenu.hidden;
      T.closeCtxMenu();
      T.setAutoScroll(false);
      T.scroller.scrollTop = 0;
      T.setColumns(2);
      return { opened, moved, stillOpen };
    })()`);
    check(
      'auto-scroll runs on under a panel entry menu',
      entryMenuUnderAutoScroll.opened &&
        entryMenuUnderAutoScroll.moved &&
        entryMenuUnderAutoScroll.stillOpen
    );
  }
};
