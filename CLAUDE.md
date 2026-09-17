# Collager

Desktop media collage viewer for Linux and Windows: images (PNG/JPEG/WebP), GIFs and videos
(MP4/WebM) as one scrollable masonry collage.

## Stack

Electron plus plain JS, HTML and CSS. No bundler, no framework, no runtime dependencies beyond
Electron. Keep it that way. Electron because Chromium ships identical media codecs on Linux
and Windows. macOS is not a target; the `darwin` branches only keep the app quittable there.

## Layout

```
src/main/            main process: window, menu, GPU fallback, IPC registration
src/main/ipc/        IPC handlers grouped by concern: library, files, window
src/main/lib/        pure Node logic: scanning, hashing, library persistence, path checks
src/renderer/core/   pure logic, no DOM: layout, selection, prefs, auto-scroll step, key rules,
                     menu placement, item menu shape, count text, file list key, empty drop
src/renderer/ui/     DOM modules, ES modules with app.js as the entry; status.js owns job progress
src/renderer/package.json   type: module, so Node reads core/ the same way in tests
test/main, test/renderer   unit tests mirroring src/main/lib and src/renderer/core;
                     test/main/helpers.js holds what the main tests share
test/e2e/            boots the real app and drives it: run.js harness, fixtures.js, cases/*.js,
                     second-instance.js (a second launch against the harness profile)
build/               icon (SVG source, PNG export for electron-builder)
docs/                README media
```

- The renderer is ES modules. `ui/app.js` is the entry (`index.html` loads only it) and imports
  every other module, which is what wires their handlers up. Shared mutable state lives in
  `ui/state.js`: `state.items`, `state.selectionAnchor`, the `selected` set and the derived
  `itemsByHash` index (rebuilt by `reindexItems`, which every render calls); other modules
  own their state and export setters for what others may change. Module top levels touch only
  their own DOM and `state.js`; cross-module calls happen inside functions and handlers, which
  keeps the import cycles between ui modules harmless. Module evaluation order also decides the
  order in which window listeners register, so nothing may rely on one listener running before
  another: anything order-sensitive (the Escape ladder) lives in a single handler. Explicit
  imports mean eslint checks every identifier.
- `core/` modules are pure ES modules with no DOM access. `src/renderer/package.json` declares
  `type: module`, so Node loads them the same way and the unit tests `require()` them. Logic that
  can be stated without the DOM (a decision, a computation, a text) goes there with a unit test;
  the `ui/` module keeps only the DOM reads and writes around it.
- The renderer is isolated (`contextIsolation`, no `nodeIntegration`, CSP in `index.html`).
  Main-process capabilities are exposed only through an IPC channel plus a `window.api` entry
  in the preload script. Handlers live in `src/main/ipc/`, one module per concern with a
  `register*Ipc` function that `main.js` calls once. A path the renderer sends back to be handed
  to the shell must pass the checks in `lib/mediapath.js` first (a supported media extension plus
  an existing regular file, or an existing folder for the reveal of a missing entry).

## Design decisions

- **Layout**: masonry with a user-chosen column count (1 to 8, default 3). Items are scaled to
  the column width, aspect ratio preserved, never cropped, placed in the shortest column.
- **Identity**: file contents are hashed with SHA-256. The hash is the item identity everywhere
  and makes the same media under two names one item. Videos are hashed over their size plus
  1 MiB samples at the start, middle and end (whole file when smaller), and such hashes carry a
  `sampled-` prefix. Two distinct videos with the same size and samples would count as one
  item; for real media that is accepted for the speed. A sample that runs out before it is full
  means the file shrank mid-hash, which fails the hash rather than producing a short one. The
  byte size the hash was taken over is stored with it, and every present item is stat'd at load:
  an entry whose size moved (a copy still running when its folder was dropped) or whose video
  hash predates the sampled scheme is rehashed, and two entries that land on one hash merge.
  Hashing is invisible to the user: no toast or other copy mentions it, and its only visible
  effects are duplicates being skipped on add or merged at startup.
  A video entry that was already missing keeps its unprefixed hash and can no longer be repaired
  by re-adding the file: the copy comes back as a new item and the missing tile stays until it is
  removed by hand.
- **Resource limiting**: tiles are placeholders until within 800px of the viewport; the
  `<img>`/`<video>` is created then and torn down again once far away.
- **Audio**: videos are muted in the collage; the lightbox's native controls are the only place
  to unmute.
- **Persistence**: `library.json` in `userData` is an array of items, saves serialized and
  atomic (temp file plus rename). The renderer refuses to save until the saved library has been
  loaded into its state, so nothing done during startup or after a failed load can overwrite the
  file with an empty list. An unreadable file is moved to `library.json.corrupt` (a
  timestamped name when that exists, so no backup is ever overwritten) and the app starts empty.
  When the move fails the file stays in place and saving is refused so it is not overwritten.
  There is no schema version: a file the current code cannot read counts as unreadable. Only
  path, hash, size, type and dimensions are stored per item; URL and missing flag are derived at
  load, and an entry without a hash makes the file unreadable. A size is optional on read, so an
  entry from before sizes were recorded loads and has one filled in.
- **Missing files** stay in the library as red dashed tiles; re-adding the same content from a
  new location repairs the entry.
- **File panel** always starts closed; its open state is not remembered across restarts.
  A counter above the list gives the item total and expands on click into the split by
  file extension, biggest group first.
