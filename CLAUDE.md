# Collager

Desktop media collage viewer for Linux and Windows: images (PNG/JPEG/WebP), GIFs and videos
(MP4/WebM) as one scrollable masonry collage.

## Stack

Electron plus plain JS, HTML and CSS. No bundler, no framework, no runtime dependencies beyond
Electron. Keep it that way. Electron because Chromium ships identical media codecs on Linux
and Windows. macOS is not a target; the `darwin` branches only keep the app quittable there.

## Layout

```
src/main/            main process: window, IPC, menu, GPU fallback
src/main/lib/        pure Node logic: scanning, hashing, library persistence
src/renderer/core/   pure logic, no DOM: layout, selection, prefs
src/renderer/ui/     DOM modules, classic scripts sharing one global scope
test/main, test/renderer   unit tests mirroring src/main/lib and src/renderer/core
test/e2e/            boots the real app and drives it
build/               icon (SVG source, PNG export for electron-builder)
docs/                README media
```

- The script order in `index.html` is load-bearing: layout, selection, prefs, state, collage,
  panel, tiledrag, lightbox, autoscroll, shortcuts, app. Earlier declarations are visible to
  later scripts; functions declared later are callable at runtime. eslint cannot check
  cross-file identifiers in `ui/` (`no-undef` is off there), so verify them by hand.
- `core/` modules are UMD-style (`window.Collager*` in the renderer, `module.exports` under
  Node) and must stay free of DOM access.
- The renderer is isolated (`contextIsolation`, no `nodeIntegration`, CSP in `index.html`).
  Main-process capabilities are exposed only through an IPC channel plus a `window.api` entry
  in the preload script.

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
- **Escape order**: context menu, lightbox, help/about overlays, selection, fullscreen.
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
  Needs a display: `xvfb-run -a pnpm test:e2e` on headless machines.
- `ELECTRON_RUN_AS_NODE` must be unset (VS Code terminals export it, which makes
  `require('electron')` return a path). Use `env -u ELECTRON_RUN_AS_NODE`.
- The CI e2e job makes Chromium's setuid sandbox helper root-owned because Ubuntu 24.04
  runners restrict unprivileged user namespaces.

## Packaging

electron-builder config is the `build` field in `package.json`: AppImage and NSIS, only
`src/**` bundled, icon from `build/icon.png`. `desktopName` plus `syncDesktopName` keeps the
Linux desktop entry matched to the running window.

Releases are cut by pushing a `vX.Y.Z` tag that matches the `version` in `package.json`. The
release workflow reuses the check workflows (`lint.yml`, `format.yml`, `test.yml`, `e2e.yml`,
each declaring `workflow_call`), builds both installers, and publishes a GitHub Release with
them, a `SHA256SUMS` file and auto-generated notes. The reused workflows are resolved from the
tagged commit, so a tag has to point at a commit that includes them. The installer file names
come from the `artifactName` fields; the publish job matches them on everything except the
architecture part (electron-builder writes `x86_64` for AppImage and `x64` for NSIS), and the
README spells out the names the x64 runners produce. Change all three together.
