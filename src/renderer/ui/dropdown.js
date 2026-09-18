/* ---------------- toolbar dropdown menus ----------------
 * Secondary controls live in a popup under their toolbar button, which keeps
 * the bar short enough for narrow windows. A popup is not modal: shortcuts
 * keep working and auto-scroll keeps running, so its speed can be tuned
 * while watching the effect. At most one popup is open at a time.
 */

import { showPopupAt } from './popup.js';

const DROPDOWN_GAP = 4; // px between the button and its popup

const triggers = [...document.querySelectorAll('#toolbar [data-menu]')];
const popups = new Map(triggers.map((trigger) => [trigger, popupFor(trigger)]));

function popupFor(trigger) {
  const popup = document.getElementById(trigger.dataset.menu);
  if (!popup) throw new Error(`no popup for toolbar menu ${trigger.dataset.menu}`);
  return popup;
}

let openTrigger = null;

/** id of the open popup, or null */
export function openDropdownId() {
  return openTrigger ? openTrigger.dataset.menu : null;
}

export function openDropdown(trigger) {
  closeDropdown();
  const popup = popups.get(trigger);
  openTrigger = trigger;
  trigger.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
  // the popup hangs off the button's bottom-left corner (a very short window
  // gets a scrolling popup)
  const anchor = trigger.getBoundingClientRect();
  showPopupAt(popup, anchor.left, anchor.bottom + DROPDOWN_GAP);
  // focus the popup itself, not its first control: a focused button would
  // claim Space and Enter, which the shortcuts are meant to keep
  popup.focus();
}

/* `keepFocus` false drops focus instead of handing it to the menu button: a
 * focused button would claim Space and Enter, which the shortcuts are meant
 * to keep. It is the case for a pointer-driven item click, where nothing
 * expects focus back. */
export function closeDropdown({ keepFocus = true } = {}) {
  if (!openTrigger) return;
  const popup = popups.get(openTrigger);
  if (popup.contains(document.activeElement)) {
    // a keyboard user closing the popup continues from its button
    if (keepFocus) openTrigger.focus();
    else document.activeElement.blur();
  }
  popup.hidden = true;
  openTrigger.classList.remove('open');
  openTrigger.setAttribute('aria-expanded', 'false');
  openTrigger = null;
}

export function toggleDropdown(trigger) {
  if (openTrigger === trigger) closeDropdown();
  else openDropdown(trigger);
}

for (const [trigger, popup] of popups) {
  trigger.addEventListener('click', () => toggleDropdown(trigger));
  // choosing an action closes the menu; capture phase so the menu is gone
  // before the action's handler opens a confirm dialog. Controls marked
  // keep-open (shuffle, the column stepper, the settings rows) leave it open,
  // so their effect on the collage can be watched and the click repeated.
  // A click without a detail count was keyboard activation (Enter or Space
  // on the focused item), and only then does focus belong back on the button.
  popup.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest('button');
      if (button && !button.closest('.keep-open')) closeDropdown({ keepFocus: event.detail === 0 });
    },
    true
  );
  // tabbing out of the popup closes it, otherwise it would stay painted
  // over the toolbar while focus is elsewhere
  popup.addEventListener('focusout', (event) => {
    if (openTrigger !== trigger) return;
    const next = event.relatedTarget;
    if (!next || popup.contains(next) || trigger.contains(next)) return;
    closeDropdown();
  });
}

// dismiss on outside click, focus loss or resize (the popup is
// position:fixed, so a resize can move the toolbar button out from under it);
// a press on the open trigger is left to its click handler, which toggles
window.addEventListener('pointerdown', (event) => {
  if (!openTrigger) return;
  if (openTrigger.contains(event.target) || popups.get(openTrigger).contains(event.target)) return;
  closeDropdown();
});
// the handlers take no event: closeDropdown reads an options object
window.addEventListener('blur', () => closeDropdown());
window.addEventListener('resize', () => closeDropdown());
