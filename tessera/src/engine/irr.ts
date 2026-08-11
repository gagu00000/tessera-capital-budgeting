/**
 * Internal Rate of Return.
 *
 * IRR is the rate r that solves NPV(r) = 0.
 *
 * There is no closed form for N > 4, so the roots are found numerically. The
 * NPV curve is first swept across the search range to locate every interval in
 * which it changes sign, and each such interval is then bisected. Bisection is
 * used rather than Newton-Raphson because it cannot diverge or overshoot, and
 * on a six-element cash-flow array its slower convergence costs nothing.
 *
 * WHY SWEEP FOR ALL ROOTS RATHER THAN JUST ONE
 * --------------------------------------------
 * By Descartes' rule of signs, a cash-flow series with k sign changes can have
 * up to k distinct real IRRs. A series that turns negative in later years — for
 * example a fixed-price supply commitment that becomes uneconomic once market
 * prices fall below the locked rate — is exactly such a case, and it occurs in
 * this appraisal. Returning a single root without saying so would present one
 * arbitrary solution as though it were "the" rate of return.
 *
 * When more than one root is found, `isConventional` is false and the caller is
 * expected to warn the user and fall back to NPV and MIRR, which remain
 * well-defined regardless of the sign pattern.
 */

import { npv } from './npv';
import type { IrrResult } from './types';

/**
 * Bisection is halted on the width of the rate bracket, not on |NPV|, because
 * |NPV| is denominated in AED and its achievable floor scales with the size of
 * the project. Driving the bracket to 1e-14 puts the rate at the edge of double
 * precision and leaves an NPV residual of roughly 1e-7 AED on a project of this
 * size — comfortably inside the consistency-check tolerance.
 */
const RATE_TOLERANCE = 1e-14;
const NPV_TOLERANCE = 1e-9;
const MAX_ITERATIONS = 300;

/** Resolution of the initial sweep. Roots closer together than ~0.9pp may merge. */
const SWEEP_STEPS = 1200;

const DEFAULT_LOW = -0.9999;
const DEFAULT_HIGH = 10;

/** Counts sign changes across the non-zero cash flows. */
export function countSignChanges(cashFlows: number[]): number {
  let changes = 0;
  let previousSign = 0;
  for (const cf of cashFlows) {
    if (cf === 0) continue;
    const sign = cf > 0 ? 1 : -1;
    if (previousSign !== 0 && sign !== previousSign) changes++;
    previousSign = sign;
  }
  return changes;
}

/** Refines a single bracketed root by bisection. */
function bisect(cashFlows: number[], lo: number, hi: number): number {
  let fLo = npv(lo, cashFlows);
  let mid = lo;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    mid = (lo + hi) / 2;
    const fMid = npv(mid, cashFlows);
    if (Math.abs(fMid) < NPV_TOLERANCE || (hi - lo) / 2 < RATE_TOLERANCE) break;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return mid;
}

/**
 * Sweeps the search range and returns every rate at which NPV crosses zero,
 * in ascending order.
 */
export function findAllRoots(
  cashFlows: number[],
  low = DEFAULT_LOW,
  high = DEFAULT_HIGH,
): number[] {
  const roots: number[] = [];
  const step = (high - low) / SWEEP_STEPS;

  let previousRate = low;
  let previousNpv = npv(previousRate, cashFlows);

  for (let i = 1; i <= SWEEP_STEPS; i++) {
    const rate = low + i * step;
    const value = npv(rate, cashFlows);

    if (value === 0) {
      roots.push(rate);
    } else if (previousNpv * value < 0) {
      roots.push(bisect(cashFlows, previousRate, rate));
    }

    previousRate = rate;
    previousNpv = value;
  }
  return roots;
}

export function irr(
  cashFlows: number[],
  guessLow = DEFAULT_LOW,
  guessHigh = DEFAULT_HIGH,
): IrrResult {
  const signChanges = countSignChanges(cashFlows);

  if (signChanges === 0) {
    // The NPV curve never crosses zero — no IRR exists.
    return {
      value: null,
      converged: false,
      roots: [],
      signChanges,
      isConventional: false,
      residual: null,
    };
  }

  const roots = findAllRoots(cashFlows, guessLow, guessHigh);
  const value = roots.length > 0 ? roots[0] : null;

  return {
    value,
    converged: value !== null,
    roots,
    signChanges,
    // A unique IRR requires both a single sign change and a single located root.
    isConventional: signChanges === 1 && roots.length === 1,
    residual: value === null ? null : npv(value, cashFlows),
  };
}