- **Item menu**: one context menu (`ui/ctxmenu.js`) serves tiles and file panel entries: maximize
  (the lightbox, which the copy never names), open in the default app, copy the path or (for
  still images) the bitmap, show in the file manager, remove. Actions that need the file are
  disabled for a missing item, except showing it in the file manager: that opens the folder the
  file was in, and reports it when that folder is gone as well. When the clicked item is part of
  a multi-selection the menu shows a count instead of the path and hides every single-item
  action, leaving remove, which then takes the whole selection. The menu records which surface
  it was opened on, so only what moves its own anchor closes it: a scroll of that container, a
  rebuild of the list for an entry, a re-layout of the collage for a tile. Auto-scroll holds
  while a tile's menu is up and runs on under an entry's.
- **Settings** live in `localStorage` under the `collager.` prefix via the prefs module.
- **Empty state**: the text on an empty collage carries an Add media files button, the same
  action as the Files menu entry, so a first start has something to click.
- **Empty drops**: a drop that resolves to no paths is explained when it carried links or a
  file with no location on disk (an image dragged out of a browser), and ignored otherwise.
- **Async library mutations** (load, add batches) run on one promise queue so overlapping drops
  cannot insert the same hash twice.
- **Toolbar**: three dropdown menus on the left (Files: add files, add a folder, the panel
  toggle; Collage: shuffle, columns, clear; Scroll: the auto-scroll toggle and its settings),
  fullscreen and help on the right next to the floating toolbar toggle. `ui/dropdown.js` opens
  one menu at a time, not modal; a button in a menu closes it unless it or a row above it is
  marked `keep-open` (shuffle, the column stepper, the settings rows). The bar wraps onto a
  second row rather than overflow, and media queries drop the hint and counters first.
- **Escape order**: toolbar dropdown, context menu, lightbox, help/about overlays, selection,
  fullscreen. One keydown handler in `shortcuts.js` walks that ladder and closes exactly one
  layer.
- **File panel list**: rebuilt only when what it shows changes (sort mode, and each entry's
  hash, path, type and missing state in order); other renders leave its DOM alone.
- **Progress**: long-running work (preparing the library, adding a batch) reports through
  `startJob` in `status.js`, one line per job in the status area stacked above the toast at the
  bottom centre. Toasts carry one-off messages; a sticky toast is reserved for a warning about
  a condition that lasts the session, such as a blocked save, and progress never goes through it.
- **Menu**: removed on Linux and Windows so the app owns its shortcuts (notably F11). F12 opens
  devtools when unpackaged.
- **Single instance**: a second launch exits at once and the running instance brings its
  window forward, so two instances can never take turns writing `library.json`.
- **GPU fallback**: three GPU process crashes relaunch the app with hardware acceleration
  disabled, passing an internal switch to the new process. Nothing is written to disk and
  there are no user-facing flags, so every normal start tries hardware acceleration again.

## Conventions

- `pnpm format` and `pnpm lint` before committing.
- `try { ... } catch {}` is the idiom for best-effort cleanup.
- Build DOM with `textContent` and `createElement`; `innerHTML` only with constant markup.
- Comments say why, briefly. No ticket references, no history of earlier approaches.

## Testing

- `pnpm test`: unit tests with `node:test`, no display needed.
- `pnpm test:e2e`: boots the real app with a throwaway profile, generates fixtures in code
  (video only when ffmpeg is installed) and drives the renderer via `executeJavaScript`.
  Each file in `test/e2e/cases/` is one feature and exports `{ name, run(ctx) }`. Before every
  case the harness resets the app (empty library, nothing open or selected, two columns, default
  speed, sort, panels and window size, `confirm()` answering yes), so a case loads what it needs
  (`ctx.loadFixtures()`), turns waits into checks (`ctx.waitFor` resolves to a boolean) and
  never cleans up. A case that needs the startup path seeds a saved library and restarts the
  renderer with `ctx.restartWith(library)`. `pnpm test:e2e panel drag` runs only the named
  cases, in file order. The harness sets `COLLAGER_E2E=1`; main then loads the page with `?e2e`
  and `app.js` exposes every module export on `window.collagerTest`, which the snippets reach
  as `T`; every snippet also gets `press(key)`, which fires a keydown on the window.
- Run the e2e suite locally as `env -u ELECTRON_RUN_AS_NODE pnpm test:e2e`, straight on the
  desktop: the app window opens and closes on the current display during the run, which is
  fine. `ELECTRON_RUN_AS_NODE` must be unset because VS Code terminals export it, which makes
  `require('electron')` return a path. `xvfb-run -a` is only for headless machines and CI, and
  is not installed on development machines.
- The CI e2e job makes Chromium's setuid sandbox helper root-owned because Ubuntu 24.04
  runners restrict unprivileged user namespaces.

## Packaging

electron-builder config is the `build` field in `package.json`: AppImage and NSIS, only
`src/**` bundled, icon from `build/icon.png`. `desktopName` plus `syncDesktopName` keeps the
Linux desktop entry matched to the running window.

Releases are cut by pushing a `vX.Y.Z` tag that matches the `version` in `package.json`. The
release workflow calls the lint, format, unit and e2e workflows as reusable workflows, which is
what their `workflow_call` trigger is for, builds both installers, and publishes a GitHub
Release with them, a `SHA256SUMS` file and auto-generated notes. The release is a draft until
every asset is uploaded, and the publish job deletes its own draft when it fails or is
cancelled, so a failed run normally leaves nothing behind but the tag. A tag that already has a
release, draft included, is refused, so a draft left behind by a lost runner has to be deleted
by hand before the run is retried. The installer file names come from the `artifactName`
fields; the build job's upload globs and the publish job's patterns match them on everything
except the architecture part (electron-builder writes `x86_64` for AppImage and `x64` for
NSIS), and the README spells out the names the x64 runners produce. Change all four together.
`build.appId` doubles as the Windows AppUserModelID: electron-builder stamps it on the
shortcuts and `main.js` sets the same literal on the running process, so the taskbar groups
and pins them together. electron-builder strips the `build` field from the packaged
`package.json`, so main must not read it back at runtime.
