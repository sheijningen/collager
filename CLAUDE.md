# Collager

Desktop media collage viewer for Linux, Windows and macOS: images (PNG/JPEG/WebP/SVG), GIFs and
videos (MP4/WebM/MKV) as one scrollable masonry collage.

## Stack

Electron plus plain JS, HTML and CSS. No bundler, no framework, no runtime dependencies beyond
Electron. Keep it that way. Electron because Chromium ships identical media codecs on Linux,
Windows and macOS.

## Layout

```
src/main/            main process: window, menu, single instance, GPU fallback, smoke exit,
                     paths macOS asks to open, IPC registration
src/main/ipc/        IPC handlers grouped by concern: library, files, window
src/main/lib/        pure Node logic: scanning, hashing, library persistence, path checks,
                     the relaunch options of the GPU fallback, the macOS menu template, the
                     window bounds to remember
src/renderer/core/   pure logic, no DOM: layout, selection, prefs, auto-scroll step and speed
                     range, key rules, menu placement, item menu shape, count text, file list
                     key, empty drop, lightbox stepping, path names, volume roots and
                     cache-busting URLs, user-facing text, a bounded worker pool, the spacing
                     of retries and what a retry's answer means
src/renderer/ui/     DOM modules, ES modules with app.js as the entry; status.js owns job
                     progress, popup.js places the context menu and the toolbar dropdowns
src/renderer/package.json   type: module, so Node reads core/ the same way in tests
test/main, test/renderer, test/scripts   unit tests mirroring src/main/lib, build/afterpack.js,
                     src/renderer/core and scripts/; test/main/helpers.js holds what the main
                     tests share
test/e2e/            boots the real app and drives it: run.js harness, fixtures.js, cases/*.js,
                     second-instance.js (a second launch against the harness profile)
build/               icon (SVG source, PNG export for electron-builder), the afterPack hook
scripts/             the Electron launcher behind pnpm start and pnpm test:e2e
docs/                README media
```

- The renderer is ES modules. `ui/app.js` is the entry (`index.html` loads only it) and imports
  every other module, which is what wires their handlers up. Shared mutable state lives in
  `ui/state.js`: `state.items`, `state.libraryLoaded`, `state.selectionAnchor`, the `selected` set
  and the derived `itemsByHash` index (rebuilt by `reindexItems`, which every render calls); other
  modules own their state and export setters for what others may change. Module top levels touch
  only their own DOM and `state.js`; cross-module calls happen inside functions and handlers, which
  keeps the import cycles between ui modules harmless. Module evaluation order also decides the
  order in which window listeners register, so nothing may rely on one listener running before
  another: anything order-sensitive (the Escape ladder) lives in a single handler. Explicit imports
  mean eslint checks every identifier.
- `core/` modules are pure ES modules with no DOM access. `src/renderer/package.json` declares
  `type: module`, so Node loads them the same way and the unit tests `require()` them. Logic that
  can be stated without the DOM (a decision, a computation, a text) goes there with a unit test;
  the `ui/` module keeps only the DOM reads and writes around it.
- The renderer is isolated (`contextIsolation`, no `nodeIntegration`, CSP in `index.html`).
  Main-process capabilities are exposed only through an IPC channel plus a `window.api` entry
  in the preload script. Two entries need no channel: `window.api.platform`, which key handling
  and the help text need before anything could answer, and `window.api.pathForFile`, which
  resolves a dropped file's path through `webUtils` in the preload itself. Handlers live in
  `src/main/ipc/`, one module per concern with a `register*Ipc` function that `main.js` calls
  once. A path the renderer sends back to be handed to the shell must pass the checks in
  `lib/mediapath.js` first (a supported media extension plus an existing regular file, or an
  existing folder for the reveal of a missing entry).

## Design decisions

