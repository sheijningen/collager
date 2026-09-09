/* ---------------- toolbar dropdown menus ----------------
 * Secondary controls live in a popup under their toolbar button, which keeps
 * the bar short enough for narrow windows. A popup is not modal: shortcuts
 * keep working and auto-scroll keeps running, so its speed can be tuned
 * while watching the effect. At most one popup is open at a time.
 */

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
  // measure at a neutral position (stale left/top from a previous opening
  // would cap shrink-to-fit width and skew the measurement), then hang the
  // popup off the button's bottom-left corner, shifted up or left as far as
  // needed to stay on screen (a very short window gets a scrolling popup)
  popup.style.left = '0px';
  popup.style.top = '0px';
  popup.hidden = false;
  const anchor = trigger.getBoundingClientRect();
  const rect = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8))}px`;
  popup.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - rect.height - 8))}px`;
  // focus the popup itself, not its first control: a focused button would
  // claim Space and Enter, which the shortcuts are meant to keep
  popup.focus();
}

export function closeDropdown() {
  if (!openTrigger) return;
  const popup = popups.get(openTrigger);
  // a keyboard user closing the popup continues from its button
  if (popup.contains(document.activeElement)) openTrigger.focus();
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
  // an action menu closes as soon as an item is chosen; capture phase so the
  // menu is gone before the item's handler opens a confirm dialog
  if (popup.classList.contains('action-menu')) {
    popup.addEventListener(
      'click',
      (e) => {
        if (e.target.closest('button')) closeDropdown();
      },
      true
    );
  }
  // tabbing out of the popup closes it, otherwise it would stay painted
  // over the toolbar while focus is elsewhere
  popup.addEventListener('focusout', (e) => {
    if (openTrigger !== trigger) return;
    const next = e.relatedTarget;
    if (!next || popup.contains(next) || trigger.contains(next)) return;
    closeDropdown();
  });
}

// dismiss on outside click, focus loss or resize (the popup is
// position:fixed, so a resize can move the toolbar button out from under it);
// a press on the open trigger is left to its click handler, which toggles
window.addEventListener('pointerdown', (e) => {
  if (!openTrigger) return;
  if (openTrigger.contains(e.target) || popups.get(openTrigger).contains(e.target)) return;
  closeDropdown();
});
window.addEventListener('blur', closeDropdown);
window.addEventListener('resize', closeDropdown);
