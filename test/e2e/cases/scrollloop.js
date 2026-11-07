/* Auto-scroll with restart on runs into clone tiles below the end and wraps
 * to the top without a jump; a collage that fits the window gets no clones. */
const fs = require('fs');
const path = require('path');

const LOOP_IMAGES = 14;

/* Hashes of the clone tiles in packing order: a later tile never sits
 * higher, and of two on one line the left one came first. */
const CLONE_ORDER = `() => [...T.cloneTiles]
  .map(([hash, tile]) => ({ hash, rect: tile.getBoundingClientRect() }))
  .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
  .map((entry) => entry.hash)`;

module.exports = {
  name: 'scrollloop',
  async run({ js, check, waitFor, workDir, fixtures, makePng, libraryFile }) {
    const square = fixtures.find((file) => file.endsWith('square.png'));
    await js(`T.addPaths(${JSON.stringify([square])})`);
    await waitFor(() => js('T.state.items.length === 1'));
    const short = await js(`(async () => {
      const fits = T.scroller.scrollHeight <= T.scroller.clientHeight;
      T.setScrollSpeed(T.MAX_SCROLL_SPEED);
      T.setAutoScroll(true);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const result = {
        fits,
        noClones: T.cloneTiles.size === 0 && T.wrapHeight === 0,
        stayed: T.scroller.scrollTop === 0,
        running: T.autoScroll
      };
      T.setAutoScroll(false);
      return result;
    })()`);
    check(
      'a collage that fits the window gets no clones and stays put while auto-scroll runs',
      short.fits && short.noClones && short.stayed && short.running
    );

    const loopDir = path.join(workDir, 'loop');
    fs.mkdirSync(loopDir, { recursive: true });
    const paths = [];
    for (let index = 0; index < LOOP_IMAGES; index++) {
      const file = path.join(loopDir, `loop-${index}.png`);
      fs.writeFileSync(
        file,
        makePng(120 + (index % 3) * 40, 160, [index * 15, 90, 200 - index * 10])
      );
      paths.push(file);
    }
    await js(`T.addPaths(${JSON.stringify(paths)})`);
    const loaded = await waitFor(() => js(`T.state.items.length === ${LOOP_IMAGES + 1}`));
    check('the loop images load', loaded);

    const started = await js(`(() => {
      const tall = T.scroller.scrollHeight > T.scroller.clientHeight;
      const noClonesWhileStopped = T.cloneTiles.size === 0;
      const box = document.getElementById('scroll-shuffle');
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      T.setAutoScroll(true);
      const realCount = T.tiles.size;
      const domClones = document.querySelectorAll('.tile.clone').length;
      return {
        tall,
        noClonesWhileStopped,
        clones: T.cloneTiles.size,
        domClones,
        realCount,
        lastPositionsReal: T.lastPositions.size === realCount,
        wrapHeight: T.wrapHeight,
        reachable: T.scroller.scrollHeight - T.scroller.clientHeight >= T.wrapHeight
      };
    })()`);
    check(
      'the collage is taller than the window and has no clones while stopped',
      started.tall && started.noClonesWhileStopped
    );
    check(
      'starting auto-scroll with restart on builds clone tiles below the end',
      started.clones > 0 &&
        started.domClones === started.clones &&
        started.realCount === LOOP_IMAGES + 1 &&
        started.lastPositionsReal &&
        started.wrapHeight > 0 &&
        started.reachable,
      JSON.stringify(started)
    );

    const handlers = await js(`(() => {
      const [hash, clone] = [...T.cloneTiles][0];
      const rect = clone.getBoundingClientRect();
      const opts = { bubbles: true, clientX: rect.x + 5, clientY: rect.y + 5, button: 0, isPrimary: true };
      clone.dispatchEvent(new PointerEvent('pointerdown', opts));
      const noDrag = T.tileDrag === null;
      clone.dispatchEvent(new MouseEvent('click', opts));
      const selects = T.selected.has(hash) && T.selected.size === 1;
      const bothMarked = clone.classList.contains('selected') &&
        T.tiles.get(hash).classList.contains('selected');
      T.selected.clear();
      T.state.selectionAnchor = null;
      T.applySelection();
      return { noDrag, selects, bothMarked };
    })()`);
    check('a press on a clone starts no drag', handlers.noDrag);
    check(
      'a click on a clone selects its item and marks the clone and the real tile',
      handlers.selects && handlers.bothMarked
    );

    // a sampler on every frame catches the frame the wrap lands on; the jump
    // to just short of the wrap is a manual scroll, which the tick adopts
    await js(`(() => {
      const cloneOrder = ${CLONE_ORDER};
      const loop = { samples: [], wrapped: null, before: T.state.items.map((item) => item.hash) };
      window.__loop = loop;
      const sample = () => {
        if (loop.wrapped) return;
        const top = T.scroller.scrollTop;
        const previous = loop.samples[loop.samples.length - 1];
        if (previous !== undefined && top < previous - 1) {
          loop.wrapped = {
            previous,
            top,
            wrapHeight: loop.wrapHeight,
            cloneOrder: loop.cloneOrder,
            handedCount: loop.cloneMedia.size,
            handedOver: [...loop.cloneMedia].every(([hash, media]) =>
              T.tiles.get(hash).contains(media)),
            order: T.state.items.map((item) => item.hash),
            running: T.autoScroll,
            clonesAfter: T.cloneTiles.size
          };
          return;
        }
        loop.samples.push(top);
        loop.wrapHeight = T.wrapHeight;
        loop.cloneOrder = cloneOrder();
        loop.cloneMedia = new Map();
        for (const [hash, tile] of T.cloneTiles) {
          const media = tile.querySelector('img, video');
          if (media) loop.cloneMedia.set(hash, media);
        }
        requestAnimationFrame(sample);
      };
      T.scroller.scrollTop = T.wrapHeight - 400;
      requestAnimationFrame(sample);
    })()`);
    const wrapped = await waitFor(() => js('window.__loop.wrapped !== null'), 8000);
    check('auto-scroll runs on past the end into the clones and wraps', wrapped);
    const wrap = wrapped ? await js('window.__loop.wrapped') : null;
    const before = await js('window.__loop.before');
    if (wrap) {
      // one tick of at most 0.1 s at 600 px/s, and scrollTop rounds
      const drop = wrap.top - (wrap.previous - wrap.wrapHeight);
      check(
        'the wrap scrolls up by exactly the wrap height plus one step',
        drop >= -2 && drop <= 62,
        JSON.stringify({ drop, ...wrap, order: undefined, cloneOrder: undefined })
      );
      check('auto-scroll is still on after the wrap', wrap.running);
      check('the wrap builds clones for the loop after', wrap.clonesAfter > 0);
      check(
        'the clones hand their loaded media to the real tiles',
        wrap.handedCount > 0 && wrap.handedOver
      );
      check(
        'with shuffle on the order after the wrap is new and is the order the clones showed',
        wrap.order.join() !== before.join() &&
          wrap.order.slice(0, wrap.cloneOrder.length).join() === wrap.cloneOrder.join(),
        JSON.stringify({ clones: wrap.cloneOrder.length })
      );
    }
    const continued = await js(`(async () => {
      const at = T.scroller.scrollTop;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return T.autoScroll && T.scroller.scrollTop > at;
    })()`);
    check('scrolling carries on from the top after the wrap', continued);

    // once stopped nothing wraps or reshuffles, so the order holds still while
    // the saved file catches up with it
    const stopped = await js(`(() => {
      T.setAutoScroll(false);
      return {
        clones: T.cloneTiles.size,
        domClones: document.querySelectorAll('.tile.clone').length,
        wrapHeight: T.wrapHeight,
        order: T.state.items.map((item) => item.hash).join()
      };
    })()`);
    check(
      'stopping auto-scroll removes the clones',
      stopped.clones === 0 && stopped.domClones === 0 && stopped.wrapHeight === 0
    );
    if (wrap) check('stopping keeps the order the wrap set', stopped.order === wrap.order.join());
    check(
      'the new order is saved',
      await waitFor(() => {
        try {
          const saved = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
          return saved.map((item) => item.hash).join() === stopped.order;
        } catch {
          return false;
        }
      }, 3000)
    );

    // stopped with the clones on screen, the real tiles take over in place
    const stoppedInClones = await js(`(() => {
      T.setAutoScroll(true);
      T.scroller.scrollTop = T.wrapHeight + 100;
      const order = (${CLONE_ORDER})();
      const first = order[0];
      const cloneTop = T.cloneTiles.get(first).getBoundingClientRect().top;
      T.setAutoScroll(false);
      const realTop = T.tiles.get(first).getBoundingClientRect().top;
      const items = T.state.items.map((item) => item.hash);
      return {
        samePlace: Math.abs(realTop - cloneTop) <= 1,
        clonesGone: T.cloneTiles.size === 0,
        orderTaken: items.slice(0, order.length).join() === order.join(),
        cloneTop,
        realTop
      };
    })()`);
    check(
      'stopping inside the clone region keeps the picture, shown by the real tiles',
      stoppedInClones.samePlace && stoppedInClones.clonesGone && stoppedInClones.orderTaken,
      JSON.stringify(stoppedInClones)
    );

    // stopped with clones only partly on screen, the region lingers until the
    // viewport leaves it, so nothing moves
    const lingered = await js(`(() => {
      T.setAutoScroll(true);
      T.scroller.scrollTop = Math.round(T.wrapHeight - T.scroller.clientHeight / 2);
      const at = T.scroller.scrollTop;
      const clones = [...T.cloneTiles.values()];
      const tops = clones.map((tile) => tile.getBoundingClientRect().top);
      const order = T.state.items.map((item) => item.hash).join();
      window.__linger = () =>
        T.scroller.scrollTop === at &&
        T.cloneTiles.size === clones.length &&
        clones.every((tile, index) =>
          T.cloneTiles.get(tile.dataset.hash) === tile &&
          tile.getBoundingClientRect().top === tops[index]) &&
        T.state.items.map((item) => item.hash).join() === order;
      T.setAutoScroll(false);
      const keptOnStop = window.__linger();
      const wrapHeight = T.wrapHeight;
      T.setAutoScroll(true);
      const takenOver = T.autoScroll && T.wrapHeight === wrapHeight && window.__linger();
      const loop = document.getElementById('scroll-loop');
      loop.checked = false;
      loop.dispatchEvent(new Event('change'));
      return { clones: clones.length, keptOnStop, takenOver };
    })()`);
    check(
      'stopping with clones partly on screen keeps the scroll position and the clones',
      lingered.clones > 0 && lingered.keptOnStop,
      JSON.stringify(lingered)
    );
    check('starting again takes the lingering clones over', lingered.takenOver);
    const restartOffStops =
      (await waitFor(() => js('!T.autoScroll'))) && (await js('window.__linger()'));
    check(
      'turning restart off with clones partly on screen stops auto-scroll and keeps them',
      restartOffStops
    );
    await js('T.setAutoScroll(true)');
    const startWithRestartOff =
      (await waitFor(() => js('!T.autoScroll'))) && (await js('window.__linger()'));
    check(
      'starting with restart off over lingering clones stops at once, without a wrap',
      startWithRestartOff
    );
    await js(`(() => {
      const loop = document.getElementById('scroll-loop');
      loop.checked = true;
      loop.dispatchEvent(new Event('change'));
      T.scroller.scrollTop = 0;
    })()`);
    check(
      'lingering clones go once the viewport leaves them',
      await waitFor(() => js('T.cloneTiles.size === 0 && T.wrapHeight === 0'))
    );

    // scrolled on past wrapHeight while the clones linger, the real tiles take
    // over in place
    const pastWrap = await js(`(() => {
      T.setAutoScroll(true);
      T.scroller.scrollTop = Math.round(T.wrapHeight - T.scroller.clientHeight / 2);
      T.setAutoScroll(false);
      const first = (${CLONE_ORDER})()[0];
      T.scroller.scrollTop = T.wrapHeight + 50;
      return { first, cloneTop: T.cloneTiles.get(first).getBoundingClientRect().top };
    })()`);
    check(
      'scrolling on past the lingering clones wraps and keeps the picture',
      await waitFor(() =>
        js(`T.cloneTiles.size === 0 && !T.autoScroll &&
          Math.abs(T.tiles.get(${JSON.stringify(pastWrap.first)}).getBoundingClientRect().top -
            ${pastWrap.cloneTop}) <= 1`)
      ),
      JSON.stringify(pastWrap)
    );

    // a collage not much taller than the window keeps clones within the
    // hydration margin through the wrap, and they must load again after it
    const nearlyFits = await js(`(() => {
      T.setAutoScroll(true);
      const fitsMargin = () =>
        T.wrapHeight > 0 && T.wrapHeight < T.scroller.clientHeight + T.HYDRATE_MARGIN;
      for (let count = T.MAX_COLUMNS; count >= T.MIN_COLUMNS && !fitsMargin(); count--) {
        T.setColumns(count);
      }
      const start = T.wrapHeight - 30;
      T.scroller.scrollTop = start;
      return { found: fitsMargin(), start };
    })()`);
    check('some column count leaves the collage within the margin', nearlyFits.found);
    const wrappedAgain = await waitFor(() => js(`T.scroller.scrollTop < ${nearlyFits.start}`));
    const reloaded = await waitFor(() =>
      js(`(() => {
        const inRange = [...T.cloneTiles.values()].filter((tile) => {
          const rect = tile.getBoundingClientRect();
          return rect.top < window.innerHeight + T.HYDRATE_MARGIN && rect.bottom > -T.HYDRATE_MARGIN;
        });
        return inRange.length > 0 && inRange.every((tile) => tile.querySelector('img, video'));
      })()`)
    );
    await js('T.setAutoScroll(false)');
    check('clones still in range after a wrap load their media again', wrappedAgain && reloaded);

    const restartOff = await js(`(() => {
      T.scroller.scrollTop = 0;
      T.setAutoScroll(true);
      const had = T.cloneTiles.size > 0;
      const loop = document.getElementById('scroll-loop');
      loop.checked = false;
      loop.dispatchEvent(new Event('change'));
      const result = { had, gone: T.cloneTiles.size === 0 && T.wrapHeight === 0, running: T.autoScroll };
      T.setAutoScroll(false);
      return result;
    })()`);
    check(
      'turning restart off removes the clones and leaves auto-scroll running',
      restartOff.had && restartOff.gone && restartOff.running
    );
  }
};