- **Layout**: masonry with a user-chosen column count (1 to 8, default 3). Items are scaled to
  the column width, aspect ratio preserved, never cropped, placed in the shortest column. The
  scroller reserves its scrollbar gutter, so the packing width never depends on whether a
  scrollbar is showing; hiding the scrollbar (Scroll menu) drops the gutter as well, and the
  collage re-renders to the wider columns. An item's dimensions come from loading its metadata
  off screen. A load that fails gives the
  260x140 fallback, which `hasOwnDimensions` in `core/layout.js` tells apart from a real
  measure; one still pending after twenty seconds (`LOAD_TIMEOUT_MS` there) leaves the item
  without dimensions, so it is laid out at the fallback size and measured again at the next start.
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
  A video entry that was already missing keeps its unprefixed hash, so a copy re-added from
  elsewhere comes in as a new item; the entry is rehashed once a file is back at its own path
  (see Retries), and the missing tile stays until then or until it is removed by hand.
- **Resource limiting**: tiles are placeholders until within 800px of the viewport; the
  `<img>`/`<video>` is created then and torn down again once far away.
- **Auto-scroll loop**: with Restart at the end on, the collage is a cylinder while auto-scroll
  runs. Below the real collage a wrap region holds clone tiles: the next loop's order packed
  from a level line one gap below the end (`packClones` in `core/layout.js`), one pass at most,
  stopping once every column covers the viewport plus the 800px margin. Each clone sits exactly
  `wrapHeight` below the place its item takes after the wrap, and the tick scrolls up by that
  distance once it reaches it, so the frame after the wrap matches the one before. With Shuffle
  on restart the next order is shuffled when the region is built, kept across renders (items
  that go drop out, new ones join at the end, nothing reshuffles) and becomes the collage order
  (saved) at the wrap; a sort or shuffle picked while that loop runs holds only until the wrap
  replaces it. At the wrap the clones' loaded media move into the real tiles, so nothing
  reloads on screen. Clones share the tile builder and the click, double-click and menu
  handlers, live in their own `cloneTiles` index, and are never drag sources or targets,
  scroll-to-item targets or entries in `lastPositions`. The region exists only while
  auto-scroll runs with restart on and the collage is taller than the viewport; every render
  rebuilds it. A collage barely taller than the window can pack shorter than the window after
  a shuffled wrap; it then gets no clones and nothing scrolls until the next shuffle, though
  auto-scroll still shows as running. Stopping auto-scroll or turning restart off with the
  viewport past `wrapHeight` wraps first, and with clones only partly on screen the region
  lingers until the viewport leaves it (scrolling on past `wrapHeight` wraps), so the screen
  keeps its picture either way; auto-scroll with restart off stops on such a lingering region,
  since the viewport is past the real end, and toggling Shuffle on restart reorders its clones,
  as the user changed the next loop.
- **Lightbox**: the arrow keys step to the previous or next item in collage order that can be
  shown, and the collage scrolls to it, so closing the lightbox lands where the browsing
  stopped. A focused video keeps the arrows for seeking.
- **Audio**: videos are muted in the collage; the lightbox's native controls are the only place
  to unmute.
- **Persistence**: `library.json` in `userData` is an array of items, saves serialized and atomic
  (temp file, synced, then renamed into place). A quit, and the GPU fallback's relaunch, wait for
  the queued saves first, five seconds at most. The renderer refuses to save until the saved
  library has been loaded into its state, so nothing done during startup or after a failed load can
  overwrite the file with an empty list. An unreadable file is moved to `library.json.corrupt` (a
  timestamped name when that exists, so no backup is ever overwritten) and the app starts empty.
  When the move fails, or the file is there but cannot be read at all (permissions, a directory in
  its place), the file stays in place and saving is refused so it is not overwritten. There is no
  schema version: a file the current code cannot read counts as unreadable. Only path, hash, size,
  type and dimensions are stored per item; URL, missing flag and the load error of a missing entry
  are derived at load, the unshowable flag and the load error of a failed load while the app
  runs, and an entry without a hash or a media type makes the file unreadable; a
  save carrying such an entry is refused so that file is never written. A size is optional on read,
  so an entry from before sizes were recorded loads and has one filled in.
- **Missing files** stay in the library as red dashed tiles; re-adding the same content from a
  new location repairs the entry, and measures it again when it has the fallback size or none.
