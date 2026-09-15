/* End-to-end harness: boots the real app with a throwaway profile, generates
 * media fixtures, then runs the cases in ./cases against it. Every case
 * starts from an empty library, so any subset runs on its own:
 *
 *   pnpm test:e2e               all cases
 *   pnpm test:e2e panel drag    only the named cases
 *
 * Needs a display; ffmpeg is optional (without it the video fixture is
 * skipped). Each case exports { name, run(ctx) } and reports through
 * ctx.check; see the ctx fields below.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { makePng, makeFixtures } = require('./fixtures');

/* ---------- cases ---------- */

const casesDir = path.join(__dirname, 'cases');
const allCases = fs
  .readdirSync(casesDir)
  .filter((file) => file.endsWith('.js'))
  .sort()
  .map((file) => require(path.join(casesDir, file)));

/* Case names from the command line; flags (anything starting with -) belong
 * to Electron and are ignored. Cases always run in file order. */
function selectCases(args) {
  const names = args.filter((arg) => !arg.startsWith('-'));
  if (!names.length) return allCases;
  const unknown = names.filter((name) => !allCases.some((c) => c.name === name));
  if (unknown.length) {
    console.error(`unknown case(s): ${unknown.join(', ')}`);
    console.error(`available: ${allCases.map((c) => c.name).join(', ')}`);
    return null;
  }
  return allCases.filter((c) => names.includes(c.name));
}

// validate before the app boots, so a typo fails at once
const selectedCases = selectCases(process.argv.slice(2));
if (!selectedCases) app.exit(2);

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collager-e2e-'));
const mediaDir = path.join(workDir, 'media');
fs.mkdirSync(mediaDir);
app.setPath('userData', path.join(workDir, 'userdata'));
process.env.COLLAGER_E2E = '1'; // main loads the page with ?e2e, which installs window.collagerTest

require('../../src/main/main.js');

/* ---------- check harness ---------- */

let failures = 0;
let counter = 0;
function check(name, ok, info = '') {
  counter++;
  if (!ok) failures++;
  console.log(`${ok ? 'ok' : 'not ok'} ${counter} - ${name}${info ? ` (${info})` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Polls until `probe` resolves truthy. Resolves to whether it did within
 * `timeoutMs`, so a case can turn the outcome into a check instead of
 * crashing. */
async function waitFor(probe, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return true;
    await sleep(50);
  }
  return false;
}

app.whenReady().then(() => {
  setTimeout(run, 2000);
});

async function run() {
  const hasVideo = makeFixtures(mediaDir);
  const expected = hasVideo ? 5 : 4; // wide, tall, square, gif (+video), copy deduped
  const fixtures = fs.readdirSync(mediaDir).map((f) => path.join(mediaDir, f));

  const wc = BrowserWindow.getAllWindows()[0].webContents;
  // every snippet sees the app's module exports as T (see app.js) and can
  // press(key) to fire a keydown on the window
  const js = (code) =>
    wc.executeJavaScript(`{
      const T = window.collagerTest;
      const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      ${code}
    }`);

  /* Reads the persisted library once it holds `count` items, or null. */
  const libraryFile = path.join(workDir, 'userdata', 'library.json');
  async function readLibraryWhen(count) {
    let library = null;
    const matched = await waitFor(() => {
      try {
        library = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
      } catch {
        return false;
      }
      return Array.isArray(library) && library.length === count;
    }, 5000);
    return matched ? library : null;
  }

  /* Shared by every case. Cases need not clean up: resetApp runs first. */
  const ctx = {
    js,
    check,
    waitFor,
    readLibraryWhen,
    workDir,
    fixtures,
    expected,
    makePng,
    /* adds every fixture and waits until the collage holds at least that
     * many items (an exact count stays a case's own check) */
    async loadFixtures() {
      await js(`T.addPaths(${JSON.stringify(fixtures)})`);
      const loaded = await waitFor(async () => (await js('T.state.items.length')) >= expected);
      if (!loaded) throw new Error('fixtures did not load');
    },
    /* writes `library` as the saved library and restarts the renderer, so a
     * case observes the startup path: the repair pass in the main process
     * and init in the renderer. Resolves once init has taken the result. */
    async restartWith(library) {
      fs.writeFileSync(libraryFile, JSON.stringify(library));
      const finished = new Promise((resolve) => wc.once('did-finish-load', resolve));
      wc.reload();
      await finished;
      const ready = await waitFor(() => js('T.state.libraryLoaded'));
      if (!ready) throw new Error('the renderer did not finish loading the library');
    }
  };

  /* Puts the app back to a known state: empty library, no selection, nothing
   * open, auto-scroll off, two columns, collage order, default speed, panel
   * and toolbar shown, not fullscreen, scrolled to the top, and confirm()
   * answering yes. */
  async function resetApp() {
    await js(`(async () => {
      window.confirm = () => true;
      T.closeCtxMenu();
      T.closeLightbox();
      T.closeOverlays();
      T.setAutoScroll(false);
      T.setColumns(2);
      T.setScrollSpeed(80);
      T.setPanelOpen(true);
      T.setToolbarOpen(true);
      if (T.isFullscreen) window.api.toggleFullscreen();
      T.sortSelect.value = 'added';
      T.sortSelect.dispatchEvent(new Event('change'));
      T.state.items = [];
      T.selected.clear();
      T.state.selectionAnchor = null;
      T.render();
      T.scroller.scrollTop = 0;
      await T.persist();
    })()`);
  }

  for (const testCase of selectedCases) {
    console.log(`# case: ${testCase.name}`);
    try {
      await resetApp();
      await testCase.run(ctx);
    } catch (err) {
      check(`case ${testCase.name} runs to the end`, false, String(err));
    }
  }

  console.log(`# ${counter - failures}/${counter} checks passed`);
  fs.rmSync(workDir, { recursive: true, force: true });
  app.exit(failures ? 1 : 0);
}
