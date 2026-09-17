# Collager

A desktop media collage viewer for Linux and Windows. Drop in images
(PNG/JPEG/WebP), GIFs and videos (MP4/WebM) and see them all together as one
scrollable, tightly packed collage. GIFs and videos loop forever; videos are
muted.

![Collager auto-scrolling a collage of photos, a GIF and a video](docs/demo.gif)

<sub>Demo media: public-domain images and video from the NASA image library, plus CC0
photos from Wikimedia Commons.</sub>

## Install

Download the latest installer from the
[releases page](https://github.com/sheijningen/collager/releases/latest):

- **Linux**: `Collager-<version>-linux-x86_64.AppImage`. Make it executable
  (`chmod +x`) and run it. No installation needed. AppImages need `libfuse2`,
  which some current distributions no longer ship by default; without it, run
  `./Collager-<version>-linux-x86_64.AppImage --appimage-extract-and-run`.
- **Windows**: `Collager-<version>-windows-x64-setup.exe`. Run the installer;
  Collager appears in the Start menu. The installer is not code-signed, so
  Windows shows an "unknown publisher" warning that you have to click through.

Every release also carries a `SHA256SUMS` file; `sha256sum -c SHA256SUMS` in the download
folder checks the installers against it.

If the graphics driver keeps crashing, Collager restarts itself in a safer display mode
for the rest of that session. Starting it again always tries the normal mode first.

## Usage

- **Add media**: drag and drop files or folders anywhere in the window (folders
  are scanned recursively), pick **Add media files** or **Add a folder** from
  the **Files ▾** menu, or click the **Add media files** button on an empty
  collage. Duplicate content is detected by file hash, whatever the
  file name. Media dragged straight out of a web page cannot be added: save it to
  the computer first.
- **Remove**: hover a tile and click the ✕.
- **Reorder**: drag a tile onto another tile to move it there. The order
  persists and is what shuffle randomizes.
- **Files menu**: **Files ▾** holds **Add media files**, **Add a folder** and
  the file panel toggle.
- **Collage menu**: **Collage ▾** holds **Shuffle**, which re-shuffles and
  re-packs the collage, the **Columns** stepper (1 to 8), and **Clear all**,
  which removes every item after confirmation.
- **File panel**: a sidebar, hidden until opened from the Files menu or with P,
  listing every file, sortable by collage order, name, path or type. A counter
  above the list gives the item total and expands on click into the split by
  file extension. Clicking an entry scrolls to it; clicking a tile highlights
  its entry. Ctrl-click toggles, Shift-click selects a range, **Remove (N)** or
  Delete removes the selection, Escape clears it.
- **Item menu**: right-click a tile or a panel entry to maximize it, open it
  in the system's default app, copy its path (or, for still images, the image
  itself), show it in the file manager, or remove it. For a missing file the
  actions that need it are greyed out, bar **Show in folder**. When the item is
  part of a multi-selection the menu offers only **Remove N selected**, which
  takes the whole selection: the other actions name a single file.
- **Auto-scroll**: **Scroll ▾** holds **Start auto-scroll**, which scrolls the
  collage continuously, and its settings: the speed slider (10 to 600 px/s),
  **Restart at the end** to jump back to the top, **Shuffle on restart**, and
  **Keep the display awake** while it runs. The Scroll button is highlighted
  while auto-scroll runs. Manual scrolling moves the auto-scroll position.
- **Maximize**: double-click a tile to view it enlarged. Videos get controls
  there, so you can unmute. Esc or click to close.
- **Fullscreen**: the ⛶ button at the right of the toolbar, or F11. Esc also
  exits when nothing else consumes it.
- **Toolbar**: the chevron in the top-right corner hides and shows the toolbar.
  With fullscreen and auto-scroll this gives a clean kiosk or wall mode.
- **Missing files** (moved, deleted, drive disconnected) show as red dashed
  tiles and red panel entries, and the Collage menu shows a ⚠ marker. Its
  **⚠ Clear N missing** entry removes them all; re-adding the same content from
  a new location repairs the entry. The item menu's **Show in folder** still
  works for one, and opens the folder the file was in; if that folder is gone
  as well, it says so.
- **About**: click the "Collager" title or press I.

The collection and all settings persist between launches. Starting Collager while it is
already running brings the open window forward instead of opening a second one.

## Keyboard shortcuts

Press **?** (or F1) in the app for this list.

| Key          | Action                                                                |
| ------------ | --------------------------------------------------------------------- |
| `Space`      | Start / stop auto-scroll                                              |
| `,` / `.`    | Auto-scroll slower / faster                                           |
| `S`          | Shuffle the collage                                                   |
| `A`          | Add media files                                                       |
| `Shift+A`    | Add a folder                                                          |
| `P`          | Show / hide the file panel                                            |
| `T`          | Show / hide the toolbar                                               |
| `-` / `+`    | Fewer / more columns                                                  |
| `F` / `F11`  | Toggle fullscreen                                                     |
| `Del`        | Remove the selected items                                             |
| `Esc`        | Close overlays / clear the selection / exit fullscreen                |
| `I`          | About Collager                                                        |
| `?` / `F1`   | Show the shortcuts overlay                                            |
| Double-click | Maximize a tile                                                       |
| Right-click  | Item menu: maximize, open, copy path or image, show in folder, remove |

## Development

Requires [pnpm](https://pnpm.io/installation).

```bash
pnpm install
pnpm start          # run from source
pnpm test           # unit tests
pnpm test:e2e       # boots the real app; needs a display, ffmpeg optional
pnpm lint           # eslint
pnpm format         # prettier (format:check to verify)
```

Electron downloads its binary on first run, so the first `pnpm start` takes a
while.

Installers can be built locally too:

```bash
pnpm dist:linux   # AppImage
pnpm dist:win     # NSIS installer; on Linux this needs wine
```

Architecture, design decisions and conventions are in [CLAUDE.md](CLAUDE.md).

### Releasing

Bump `version` in `package.json` on `main`, push that commit, then push a
matching tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The release workflow checks the tag against `package.json`, runs lint, format,
unit and e2e tests, builds the Linux AppImage and the Windows installer, and
publishes a GitHub Release with both plus `SHA256SUMS` and auto-generated
notes.

## License

[Apache 2.0](LICENSE), © Stefan Alexander van Heijningen.
