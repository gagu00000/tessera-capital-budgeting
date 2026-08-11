/**
 * Accounting Rate of Return, Profitability Index, Equivalent Annual Annuity.
 */

import { annuityFactor } from './npv';

/**
 * Accounting Rate of Return (a.k.a. Average Rate of Return / Return on
 * Investment). Note this is an *accounting* measure: it uses profit after tax,
 * not cash flow, and it ignores the time value of money.
 *
 *   ARR (average investment basis) = Average annual PAT / Average book investment
 *   Average book investment        = (Initial capitalised cost + Closing book value) / 2
 *
 * The average-investment basis is the convention used here because the asset is
 * depreciated over the project life, so the capital employed genuinely declines.
 * The initial-investment basis is reported alongside it for transparency, since
 * textbooks differ and the two give materially different numbers.
 */
export function arrAverageInvestmentBasis(
  netIncomeByYear: number[],
  initialCapitalisedCost: number,
  closingBookValue: number,
): number {
  const averagePat =
    netIncomeByYear.reduce((sum, ni) => sum + ni, 0) / netIncomeByYear.length;
  const averageInvestment = (initialCapitalisedCost + closingBookValue) / 2;
  if (averageInvestment === 0) return 0;
  return averagePat / averageInvestment;
}

export function arrInitialInvestmentBasis(
  netIncomeByYear: number[],
  totalInitialInvestment: number,
): number {
  const averagePat =
    netIncomeByYear.reduce((sum, ni) => sum + ni, 0) / netIncomeByYear.length;
  if (totalInitialInvestment === 0) return 0;
  return averagePat / totalInitialInvestment;
}

/**
 * Profitability Index = PV of inflows / PV of outflows.
 *
 * Related to NPV by the identity  PI = 1 + NPV / |PV of outflows|,
 * which is asserted as a runtime consistency check.
 */
export function profitabilityIndex(pvInflows: number, pvOutflows: number): number {
  if (pvOutflows === 0) return Infinity;
  return pvInflows / pvOutflows;
}

/**
 * Equivalent Annual Annuity — the level annual cash flow with the same NPV over
 * the project's life. Essential when comparing mutually exclusive projects of
 * *unequal* life, which is the case here: the cloud reserved-commitment
 * alternative runs 3 years against the on-premise options' 5.
 *
 *   EAA = NPV / AnnuityFactor(r, n)
 */
export function equivalentAnnualAnnuity(npvValue: number, rate: number, years: number): number {
  const af = annuityFactor(rate, years);
  if (af === 0) return 0;
  return npvValue / af;
}
