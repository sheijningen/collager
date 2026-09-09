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
                     menu placement, count text
src/renderer/ui/     DOM modules, ES modules with app.js as the entry
src/renderer/package.json   type: module, so Node reads core/ the same way in tests
test/main, test/renderer   unit tests mirroring src/main/lib and src/renderer/core
test/e2e/            boots the real app and drives it: run.js harness, fixtures.js, cases/*.js
build/               icon (SVG source, PNG export for electron-builder)
docs/                README media
```

- The renderer is ES modules. `ui/app.js` is the entry (`index.html` loads only it) and imports
  every other module, which is what wires their handlers up. Shared mutable state lives in
  `ui/state.js`: `state.items`, `state.selectionAnchor` and the `selected` set; other modules
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
  and makes the same media under two names one item.
- **Resource limiting**: tiles are placeholders until within 800px of the viewport; the
  `<img>`/`<video>` is created then and torn down again once far away.
- **Audio**: videos are muted in the collage; the lightbox's native controls are the only place
  to unmute.
- **Persistence**: `library.json` in `userData`, saves serialized and atomic (temp file plus
  rename), a corrupt file is copied to `library.json.corrupt` and the app starts empty. Only
  path, hash, type and dimensions are stored; URL and missing flag are derived at load.
- **Missing files** stay in the library as red dashed tiles; re-adding the same content from a
  new location repairs the entry.
- **Settings** live in `localStorage` under the `collager.` prefix via the prefs module.
- **Async library mutations** (load, add batches) run on one promise queue so overlapping drops
  cannot insert the same hash twice.
- **Escape order**: context menu, lightbox, help/about overlays, selection, fullscreen. One
  keydown handler in `shortcuts.js` walks that ladder and closes exactly one layer.
- **Menu**: removed on Linux and Windows so the app owns its shortcuts (notably F11). F12 opens
  devtools when unpackaged.
- **GPU fallback**: three GPU process crashes write a `disable-gpu` file to `userData` and
  relaunch without hardware acceleration. `--gpu` clears it, `--no-gpu` forces it once.

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
  case the harness resets the app (empty library, nothing open or selected, default columns,
  speed, sort and panels, `confirm()` answering yes), so a case loads what it needs
  (`ctx.loadFixtures()`), turns waits into checks (`ctx.waitFor` resolves to a boolean) and
  never cleans up. `pnpm test:e2e panel drag` runs only the named cases, in file order. The
  harness sets `COLLAGER_E2E=1`;
  main then loads the page with `?e2e` and `app.js` exposes every module export on
  `window.collagerTest`, which the snippets reach as `T`. Needs a display:
  `xvfb-run -a pnpm test:e2e` on headless machines.
- `ELECTRON_RUN_AS_NODE` must be unset (VS Code terminals export it, which makes
  `require('electron')` return a path). Use `env -u ELECTRON_RUN_AS_NODE`.
- The CI e2e job makes Chromium's setuid sandbox helper root-owned because Ubuntu 24.04
  runners restrict unprivileged user namespaces.

## Packaging

electron-builder config is the `build` field in `package.json`: AppImage and NSIS, only
`src/**` bundled, icon from `build/icon.png`. `desktopName` plus `syncDesktopName` keeps the
Linux desktop entry matched to the running window.
