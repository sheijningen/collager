# Changelog

## [0.2.0] - 2026-09-19

### Added

- Prebuilt installers on the GitHub releases page: a Linux AppImage and a Windows
  installer, with a `SHA256SUMS` file to check them against.
- Item menu on right-click, for tiles as well as file panel entries.
- **Add a folder** in the Files menu, next to the file picker.
- Arrow keys step through the collage while an item is maximized.
- Progress lines for long-running work in a status area above the toast.
- Better feedback on file handling: for unreadable files, unreadable folders and failed added files.
- **Add media files** button on the empty collage.
- Only one instance runs at a time; a second launch focuses the running window.

### Changed

- The toolbar is reorganized into **Files**, **Collage** and **Scroll** dropdown menus.
- Videos are hashed from samples instead of the whole file, which makes adding and
  starting up much faster.
- Confirmation questions added for file removals.
- The file panel always starts closed.
- The GPU fallback lasts one session; the `--gpu` and `--no-gpu` flags are gone.
- Smoother scrolling of large collages through contained tile decoding and painting.

### Fixed

- The library file can no longer be lost to a crash, an unreadable file or a save
  before the library has loaded.
- Adding hundreds of thousands of files no longer crashes the application.
- Shift-click on a tile now selects the range in collage order.
- Letter shortcuts now work with Caps Lock on.
- An AppImage now relaunches correctly after GPU crashes.
- On Windows the taskbar now groups the shortcut with the running window.
- A failed file dialog or About request is now reported instead of dropped silently.
- Clicking a toolbar button no longer takes the spacebar away from auto-scroll.

## [0.1.0] - 2026-09-09

First release.
