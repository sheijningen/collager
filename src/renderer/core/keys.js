/* Pure keyboard rules for the global shortcuts. */

const RANGE_INPUT_KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown'
];

/**
 * Whether the focused element needs this key for itself, so a global
 * shortcut must not steal it: typing in a text field, Space or Enter on a
 * button, Space on a checkbox or radio, arrows and paging on a slider.
 *
 * @param {{tagName?: string, type?: string} | null} target the event target
 * @param {string} key the KeyboardEvent key
 */
export function targetConsumesKey(target, key) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'BUTTON') return key === ' ' || key === 'Enter';
  if (tag === 'INPUT') {
    const type = target.type;
    if (type === 'checkbox' || type === 'radio') return key === ' ';
    if (type === 'range') return RANGE_INPUT_KEYS.includes(key);
    return true; // text-like inputs consume everything
  }
  return false;
}