- **Retries**: missing and unshowable items are looked at again: five to ten seconds after the
  failure, then ten, fifteen, then every half minute, each wait counted from when the previous
  attempt settled. A file that is not about to come back (gone from a folder that is still there, or
  there but undecodable) doubles its wait after each such answer beyond the third in a row, up to
  ten minutes, and is left alone after ten such answers in a row, as is one that decodes and then
  breaks twice in a row within a minute of coming back. An attempt has the main process stat the
  file; a file written in the last two seconds waits for a later attempt, and one whose hash is
  stale (its size moved, or a video hash from before the sampled scheme) is rehashed. Other content
  at the path takes the entry's place, or merges into the item that already holds it, and loads by a
  URL carrying the new hash so Chromium's cache does not serve the old content. An unshowable file
  is decoded off screen before it shows again. At most two attempts run at once and never two on one
  volume, and one answer speaks for its folder (gone) or its volume (slower than five seconds and
  found nothing: parked for five minutes) until that file is due again, so an unplugged drive costs
  one question per folder and a dropping share one answer per five minutes; a share mounted outside
  the known volume roots (drive letters, UNC shares, /media/<user>, /run/media/<user>, /mnt, /net,
  /Volumes) is covered per folder. An attempt that never settles keeps its place for the session.
  Changes are shown and saved per round, never per file. The spacing and what an answer means
  (`classifyRecheckAnswer`) live in `core/retry.js`, the rounds in `ui/retry.js`, the file check in
  `recheckMediaFile` in `lib/scan.js`.
- **Unshowable files**: a file that fails to load is missing only when the main process says it is
  gone. One that is still there cannot be decoded (an HEVC video, a damaged image) and gets an amber
  dashed tile with its own hint until a retry decodes it. It is not counted as missing, and its menu
  keeps every action that does not need to show it.
- **Load error in the hint**: the hint of a missing or unshowable item ends with what was
  found, as reported. A video contributes the player's message (`MediaError.message`; an
  image says nothing). The main process contributes its report on the file: the stat or read
  error with its path, or the size and the first bytes with the format they announce when the
  file reads fine, since then the content itself is the problem (a HEIF file named .jpg, a
  saved error page). The report is only ever made for a path with a media extension.
  `lib/inspect.js` writes the report, `describeLoadError` in `core/text.js` joins the lines.
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
- **Removal questions** (clear all, clear missing, remove the selection) are native message
  boxes whose buttons name the outcome ("Remove all 12 items" / "Keep"); Keep is the default, so
  Enter and Escape both keep. The renderer asks through the `confirm-removal` channel.
- **Empty state**: the text on an empty collage carries an Add media files button, the same
  action as the Files menu entry, so a first start has something to click.
- **Empty drops**: a drop that resolves to no paths is explained when it carried links or a
  file with no location on disk (an image dragged out of a browser), and ignored otherwise.
- **Async library mutations** (load, add batches, a retry's swap to content that changed under
  its path) run on one promise queue so overlapping drops cannot insert the same hash twice.
- **Toolbar**: three dropdown menus on the left (Files: add files, add a folder, the panel
  toggle; Collage: shuffle, sort by name, path or type, columns, clear; Scroll: the
  auto-scroll toggle, its settings and the scrollbar toggle), fullscreen and help on the right
  next to the floating toolbar toggle. `ui/dropdown.js` opens one menu at a time, not modal; a
  button in a menu closes it unless it or a row above it is marked `keep-open` (shuffle, the
  column stepper, the settings rows). A button marked `data-submenu` unfolds the group it names
  inside the menu (the sort orders), folded again each time the menu opens. The bar wraps onto
  a second row rather than overflow, and media queries drop the hint and counters first.
- **Escape order**: toolbar dropdown, context menu, lightbox, help/about overlays, selection,
  fullscreen. One keydown handler in `shortcuts.js` walks that ladder and closes exactly one
  layer.
- **File panel list**: rebuilt only when what it shows changes (sort mode, and each entry's
  hash, path, type, file problem and load error in order); other renders leave its DOM alone.
