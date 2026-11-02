/* Pure keyboard rules for the global shortcuts. */

export const RANGE_INPUT_KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown'
];

/** The keys that scroll a page: Space plus the arrows, paging, Home and End. */
export const SCROLL_KEYS = [' ', ...RANGE_INPUT_KEYS];

/**
 * The key a letter shortcut is matched on: a single character is lowercased,
 * so Caps Lock does not switch the letter shortcuts off, while named keys
 * (F1, Escape) pass unchanged. Shift is read from the modifier flag instead.
 *
 * @param {string} key the KeyboardEvent key
 */
export function normalizeShortcutKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

/**
 * Whether the focused element needs this key for itself, so a global
 * shortcut must not steal it: typing in a text field, Space or Enter on a
 * button, Space on a checkbox or radio, arrows and paging on a slider, Space
 * and arrows on a focused video (play, pause and seek in its controls).
 *
 * @param {{tagName?: string, type?: string} | null} target the event target
 * @param {string} key the KeyboardEvent key
 */
export function targetConsumesKey(target, key) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'BUTTON') return key === ' ' || key === 'Enter';
  if (tag === 'VIDEO') return key === ' ' || RANGE_INPUT_KEYS.includes(key);
  if (tag === 'INPUT') {
    const type = target.type;
    if (type === 'checkbox' || type === 'radio') return key === ' ';
    if (type === 'range') return RANGE_INPUT_KEYS.includes(key);
    return true; // text-like inputs consume everything
  }
  return false;
}

/**
 * Whether a keydown toggles fullscreen: F11 without modifiers, and on macOS
 * also Ctrl+Cmd+F, the system's own binding, since F11 there belongs to the
 * desktop unless the function keys are set to standard.
 *
 * @param {{key: string, ctrlKey: boolean, altKey: boolean, shiftKey: boolean, metaKey: boolean}} event
 * @param {string} platform process.platform
 */
export function isFullscreenKey(event, platform) {
  const { key, ctrlKey, altKey, shiftKey, metaKey } = event;
  if (key === 'F11') return !ctrlKey && !altKey && !shiftKey && !metaKey;
  if (platform !== 'darwin' || normalizeShortcutKey(key) !== 'f') return false;
  return ctrlKey && metaKey && !altKey && !shiftKey;
}

/** The key the help names for fullscreen next to F. */
export function fullscreenKeyLabel(platform) {
  return platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11';
}

/** The key the help names for removing the selection. */
export function removeKeyLabel(platform) {
  return platform === 'darwin' ? 'Del / Backspace' : 'Del';
}

/**
 * Whether a key removes the selection: Delete, and on macOS also Backspace,
 * which is the key labelled delete there.
 */
export function isRemoveKey(key, platform) {
  if (key === 'Delete') return true;
  return platform === 'darwin' && key === 'Backspace';
}
