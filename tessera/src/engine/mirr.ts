/**
 * Modified Internal Rate of Return.
 *
 * MIRR removes IRR's implicit assumption that interim cash flows are reinvested
 * at the IRR itself. Instead:
 *   - negative cash flows are discounted to t=0 at the finance rate
 *   - positive cash flows are compounded to t=N at the reinvestment rate
 *
 *   MIRR = ( FV_positive / |PV_negative| )^(1/N) - 1
 *
 * Two independent implementations are provided so they can be cross-checked
 * against each other at runtime (see consistency checks in model.ts):
 *   1. mirr()          — the closed-form ratio above
 *   2. mirrViaRootFind() — the IRR of the collapsed two-point series
 *                          [-PV_negative, 0, ..., 0, FV_positive]
 * They are mathematically equivalent but computationally unrelated, so
 * agreement between them is meaningful evidence of correctness.
 */

import { irr } from './irr';

export function presentValueOfNegatives(cashFlows: number[], financeRate: number): number {
  let total = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    if (cashFlows[t] < 0) total += cashFlows[t] / Math.pow(1 + financeRate, t);
  }
  return Math.abs(total);
}

export function futureValueOfPositives(cashFlows: number[], reinvestmentRate: number): number {
  const n = cashFlows.length - 1;
  let total = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    if (cashFlows[t] > 0) total += cashFlows[t] * Math.pow(1 + reinvestmentRate, n - t);
  }
  return total;
}

export function mirr(
  cashFlows: number[],
  financeRate: number,
  reinvestmentRate: number,
): number | null {
  const n = cashFlows.length - 1;
  if (n <= 0) return null;

  const pvNeg = presentValueOfNegatives(cashFlows, financeRate);
  const fvPos = futureValueOfPositives(cashFlows, reinvestmentRate);
  if (pvNeg === 0 || fvPos <= 0) return null;

  return Math.pow(fvPos / pvNeg, 1 / n) - 1;
}

/** Independent route to the same number, via numerical root finding. */
export function mirrViaRootFind(
  cashFlows: number[],
  financeRate: number,
  reinvestmentRate: number,
): number | null {
  const n = cashFlows.length - 1;
  if (n <= 0) return null;

  const pvNeg = presentValueOfNegatives(cashFlows, financeRate);
  const fvPos = futureValueOfPositives(cashFlows, reinvestmentRate);
  if (pvNeg === 0 || fvPos <= 0) return null;

  const collapsed = new Array(n + 1).fill(0);
  collapsed[0] = -pvNeg;
  collapsed[n] = fvPos;

  return irr(collapsed).value;
}