- **Progress**: long-running work (preparing the library, adding a batch) reports through
  `startJob` in `status.js`, one line per job in the status area stacked above the toast at the
  bottom centre. Toasts carry one-off messages; a sticky toast is reserved for a warning about
  a condition that lasts the session, such as a blocked save, and progress never goes through it.
  An add expands every dropped folder before it reads a single file, counting the media files
  found after every path it walks, media or not, so the `reading files X/Y` total that follows
  covers the whole drop and never grows; a drop with no media skips the reading line. The main
  process sends the first event of each phase and the last read, and at most one other per
  100 ms, so a drop of hundreds of thousands of files does not flood the renderer.
- **Menu**: removed on Linux and Windows so the app owns its shortcuts (notably F11). macOS keeps
  a minimal one from `lib/appmenu.js`: the app menu (about, hide, quit), Edit with the standard
  roles so Cmd+C, V and A work in text fields, and Window (minimize, zoom, close). It has no View
  menu, so fullscreen and every other shortcut stay with the renderer. F12 opens devtools when
  unpackaged.
- **Platform keys**: on macOS Cmd toggles a click into the selection (Ctrl+click is a right-click
  there), Ctrl+Cmd+F toggles fullscreen next to F11, and Backspace, the key labelled delete,
  removes the selection like Delete. The help, the fullscreen tooltip and the panel hint name the
  keys of the running platform; the rules are in `core/keys.js` and `core/text.js`.
- **Opening from Finder**: files and folders dropped on the Dock icon or opened with the app
  from Finder arrive in main as `open-file` events, possibly before the window exists. Main holds
  them until a page has loaded and sends each Finder action's paths over `open-paths` as one
  batch, which the renderer adds like a drop, and the window comes forward. The app outlives its
  last window as macOS apps do; the Dock icon or such a drop opens a new one.
- **Window bounds**: the window's normal bounds and whether it was maximized are written to
  `window.json` in `userData` when it closes and restored at the next start, the size capped to
  the display's work area. Saved bounds that no longer put part of the window on any display
  (a monitor unplugged) are dropped for the default size, which the window manager places.
  A Wayland compositor ignores the position and places the window itself.
- **Single instance**: a second launch exits at once and the running instance brings its
  window forward (or opens one when it has none), so two instances can never take turns writing
  `library.json`.
- **GPU fallback**: three GPU process crashes relaunch the app with hardware acceleration
  disabled, passing an internal switch to the new process. Nothing is written to disk and
  there are no user-facing flags, so every normal start tries hardware acceleration again.
  An AppImage is relaunched through the image named in `APPIMAGE`, because the mount it
  runs from is gone once the process exits.

## Conventions

- `pnpm format` and `pnpm lint` before committing.
- `try { ... } catch {}` is the idiom for best-effort cleanup.
- Build DOM with `textContent` and `createElement`; `innerHTML` only with constant markup.
- Comments say why, briefly. No ticket references, no history of earlier approaches.

## Testing

- `pnpm test`: unit tests with `node:test`, no display needed.
- `pnpm test:e2e`: boots the real app with a throwaway profile, generates fixtures in code (video
  only when ffmpeg is installed) and drives the renderer via `executeJavaScript`. Each file in
  `test/e2e/cases/` is one feature and exports `{ name, run(ctx) }`. Before every case the harness
  waits for library work the previous case left in flight, then resets the app (empty library,
  nothing open or selected, two columns, collage order, the scrollbar shown, default speed and
  Scroll settings, the file panel and toolbar shown with the count breakdown closed, not
  fullscreen, the starting window size,
  scrolled to the top, the removal question answering yes), so a case loads what it needs
  (`ctx.loadFixtures()`), turns waits into checks (`ctx.waitFor` resolves to a boolean) and never
  cleans up. The retry timer is stopped after every page load, so a file a case flags by hand is
  only looked at again by a round the case runs. A case that needs the startup path seeds a saved
  library and restarts the renderer with `ctx.restartWith(library)`, which takes an item list or a
  string written as the file's raw content; `ctx.reloadRenderer()` restarts against whatever is on
  disk. `pnpm test:e2e panel drag` runs only the named cases, in file order. The harness sets
  `COLLAGER_E2E=1`; main then loads the page with `?e2e` and `app.js` exposes every module export on
  `window.collagerTest`, which the snippets reach as `T`; every snippet also gets `press(key)`,
  which fires a keydown on the window.
