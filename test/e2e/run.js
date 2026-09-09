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
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    const js = (code) => wc.executeJavaScript(code);
    await js('setColumns(2); setAutoScroll(false); void 0');

    // -- adding + dedup ---------------------------------------------------
    await js(`addPaths(${JSON.stringify(fixtures)})`);
    await new Promise((r) => setTimeout(r, 1500));
    check('drop adds all media once', (await js('items.length')) === expected);
    check(
      'duplicate content was skipped',
      (await js(`items.filter(i => /wide(-copy)?\\.png$/.test(i.path)).length`)) === 1
    );
    await js(`addPaths(${JSON.stringify([fixtures[0]])})`);
    check('re-adding is a no-op', (await js('items.length')) === expected);

    // -- dropping a directory adds its compatible files recursively ---------
    const dropDir = path.join(workDir, 'dirdrop');
    fs.mkdirSync(path.join(dropDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dropDir, 'extra1.png'), makePng(60, 40, [250, 250, 40]));
    fs.writeFileSync(path.join(dropDir, 'nested', 'extra2.png'), makePng(40, 60, [40, 250, 250]));
    fs.writeFileSync(path.join(dropDir, 'nested', 'notes.txt'), 'not media');
    await js(`addPaths(${JSON.stringify([dropDir])})`);
    await new Promise((r) => setTimeout(r, 800));
    check(
      'dropping a directory adds nested compatible files',
      (await js('items.length')) === expected + 2
    );
    check(
      'incompatible files in the directory are skipped',
      (await js(`items.some(i => i.path.endsWith('notes.txt'))`)) === false
    );
    // -- context menu on tiles ------------------------------------------------
    const tileMenu = await js(`(async () => {
      const item = items.find((i) => /extra1\\.png$/.test(i.path));
      const tile = tiles.get(item.hash);
      const r = tile.getBoundingClientRect();
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: r.x + 10, clientY: r.y + 10 }));
      const opened = !ctxMenu.hidden && ctxPath.textContent === item.path;
      const copyImageShown = !ctxCopyImageBtn.hidden;
      const enabled = !ctxOpenBtn.disabled && !ctxRevealBtn.disabled;
      const singleLabel = ctxRemoveBtn.textContent === 'Remove from collage';
      closeCtxMenu();

      // no bitmap copy for animated media
      const gif = items.find((i) => i.type === 'gif');
      const gifTile = tiles.get(gif.hash);
      const gr = gifTile.getBoundingClientRect();
      gifTile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: gr.x + 5, clientY: gr.y + 5 }));
      const copyImageHiddenForGif = ctxCopyImageBtn.hidden;
      closeCtxMenu();

      // a multi-selection containing the item makes remove take the selection
      selected.clear(); selected.add(item.hash); selected.add(items[0].hash); applySelection();
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: r.x + 10, clientY: r.y + 10 }));
      const selectionLabel = ctxRemoveBtn.textContent === 'Remove 2 selected';
      closeCtxMenu();
      selected.clear(); applySelection();

      // missing items keep only the actions that don't need the file
      item.missing = true;
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: r.x + 10, clientY: r.y + 10 }));
      const missingDisabled = ctxOpenBtn.disabled && ctxOpenExternalBtn.disabled
        && ctxRevealBtn.disabled && ctxCopyImageBtn.disabled
        && !document.getElementById('ctx-copy').disabled;
      closeCtxMenu();
      item.missing = false;

      // remove through the menu takes exactly the clicked item
      const before = items.length;
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: r.x + 10, clientY: r.y + 10 }));
      ctxRemoveBtn.click();
      await new Promise((r2) => setTimeout(r2, 100));
      const removed = items.length === before - 1 && !items.some((i) => i.hash === item.hash)
        && ctxMenu.hidden;
      return { opened, copyImageShown, copyImageHiddenForGif,
        enabled, singleLabel, selectionLabel, missingDisabled, removed };
    })()`);
    check('right-click on a tile opens the item menu', tileMenu.opened && tileMenu.enabled);
    check(
      'copy image is offered for still images only',
      tileMenu.copyImageShown && tileMenu.copyImageHiddenForGif
    );

    // the scroll event of auto-scroll's last tick is delivered after a real
    // right-click opened the menu and must not close it; a synthetic
    // contextmenu event cannot reproduce that ordering, so send real input
    const topTile = await js(`(async () => {
      scroller.scrollTop = 0;
      setAutoScroll(true);
      await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
      const first = [...lastPositions.values()].sort((a, b) => a.y - b.y)[0];
      const r = tiles.get(first.item.hash).getBoundingClientRect();
      return { x: Math.round(r.x + 10), y: Math.round(r.y + 10) };
    })()`);
    for (const type of ['mouseDown', 'mouseUp']) {
      wc.sendInputEvent({ type, button: 'right', x: topTile.x, y: topTile.y, clickCount: 1 });
    }
    await new Promise((r) => setTimeout(r, 250));
    check(
      'the menu survives auto-scroll running',
      await js(`(() => {
        const open = !ctxMenu.hidden;
        closeCtxMenu();
        setAutoScroll(false);
        scroller.scrollTop = 0;
        return open;
      })()`)
    );
    check('remove label follows the selection', tileMenu.singleLabel && tileMenu.selectionLabel);
    check('missing items disable the file-based actions', tileMenu.missingDisabled);
    check('remove from the menu removes the clicked item', tileMenu.removed);

    await js(`(() => {
      const extras = items.filter(i => /extra[12]\\.png$/.test(i.path)).map(i => i.hash);
      items = items.filter(i => !extras.includes(i.hash));
      render();
      return persist();
    })()`); // restore the original fixture set for the checks below

    // -- layout ------------------------------------------------------------
    const layoutOk = await js(`(() => {
      const it = items.find(i => i.path.endsWith('tall.png'));
      const t = tiles.get(it.hash);
      const w = parseFloat(t.style.width), h = parseFloat(t.style.height);
      return it.w === 150 && it.h === 250 && Math.abs(h / w - 250 / 150) < 0.02;
    })()`);
    check('dimensions measured and aspect ratio preserved in layout', layoutOk);
    check(
      'all tiles laid out',
      (await js(`document.querySelectorAll('.tile').length`)) === expected
    );

    // -- panel, selection, batch remove -------------------------------------
    check('file panel lists every item', (await js('fileList.children.length')) === expected);
    await js(`sortSelect.value = 'name'; sortSelect.dispatchEvent(new Event('change')); void 0`);
    const names = await js(
      `[...fileList.children].map(li => li.querySelector('.fname').textContent)`
    );
    check(
      'list sorts by name',
      JSON.stringify(names) === JSON.stringify(names.slice().sort((a, b) => a.localeCompare(b)))
    );

    await js(`fileList.children[0].click()`);
    await js(
      `fileList.children[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))`
    );
    check('shift-click selects a range', (await js('selected.size')) === 2);
    check(
      'selection shows on tiles',
      (await js(`document.querySelectorAll('.tile.selected').length`)) === 2
    );

    await js(`window.confirm = () => true; removeSelectedBtn.click(); void 0`);
    await new Promise((r) => setTimeout(r, 300));
    check('batch remove removes the selection', (await js('items.length')) === expected - 2);
    check('selection is empty after removal', (await js('selected.size')) === 0);

    // -- drag-to-reorder -----------------------------------------------------
    const dragged = await js(`(async () => {
      const before = items.map(i => i.hash);
      const from = tiles.get(before[0]).getBoundingClientRect();
      const to = tiles.get(before[1]).getBoundingClientRect();
      const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, button: 0, isPrimary: true });
      const fx = from.x + from.width / 2, fy = from.y + from.height / 2;
      const tx = to.x + to.width / 2, ty = to.y + to.height / 2;
      tiles.get(before[0]).dispatchEvent(new PointerEvent('pointerdown', opts(fx, fy)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(fx + 20, fy + 20)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(tx, ty)));
      window.dispatchEvent(new PointerEvent('pointerup', opts(tx, ty)));
      await new Promise(r => setTimeout(r, 100));
      const after = items.map(i => i.hash);
      return { moved: after.indexOf(before[0]) === 1 && after.indexOf(before[1]) === 0,
               nothingSelected: selected.size === 0 };
    })()`);
    check('drag reorders tiles', dragged.moved);
    check('drag does not select', dragged.nothingSelected);

    const dragEdge = await js(`(async () => {
      const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, button: 0, isPrimary: true });
      const hash = items[0].hash;
      const tile = () => tiles.get(hash);
      const r = tile().getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;

      // the click following a completed drag is suppressed
      const r2 = tiles.get(items[1].hash).getBoundingClientRect();
      tile().dispatchEvent(new PointerEvent('pointerdown', opts(cx, cy)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(r2.x + 10, r2.y + 10)));
      window.dispatchEvent(new PointerEvent('pointerup', opts(r2.x + 10, r2.y + 10)));
      tile().dispatchEvent(new MouseEvent('click', opts(r2.x + 10, r2.y + 10)));
      const suppressed = selected.size === 0;
      await new Promise(r => setTimeout(r, 50));

      // a sub-threshold press is still a normal click-select
      const r3 = tile().getBoundingClientRect();
      tile().dispatchEvent(new PointerEvent('pointerdown', opts(r3.x + 5, r3.y + 5)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(r3.x + 8, r3.y + 8)));
      window.dispatchEvent(new PointerEvent('pointerup', opts(r3.x + 8, r3.y + 8)));
      tile().dispatchEvent(new MouseEvent('click', opts(r3.x + 8, r3.y + 8)));
      const clickStillSelects = selected.size === 1;
      selected.clear(); applySelection();

      // pointercancel aborts: order unchanged, no ghost left behind
      const before = items.map(i => i.hash).join();
      const r4 = tile().getBoundingClientRect();
      tile().dispatchEvent(new PointerEvent('pointerdown', opts(r4.x + 10, r4.y + 10)));
      window.dispatchEvent(new PointerEvent('pointermove', opts(r4.x + 60, r4.y + 60)));
      window.dispatchEvent(new PointerEvent('pointercancel', opts(r4.x + 60, r4.y + 60)));
      const aborted = items.map(i => i.hash).join() === before
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

    // -- missing-file tooltip ------------------------------------------------
    const missingTip = await js(`(() => {
      const item = items[0];
      item.missing = true;
      const old = tiles.get(item.hash);
      observer.unobserve(old); dehydrate(old); old.remove(); tiles.delete(item.hash);
      render();
      const tile = tiles.get(item.hash);
      const tileHint = tile.classList.contains('missing') && tile.title.includes('external drive');
      const li = listEntries.get(item.hash);
      const listHint = li.title.includes(item.path) && li.title.includes('moved or renamed');
      item.missing = false;
      observer.unobserve(tile); tile.remove(); tiles.delete(item.hash);
      render();
      return tileHint && listHint;
    })()`);
    check('missing files explain themselves in a tooltip', missingTip);

    // -- clear-missing button -------------------------------------------------
    const clearMissing = await js(`(async () => {
      const btn = document.getElementById('btn-clear-missing');
      const hiddenWhenNoneMissing = btn.hidden;
      items[0].missing = true;
      items[1].missing = true;
      render();
      const visible = !btn.hidden && btn.textContent.includes('2');
      const liCoded = listEntries.get(items[0].hash).classList.contains('missing');
      const before = items.length;
      window.confirm = () => false;
      btn.click();
      const cancelKeeps = items.length === before;
      window.confirm = () => true;
      btn.click();
      await new Promise((r) => setTimeout(r, 100));
      return {
        hiddenWhenNoneMissing, visible, liCoded, cancelKeeps,
        removed: items.length === before - 2 && !items.some((i) => i.missing),
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
    check('clear-all empties the collage', (await js('items.length')) === 0);
    check('empty state is shown again', await js(`!document.getElementById('empty-state').hidden`));

    // -- keyboard shortcuts ---------------------------------------------------
    const speed = await js(`(() => {
      const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      setScrollSpeed(80);
      key('.');
      const faster = scrollSpeed === 90;
      key(','); key(',');
      const slower = scrollSpeed === 70;
      const sliderSynced = parseInt(speedSlider.value, 10) === 70;
      setScrollSpeed(80);
      return { faster, slower, sliderSynced };
    })()`);
    check('"." raises the auto-scroll speed', speed.faster);
    check('"," lowers it and the slider follows', speed.slower && speed.sliderSynced);

    check(
      'Space toggles auto-scroll',
      await js(`(() => {
      const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      key(' ');
      const on = autoScroll;
      key(' ');
      return on && !autoScroll;
    })()`)
    );

    check(
      '-/+ change the column count',
      await js(`(() => {
      const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      const before = columns;
      key('-');
      const minus = columns === Math.max(MIN_COLUMNS, before - 1);
      key('+');
      return minus && columns === before;
    })()`)
    );

    // -- help & about overlays ------------------------------------------------
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }))`);
    check('F1 opens the shortcuts overlay', await js('!helpOverlay.hidden'));
    check(
      'the overlay lists every binding',
      await js(`shortcutList.querySelectorAll('tr').length === SHORTCUTS.length`)
    );
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    check('Escape closes the overlay', await js('helpOverlay.hidden'));

    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))`);
    await new Promise((r) => setTimeout(r, 400));
    const pkg = require('../../package.json');
    const aboutOk = await js(`(() => ({
      open: !aboutOverlay.hidden,
      name: document.getElementById('about-name').textContent,
      version: document.getElementById('about-version').textContent
    }))()`);
    check(
      'about shows package.json metadata',
      aboutOk.open &&
        aboutOk.name === ((pkg.build && pkg.build.productName) || pkg.name) &&
        aboutOk.version === `version ${pkg.version}`
    );
    await js('closeOverlays(); void 0');
  } catch (err) {
    failures++;
    console.error('not ok - test crashed:', err);
  }

  console.log(`# ${counter - failures}/${counter} checks passed`);
  fs.rmSync(workDir, { recursive: true, force: true });
  app.exit(failures ? 1 : 0);
}
