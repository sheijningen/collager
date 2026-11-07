const fs = require('fs');
const path = require('path');

const WINDOW_STATE_FILE = 'window.json';
const DEFAULT_SIZE = { width: 1280, height: 860 };
const MIN_SIZE = 100; // px per side; a smaller saved size is taken as garbage
const VISIBLE_PX = 64; // this much of the window on a display counts as its display

/* The saved state in `raw`, the file's content, as `{ x, y, width, height,
 * maximized }`, or null when it holds none. */
function parseWindowState(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { x, y, width, height, maximized } = parsed;
  if (![x, y, width, height].every(Number.isInteger)) return null;
  if (width < MIN_SIZE || height < MIN_SIZE) return null;
  return { x, y, width, height, maximized: maximized === true };
}

function overlap(first, second, axis, extent) {
  const start = Math.max(first[axis], second[axis]);
  const end = Math.min(first[axis] + first[extent], second[axis] + second[extent]);
  return end - start;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* The bounds to open the window with. The saved ones (see parseWindowState)
 * when they put at least VISIBLE_PX of the window on one of `workAreas`,
 * sized and placed to lie within that work area, so the title bar is never
 * above every display; otherwise the default size alone, which leaves the
 * placement to the window manager. */
function fitBounds(saved, workAreas) {
  if (!saved) return { ...DEFAULT_SIZE };
  const area = workAreas.find(
    (candidate) =>
      overlap(saved, candidate, 'x', 'width') >= VISIBLE_PX &&
      overlap(saved, candidate, 'y', 'height') >= VISIBLE_PX
  );
  if (!area) return { ...DEFAULT_SIZE };
  const width = Math.min(saved.width, area.width);
  const height = Math.min(saved.height, area.height);
  return {
    x: clamp(saved.x, area.x, area.x + area.width - width),
    y: clamp(saved.y, area.y, area.y + area.height - height),
    width,
    height
  };
}

/* Reads and writes the state file in the directory `getDir` returns. Both are
 * best effort, and the write is in place: a torn file parses to nothing and
 * costs the default size, no more. */
function createWindowStateStore(getDir) {
  const file = () => path.join(getDir(), WINDOW_STATE_FILE);
  return {
    load() {
      try {
        return parseWindowState(fs.readFileSync(file(), 'utf8'));
      } catch {
        return null;
      }
    },
    save(state) {
      try {
        fs.mkdirSync(getDir(), { recursive: true });
        fs.writeFileSync(file(), JSON.stringify(state));
      } catch {}
    }
  };
}

module.exports = { parseWindowState, fitBounds, createWindowStateStore, DEFAULT_SIZE };