- Run the e2e suite locally as `pnpm test:e2e`, straight on the desktop: the app window opens
  and closes on the current display during the run, which is fine. `pnpm start` and
  `pnpm test:e2e` go through `scripts/electron.js`, which drops `ELECTRON_RUN_AS_NODE` (VS Code
  terminals export it, and with it the Electron binary runs as plain Node) and the GTK paths the
  VS Code snap exports (with them Chromium's GTK integration fails and the window comes up
  without a title bar). `xvfb-run -a` is only for headless machines and CI, and is not installed
  on development machines.
- CI runs the suite on an Ubuntu runner under `xvfb-run` and on Windows and macOS (Apple
  silicon) runners, where the app opens on the runner's desktop session and ffmpeg comes from
  Chocolatey and Homebrew. The Linux job makes Chromium's setuid sandbox helper root-owned
  because Ubuntu 24.04 runners restrict unprivileged user namespaces. A case that deletes a file
  first discards the tile showing it and retries the delete: Windows refuses to remove a file the
  video element still holds open, and the profile directory stays locked the same way, so the
  harness treats its own cleanup as best effort.

## Packaging

electron-builder config is the `build` field in `package.json`: AppImage, NSIS, and DMGs for
x64 and arm64, only `src/**` bundled, icon from `build/icon.png` (1024px; electron-builder
makes the macOS icon set from it). `desktopName` plus `syncDesktopName` keeps the Linux desktop
entry matched to the running window. The macOS bundle is signed ad hoc by the afterPack hook in
`build/afterpack.js` (outside `files`, so not bundled), because Apple silicon will not run a
bundle whose signature electron-builder's edits broke. There is no Developer ID
(`identity: null`), so Gatekeeper still blocks a downloaded copy until the user lets it through;
the README says how. The macOS bundle declares the media extensions as documents it can view
(`mac.fileAssociations`, rank Alternate) and folders (`public.folder` in `mac.extendInfo`, rank
None), which is what lets Finder and the Dock hand them to the app; the extension list mirrors
`MEDIA_EXTS` in `lib/scan.js` and changes with it.

Releases are cut by pushing a `vX.Y.Z` tag that matches the `version` in `package.json` and
points at a commit on `main`; both are checked before anything is built. The workflow's tag
filter takes those three numbers only, so a suffixed tag such as `v0.2.0-rc1` starts nothing. The release workflow
calls the lint, format, unit and e2e workflows as reusable workflows, which is what their
`workflow_call` trigger is for, builds the installers, and publishes a GitHub Release with
them, a `SHA256SUMS` file and auto-generated notes. The Linux build job also starts
the freshly built AppImage once under a virtual display with `COLLAGER_SMOKE=1`, which makes
main exit 0 once the renderer has loaded the library and 1 after a minute without, so a path
that only breaks inside the packaged app fails the release before anything is uploaded. The
Windows build job does the same with the unpacked build in `dist/win-unpacked`, which is what
the installer packs; the installer itself is not run. The macOS build job builds both DMGs on
an Apple silicon runner and smoke-runs the arm64 app in `dist/mac-arm64`; the DMGs are not
mounted. The release is a draft until every asset is uploaded, and the publish job deletes its
own draft when it fails or is cancelled, so a failed run normally leaves nothing behind but the
tag. A tag that already has a release, draft included, is refused, so a draft left behind by a
lost runner has to be deleted by hand before the run is retried. The installer file names come
from the `artifactName` fields; the build job's upload globs and the publish job's patterns
match them on everything except the architecture part (electron-builder writes `x86_64` for
AppImage and `x64` for NSIS), where the publish job names `x64` and `arm64` for the two DMGs,
and the README spells out the names the runners produce. Change all four together.
`build.appId` doubles as the Windows AppUserModelID: electron-builder stamps it on the
shortcuts and `main.js` sets the same literal on the running process, so the taskbar groups
and pins them together. electron-builder strips the `build` field from the packaged
`package.json`, so main must not read it back at runtime.
