/* ---------------- auto-scroll ----------------
 * Smoothly scrolls the collage at a configurable speed (px/s). At the end it
 * either stops, or — if "restart" is on — jumps back to the top, optionally
 * re-shuffling the collage first. Manual scrolling while active is adopted
 * as the new position instead of being fought.
 */

import { advanceAutoScroll } from '../core/autoscroll.js';
import { scroller, prefs } from './state.js';
import { shuffle } from './collage.js';
import { lightbox } from './lightbox.js';
import { ctxMenu } from './panel.js';
import { anyOverlayOpen } from './shortcuts.js';
import { tileDrag } from './tiledrag.js';

const autoScrollBtn = document.getElementById('btn-autoscroll');
export const speedSlider = document.getElementById('scroll-speed');
const loopCheckbox = document.getElementById('scroll-loop');
const shuffleCheckbox = document.getElementById('scroll-shuffle');
const awakeCheckbox = document.getElementById('scroll-awake');

export let autoScroll = false;
export let scrollSpeed = prefs.int('scrollSpeed', 80, 10, 600);
let restartAtEnd = prefs.bool('scrollRestart', true);
let shuffleOnRestart = prefs.bool('scrollShuffle', false);
let keepAwake = prefs.bool('keepAwake', true);

// the display-sleep blocker is held exactly while auto-scroll runs with the
// toggle on; every path that changes either state goes through this
function syncKeepAwake() {
  window.api.setKeepAwake(autoScroll && keepAwake);
}
let scrollRaf = null;
let lastTick = null;
let virtualTop = 0; // fractional scroll position (scrollTop rounds to ints)

/* Hands the tick a position set from elsewhere (scroll-to-item), so it does
 * not get read back as a manual scroll and fought. */
export function setAutoScrollPosition(top) {
  virtualTop = top;
}

function autoScrollTick(ts) {
  if (!autoScroll) return;
  scrollRaf = requestAnimationFrame(autoScrollTick);
  // hold position while the lightbox, context menu or a modal overlay is
  // open or a tile drag is in flight (scrolling under them would dismiss the
  // menu instantly / desync the drop target from the cursor)
  if (!lightbox.hidden || !ctxMenu.hidden || anyOverlayOpen() || (tileDrag && tileDrag.active)) {
    lastTick = ts;
    return;
  }
  if (lastTick === null) {
    lastTick = ts;
    return;
  }
  const elapsedSeconds = (ts - lastTick) / 1000;
  lastTick = ts;

  const { top, atEnd, scrollable } = advanceAutoScroll({
    virtualTop,
    scrollTop: scroller.scrollTop,
    maxScroll: scroller.scrollHeight - scroller.clientHeight,
    speed: scrollSpeed,
    elapsedSeconds
  });
  virtualTop = top;
  if (!scrollable) return; // nothing to scroll yet
  scroller.scrollTop = virtualTop;

  if (atEnd) {
    if (restartAtEnd) {
      if (shuffleOnRestart) shuffle();
      virtualTop = 0;
      scroller.scrollTop = 0;
    } else {
      setAutoScroll(false);
    }
  }
}

export function setAutoScroll(on) {
  if (on === autoScroll) return;
  autoScroll = on;
  autoScrollBtn.classList.toggle('active', on);
  autoScrollBtn.innerHTML = on ? '&#x23F8; Auto' : '&#x25B6; Auto';
  if (on) {
    virtualTop = scroller.scrollTop;
    lastTick = null;
    scrollRaf = requestAnimationFrame(autoScrollTick);
  } else if (scrollRaf !== null) {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = null;
  }
  syncKeepAwake();
}

autoScrollBtn.addEventListener('click', () => setAutoScroll(!autoScroll));

/* single setter for the speed, so the slider, the ,/. shortcuts and the
 * saved pref can never disagree */
export function setScrollSpeed(value) {
  scrollSpeed = Math.max(Number(speedSlider.min), Math.min(Number(speedSlider.max), value));
  speedSlider.value = String(scrollSpeed);
  prefs.set('scrollSpeed', scrollSpeed);
}

speedSlider.value = String(scrollSpeed);
speedSlider.addEventListener('input', () => {
  setScrollSpeed(parseInt(speedSlider.value, 10));
});

loopCheckbox.checked = restartAtEnd;
loopCheckbox.addEventListener('change', () => {
  restartAtEnd = loopCheckbox.checked;
  prefs.set('scrollRestart', restartAtEnd);
});

shuffleCheckbox.checked = shuffleOnRestart;
shuffleCheckbox.addEventListener('change', () => {
  shuffleOnRestart = shuffleCheckbox.checked;
  prefs.set('scrollShuffle', shuffleOnRestart);
});

awakeCheckbox.checked = keepAwake;
awakeCheckbox.addEventListener('change', () => {
  keepAwake = awakeCheckbox.checked;
  prefs.set('keepAwake', keepAwake);
  syncKeepAwake();
});
