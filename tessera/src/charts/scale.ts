/**
 * Minimal linear scale and tick generation.
 *
 * Hand-rolled rather than pulled from d3-scale: the charts here need a domain
 * mapped to a range and a handful of round tick values, which is a dozen lines.
 * Importing a charting library for that would add weight to a bundle that
 * already carries three.js.
 */

export interface LinearScale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
  invert: (position: number) => number;
}

export function linearScale(
  domain: [number, number],
  range: [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;

  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale;
  scale.domain = domain;
  scale.range = range;
  scale.invert = (position: number) => d0 + ((position - r0) / (r1 - r0)) * span;
  return scale;
}

/**
 * Round tick values covering the domain, chosen from the 1/2/5/10 series so the
 * labels land on numbers a reader recognises.
 */
export function ticks(domain: [number, number], count = 6): number[] {
  const [start, end] = domain;
  const span = end - start;
  if (span === 0) return [start];

  const rawStep = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep))));
  const normalised = rawStep / magnitude;

  let step: number;
  if (normalised <= 1) step = magnitude;
  else if (normalised <= 2) step = 2 * magnitude;
  else if (normalised <= 5) step = 5 * magnitude;
  else step = 10 * magnitude;

  const first = Math.ceil(start / step) * step;
  const result: number[] = [];
  for (let value = first; value <= end + step * 1e-9; value += step) {
    // Guard against binary drift accumulating across the loop.
    result.push(Math.abs(value) < step * 1e-9 ? 0 : value);
  }
  return result;
}

/** Clamps a value into the 0..1 range. */
export function normalise(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
