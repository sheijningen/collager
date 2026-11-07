# Changelog

## [0.3.0] - 2026-11-07

### Added

- macOS support: DMGs for Apple silicon and Intel Macs, files and folders opened from Finder
  or dropped on the Dock icon, Cmd shortcuts (Cmd+click toggles a selection, Ctrl+Cmd+F
  toggles fullscreen, Backspace removes like Delete) and a minimal application menu, so Cmd+Q,
  C and V work.
- SVG images and MKV videos. A vector image gets a light backdrop and scales to the window
  when maximized.
- **Sort collage by** name, path or type in the Collage menu, next to Shuffle. The order is
  saved, like a shuffle.
- **Hide the scrollbar** in the Scroll menu; the tiles take the width the scrollbar held.
- The window opens at the size and position it was closed at, maximized if it was, as long as
  that spot is still on a display.
- Missing files and files that cannot be shown are checked again now and then, with the waits
  spreading out for a file that is not about to come back, so a drive that is plugged back in
  or a file that is restored shows again without a restart.
- The hint of a missing or unshowable file ends with what the player and the operating system
  reported: the error, or the size and the format the first bytes announce, which tells a HEIF
  file named `.jpg` or a saved error page apart from a file that is gone.

### Changed

- Auto-scroll with **Restart at the end** carries on from the top without a jump: the next
  loop is laid out below the end and the collage wraps seamlessly, re-shuffled first when
  **Shuffle on restart** is on.
- Dropping folders counts their media files before any is read, so the progress total covers
  the whole drop from the start instead of growing while the folders are walked.
- Electron 43.8.

### Fixed

- Picking a sort order in the file panel with the mouse left the list's select focused, after
  which the keyboard shortcuts were dead until a click elsewhere.
- Pressing A or Shift+A with the Files menu open left focus on the menu button, so the next
  Space opened the menu instead of toggling auto-scroll.
- Closing the app right after adding files could cut the save short and lose that batch. A
  quit now waits for saves in progress.
- A file re-added from a new location is measured again instead of keeping the placeholder
  size of its missing tile.
- A file on a mount that never answers no longer holds up the start: its dimension read gives
  up after twenty seconds and is tried again next time.

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
