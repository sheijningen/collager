/* Pure auto-scroll stepping. The ui module owns the animation frame loop and
 * the DOM; this decides where one tick lands. */

export const MIN_SCROLL_SPEED = 10; // px/s
export const MAX_SCROLL_SPEED = 600;
export const DEFAULT_SCROLL_SPEED = 80;
export const SCROLL_SPEED_STEP = 10; // the slider's step, and what , and . move it by

/* The speed kept within the slider's range; an unusable value becomes the
 * default. */
export function clampScrollSpeed(value) {
  if (!Number.isFinite(value)) return DEFAULT_SCROLL_SPEED;
  return Math.min(MAX_SCROLL_SPEED, Math.max(MIN_SCROLL_SPEED, value));
}

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
 * - with a `wrapHeight`, a step that reaches or passes it lands that far
 *   further up (`wrapped`) and the end is never reached; without one the
 *   step stops at maxScroll
 *
 * @param {{virtualTop:number, scrollTop:number, maxScroll:number, speed:number, elapsedSeconds:number, wrapHeight?:number}} tick
 * @returns {{top:number, atEnd:boolean, scrollable:boolean, wrapped:boolean}} the new
 *   fractional position, whether it reached the end, whether there was anything to
 *   scroll, and whether it wrapped
 */
export function advanceAutoScroll({
  virtualTop,
  scrollTop,
  maxScroll,
  speed,
  elapsedSeconds,
  wrapHeight = 0
}) {
  const from = Math.abs(scrollTop - virtualTop) > MANUAL_SCROLL_TOLERANCE ? scrollTop : virtualTop;
  if (maxScroll <= 0) return { top: from, atEnd: false, scrollable: false, wrapped: false };
  const step = speed * Math.min(elapsedSeconds, MAX_TICK_SECONDS);
  if (wrapHeight > 0) {
    const next = from + step;
    if (next < wrapHeight) return { top: next, atEnd: false, scrollable: true, wrapped: false };
    return { top: next - wrapHeight, atEnd: false, scrollable: true, wrapped: true };
  }
  const top = Math.min(from + step, maxScroll);
  return { top, atEnd: top >= maxScroll - END_TOLERANCE, scrollable: true, wrapped: false };
}
