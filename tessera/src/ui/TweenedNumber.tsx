/**
 * A number that travels to its new value instead of jumping to it.
 *
 * When an assumption changes, every headline figure changes with it. Swapping
 * the text outright tells you the number is different but not which way it
 * moved; counting it across makes the direction and the size of the move
 * legible without the reader having to remember what was there a moment ago.
 *
 * GSAP drives it, writing to the DOM node directly rather than through React
 * state. A tween that set state would re-render the tree sixty times a second
 * per figure for no benefit — the only thing changing is the text of one span,
 * and that is exactly the job GSAP's ticker is built for.
 */

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export function TweenedNumber({
  value,
  format,
  duration = 0.7,
  className,
}: {
  value: number;
  /** Turns the in-flight number into the string shown. */
  format: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const proxy = useRef({ value });

  /**
   * Held in a ref so an inline `format` at the call site does not restart the
   * tween on every render of the parent.
   */
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const settle = () => {
      proxy.current.value = value;
      element.textContent = formatRef.current(value);
    };

    // Motion here is decoration over information that is already on the page,
    // so it is the first thing to go when reduced motion is asked for.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settle();
      return;
    }

    const tween = gsap.to(proxy.current, {
      value,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        element.textContent = formatRef.current(proxy.current.value);
      },
      onComplete: settle, // land exactly on the target, not near it
    });

    return () => {
      tween.kill();
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
