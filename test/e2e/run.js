/* End-to-end test: boots the real app with a throwaway profile, injects
 * generated media fixtures, and exercises adding, dedup, layout, the file
 * panel, selection, batch remove, clear-all and persistence.
 *
 * Run with:  pnpm test:e2e   (requires a display; ffmpeg optional —
 * without it the video fixture is skipped.)
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collager-e2e-'));
const mediaDir = path.join(workDir, 'media');
fs.mkdirSync(mediaDir);
app.setPath('userData', path.join(workDir, 'userdata'));

process.env.COLLAGER_E2E = '1'; // main loads the page with ?e2e, which installs window.collagerTest
require('../../src/main/main.js');

/* ---------- fixture generation (no external tools needed for images) ---------- */

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (const b of buf) c = (c >>> 8) ^ crcTable[(c ^ b) & 0xff];
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

function makePng(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    for (let x = 0; x < w; x++) {
      raw[off + 1 + x * 3] = r;
      raw[off + 2 + x * 3] = g;
      raw[off + 3 + x * 3] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// canonical 1x1 GIF
const GIF_1PX = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
);

function makeFixtures() {
  fs.writeFileSync(path.join(mediaDir, 'wide.png'), makePng(320, 180, [200, 40, 40]));
  fs.writeFileSync(path.join(mediaDir, 'tall.png'), makePng(150, 250, [40, 200, 40]));
  fs.writeFileSync(path.join(mediaDir, 'square.png'), makePng(200, 200, [40, 40, 200]));
  fs.writeFileSync(path.join(mediaDir, 'tiny.gif'), GIF_1PX);
  // duplicate content under a different name
  fs.writeFileSync(path.join(mediaDir, 'wide-copy.png'), makePng(320, 180, [200, 40, 40]));

  let hasVideo = false;
  const ffmpeg = spawnSync('ffmpeg', [
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=duration=1:size=160x90:rate=10',
    '-pix_fmt',
    'yuv420p',
    '-y',
    path.join(mediaDir, 'clip.mp4')
  ]);
  if (ffmpeg.status === 0) hasVideo = true;
  else console.log('# ffmpeg not available — skipping video fixture');
  return hasVideo;
}

/* ---------- tiny check harness ---------- */

let failures = 0;
let counter = 0;
function check(name, ok, info = '') {
  counter++;
  if (!ok) failures++;
  console.log(`${ok ? 'ok' : 'not ok'} ${counter} - ${name}${info ? ` (${info})` : ''}`);
}

/* ---------- the test ---------- */

app.whenReady().then(() => {
  setTimeout(run, 2000);
});

async function run() {
  const hasVideo = makeFixtures();
  const expected = hasVideo ? 5 : 4; // wide, tall, square, gif (+video), copy deduped
  const fixtures = fs.readdirSync(mediaDir).map((f) => path.join(mediaDir, f));

  try {
    const win = BrowserWindow.getAllWindows()[0];
    const wc = win.webContents;
    // every snippet sees the app's module exports as T (see app.js)
    const js = (code) => wc.executeJavaScript(`{ const T = window.collagerTest; ${code} }`);
    await js('T.setColumns(2); T.setAutoScroll(false); void 0');

    // -- adding + dedup ---------------------------------------------------
    await js(`T.addPaths(${JSON.stringify(fixtures)})`);
    await new Promise((r) => setTimeout(r, 1500));
    check('drop adds all media once', (await js('T.state.items.length')) === expected);
    check(
      'duplicate content was skipped',
      (await js(`T.state.items.filter(i => /wide(-copy)?\\.png$/.test(i.path)).length`)) === 1
    );
    await js(`T.addPaths(${JSON.stringify([fixtures[0]])})`);
    check('re-adding is a no-op', (await js('T.state.items.length')) === expected);

    // -- dropping a directory adds its compatible files recursively ---------
    const dropDir = path.join(workDir, 'dirdrop');
    fs.mkdirSync(path.join(dropDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dropDir, 'extra1.png'), makePng(60, 40, [250, 250, 40]));
    fs.writeFileSync(path.join(dropDir, 'nested', 'extra2.png'), makePng(40, 60, [40, 250, 250]));
    fs.writeFileSync(path.join(dropDir, 'nested', 'notes.txt'), 'not media');
    await js(`T.addPaths(${JSON.stringify([dropDir])})`);
    await new Promise((r) => setTimeout(r, 800));
    check(
      'dropping a directory adds nested compatible files',
      (await js('T.state.items.length')) === expected + 2
    );
    check(
      'incompatible files in the directory are skipped',
      (await js(`T.state.items.some(i => i.path.endsWith('notes.txt'))`)) === false
    );
    await js(`(() => {
      const extras = T.state.items.filter(i => /extra[12]\\.png$/.test(i.path)).map(i => i.hash);
      T.state.items = T.state.items.filter(i => !extras.includes(i.hash));
      T.render();
      return T.persist();
    })()`); // restore the original fixture set for the checks below

    // -- layout ------------------------------------------------------------
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

    // -- panel, selection, batch remove -------------------------------------
    check('file panel lists every item', (await js('T.fileList.children.length')) === expected);
    await js(
      `T.sortSelect.value = 'name'; T.sortSelect.dispatchEvent(new Event('change')); void 0`
    );
    const names = await js(
      `[...T.fileList.children].map(li => li.querySelector('.fname').textContent)`
    );
    check(
      'list sorts by name',
      JSON.stringify(names) === JSON.stringify(names.slice().sort((a, b) => a.localeCompare(b)))
    );

    await js(`T.fileList.children[0].click()`);
    await js(
      `T.fileList.children[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))`
    );
    check('shift-click selects a range', (await js('T.selected.size')) === 2);
    check(
      'selection shows on tiles',
      (await js(`document.querySelectorAll('.tile.selected').length`)) === 2
    );

    // -- escape ladder: one layer per press --------------------------------------
    const ladder = await js(`(async () => {
      const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      T.openLightbox(T.state.items[0]);
      escape();
      const lightboxOnly = T.lightbox.hidden && T.selected.size === 2;
      T.helpOverlay.hidden = false;
      escape();
      const overlayOnly = T.helpOverlay.hidden && T.selected.size === 2;
      escape();
      const selectionCleared = T.selected.size === 0;
      T.selected.add(T.state.items[0].hash); T.selected.add(T.state.items[1].hash); T.applySelection();
      return { lightboxOnly, overlayOnly, selectionCleared };
    })()`);
    check('Escape closes the lightbox and keeps the selection', ladder.lightboxOnly);
    check('Escape closes an overlay and keeps the selection', ladder.overlayOnly);
    check('Escape then clears the selection', ladder.selectionCleared);

    await js(`window.confirm = () => true; T.removeSelectedBtn.click(); void 0`);
    await new Promise((r) => setTimeout(r, 300));
    check(
      'batch remove removes the selection',
      (await js('T.state.items.length')) === expected - 2
    );
    check('selection is empty after removal', (await js('T.selected.size')) === 0);

    // -- drag-to-reorder -----------------------------------------------------
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

    // -- persistence --------------------------------------------------------
    await new Promise((r) => setTimeout(r, 300));
    const lib = JSON.parse(fs.readFileSync(path.join(workDir, 'userdata', 'library.json'), 'utf8'));
    check(
      'library persisted with dimensions',
      lib.length === expected - 2 && lib.every((i) => i.w > 0 && i.h > 0)
    );

    // -- toolbar dropdowns ----------------------------------------------------
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
      document.getElementById('scroller').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true })
      );
      const outsideCloses = popup.hidden;
      trigger.click();
      const order = T.state.items.map((i) => i.hash).join();
      // a fixed draw makes the Fisher-Yates pass rotate the list, so the
      // order provably changes even with two items left
      const random = Math.random;
      Math.random = () => 0;
      document.getElementById('btn-shuffle').click();
      Math.random = random;
      const itemCloses = popup.hidden && trigger.getAttribute('aria-expanded') === 'false';
      const shuffled = T.state.items.map((i) => i.hash).join() !== order;
      return {
        opened, anchored, onScreen, expanded, popupFocused, toggledOff, focusReturned,
        tabOutCloses, outsideCloses, itemCloses, shuffled
      };
    })()`);
    check('the Collage menu opens under its button', menu.opened && menu.anchored && menu.onScreen);
    check('the open menu is announced and focused', menu.expanded && menu.popupFocused);
    check('the menu button toggles the menu', menu.toggledOff && menu.focusReturned);
    check('moving focus out of the menu closes it', menu.tabOutCloses);
    check('a click outside closes the menu', menu.outsideCloses);
    check('choosing an item runs it and closes the menu', menu.itemCloses && menu.shuffled);

    const scrollMenu = await js(`(() => {
      const first = T.state.items[0].hash;
      T.selected.add(first);
      T.applySelection();
      document.getElementById('btn-scroll-menu').click();
      const openedSecond = T.openDropdownId() === 'scroll-menu';
      const sliderShown = T.speedSlider.offsetParent !== null;
      T.setScrollSpeed(120);
      const readout = document.getElementById('scroll-speed-value').textContent === '120 px/s';
      T.setScrollSpeed(80);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      const escapeClosesMenuFirst = T.openDropdownId() === null && T.selected.has(first);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      const escapeThenClears = T.selected.size === 0;
      document.getElementById('btn-scroll-menu').click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }));
      const helpClosesMenu = T.openDropdownId() === null && !T.helpOverlay.hidden;
      T.closeOverlays();
      return { openedSecond, sliderShown, readout, escapeClosesMenuFirst, escapeThenClears, helpClosesMenu };
    })()`);
    check(
      'the auto-scroll settings open in their own menu',
      scrollMenu.openedSecond && scrollMenu.sliderShown
    );
    check('the speed readout follows the setter', scrollMenu.readout);
    check(
      'Escape closes the menu before touching the selection',
      scrollMenu.escapeClosesMenuFirst && scrollMenu.escapeThenClears
    );
    check('opening the help overlay closes the menu', scrollMenu.helpClosesMenu);

    // -- narrow window ----------------------------------------------------------
    const [wideW, wideH] = win.getSize();
    win.setSize(560, 600);
    await new Promise((r) => setTimeout(r, 500));
    const narrow = await js(`(() => {
      const toolbar = document.getElementById('toolbar');
      const bar = toolbar.getBoundingClientRect();
      const shown = [...toolbar.children].filter((el) => getComputedStyle(el).display !== 'none');
      const inside = shown.every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= window.innerWidth + 0.5;
      });
      const wrapped = bar.height > 48;
      const scrollerRect = document.getElementById('scroller').getBoundingClientRect();
      const workspaceFits = scrollerRect.top >= bar.bottom - 0.5 && scrollerRect.bottom <= window.innerHeight + 0.5;
      const decorationsDropped = !shown.includes(document.getElementById('toolbar-hint')) &&
        !shown.includes(document.getElementById('item-count'));
      return { width: window.innerWidth, inside, wrapped, workspaceFits, decorationsDropped };
    })()`);
    check(
      'a narrow window keeps every toolbar control inside it',
      narrow.width <= 560 && narrow.inside
    );
    check(
      'the toolbar wrapped and the collage fills the rest of the window',
      narrow.wrapped && narrow.workspaceFits
    );
    check('the hint and item count make way first', narrow.decorationsDropped);
    win.setSize(900, 120); // shorter than the settings popup, so it must scroll
    await new Promise((r) => setTimeout(r, 500));
    const short = await js(`(() => {
      const trigger = document.getElementById('btn-scroll-menu');
      trigger.click();
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
    win.setSize(wideW, wideH);
    await new Promise((r) => setTimeout(r, 500));

    // -- missing-file tooltip ------------------------------------------------
    const missingTip = await js(`(() => {
      const item = T.state.items[0];
      item.missing = true;
      const old = T.tiles.get(item.hash);
      T.observer.unobserve(old); T.dehydrate(old); old.remove(); T.tiles.delete(item.hash);
      T.render();
      const tile = T.tiles.get(item.hash);
      const tileHint = tile.classList.contains('missing') && tile.title.includes('external drive');
      const li = T.listEntries.get(item.hash);
      const listHint = li.title.includes(item.path) && li.title.includes('moved or renamed');
      item.missing = false;
      T.observer.unobserve(tile); tile.remove(); T.tiles.delete(item.hash);
      T.render();
      return tileHint && listHint;
    })()`);
    check('missing files explain themselves in a tooltip', missingTip);

    // -- clear-missing button -------------------------------------------------
    const clearMissing = await js(`(async () => {
      const btn = document.getElementById('btn-clear-missing');
      const hiddenWhenNoneMissing = btn.hidden;
      T.state.items[0].missing = true;
      T.state.items[1].missing = true;
      T.render();
      const visible = !btn.hidden && btn.textContent.includes('2');
      const liCoded = T.listEntries.get(T.state.items[0].hash).classList.contains('missing');
      const before = T.state.items.length;
      window.confirm = () => false;
      btn.click();
      const cancelKeeps = T.state.items.length === before;
      window.confirm = () => true;
      btn.click();
      await new Promise((r) => setTimeout(r, 100));
      return {
        hiddenWhenNoneMissing, visible, liCoded, cancelKeeps,
        removed: T.state.items.length === before - 2 && !T.state.items.some((i) => i.missing),
        hiddenAgain: btn.hidden
      };
    })()`);
    check(
      'clear-missing button only shows while something is missing',
      clearMissing.hiddenWhenNoneMissing && clearMissing.visible
    );
    check('missing entries are color-coded in the panel', clearMissing.liCoded);
    check('cancelling the confirmation keeps everything', clearMissing.cancelKeeps);
    check(
      'confirming removes exactly the missing items',
      clearMissing.removed && clearMissing.hiddenAgain
    );

    // -- clear all ----------------------------------------------------------
    await js(`document.getElementById('btn-clear').click(); void 0`);
    await new Promise((r) => setTimeout(r, 300));
    check('clear-all empties the collage', (await js('T.state.items.length')) === 0);
    check('empty state is shown again', await js(`!document.getElementById('empty-state').hidden`));

    // -- keyboard shortcuts ---------------------------------------------------
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

    // -- help & about overlays ------------------------------------------------
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }))`);
    check('F1 opens the shortcuts overlay', await js('!T.helpOverlay.hidden'));
    check(
      'the overlay lists every binding',
      await js(`T.shortcutList.querySelectorAll('tr').length === T.SHORTCUTS.length`)
    );
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    check('Escape closes the overlay', await js('T.helpOverlay.hidden'));

    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))`);
    await new Promise((r) => setTimeout(r, 400));
    const pkg = require('../../package.json');
    const aboutOk = await js(`(() => ({
      open: !T.aboutOverlay.hidden,
      name: document.getElementById('about-name').textContent,
      version: document.getElementById('about-version').textContent
    }))()`);
    check(
      'about shows package.json metadata',
      aboutOk.open &&
        aboutOk.name === ((pkg.build && pkg.build.productName) || pkg.name) &&
        aboutOk.version === `version ${pkg.version}`
    );
    await js('T.closeOverlays(); void 0');
  } catch (err) {
    failures++;
    console.error('not ok - test crashed:', err);
  }

  console.log(`# ${counter - failures}/${counter} checks passed`);
  fs.rmSync(workDir, { recursive: true, force: true });
  app.exit(failures ? 1 : 0);
}
