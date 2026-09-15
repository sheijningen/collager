/* Pure auto-scroll stepping. The ui module owns the animation frame loop and
 * the DOM; this decides where one tick lands. */

const MAX_TICK_SECONDS = 0.1; // an unbounded delta after a hidden window would leap to the end
const MANUAL_SCROLL_TOLERANCE = 2; // px; scrollTop rounds, virtualTop does not
const END_TOLERANCE = 0.5; // px short of maxScroll that still counts as the end

/**
 * One auto-scroll step.
 * - a scrollTop that drifted from the tracked position means the user
 *   scrolled manually, and the step continues from there instead of
 *   fighting it
 * - the elapsed time is clamped so a long gap between frames cannot jump
 * - with nothing to scroll (`scrollable` false) the position is only adopted,
 *   never stepped, and the caller leaves scrollTop alone
 *
 * @param {{virtualTop:number, scrollTop:number, maxScroll:number, speed:number, elapsedSeconds:number}} tick
 * @returns {{top:number, atEnd:boolean, scrollable:boolean}} the new fractional position,
 *   whether it reached the end, and whether there was anything to scroll
 */
export function advanceAutoScroll({ virtualTop, scrollTop, maxScroll, speed, elapsedSeconds }) {
  const from = Math.abs(scrollTop - virtualTop) > MANUAL_SCROLL_TOLERANCE ? scrollTop : virtualTop;
  if (maxScroll <= 0) return { top: from, atEnd: false, scrollable: false };
  const step = speed * Math.min(elapsedSeconds, MAX_TICK_SECONDS);
  const top = Math.min(from + step, maxScroll);
  return { top, atEnd: top >= maxScroll - END_TOLERANCE, scrollable: true };
}
