/**
 * Cost of capital.
 *
 * The discount rate is derived rather than asserted, so that every component is
 * visible and can be challenged:
 *
 *   Levered beta  = Bu * [ 1 + (1 - t) * D/E ]              (Hamada)
 *   Cost of equity = Rf + BL * ERP + small-company premium   (CAPM)
 *   WACC           = We * Ke + Wd * Kd * (1 - t)
 */

export interface WaccInputs {
  riskFreeRate: number;
  equityRiskPremium: number;
  unleveredBeta: number;
  smallCompanyPremium: number;
  preTaxCostOfDebt: number;
  equityWeight: number;
  taxRate: number;
}

export interface WaccBreakdown {
  debtWeight: number;
  debtToEquity: number;
  leveredBeta: number;
  costOfEquity: number;
  afterTaxCostOfDebt: number;
  wacc: number;
}

export function computeWacc(i: WaccInputs): WaccBreakdown {
  const debtWeight = 1 - i.equityWeight;
  const debtToEquity = i.equityWeight === 0 ? Infinity : debtWeight / i.equityWeight;

  const leveredBeta = i.unleveredBeta * (1 + (1 - i.taxRate) * debtToEquity);
  const costOfEquity =
    i.riskFreeRate + leveredBeta * i.equityRiskPremium + i.smallCompanyPremium;
  const afterTaxCostOfDebt = i.preTaxCostOfDebt * (1 - i.taxRate);

  const wacc = i.equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt;

  return { debtWeight, debtToEquity, leveredBeta, costOfEquity, afterTaxCostOfDebt, wacc };
}

/**
 * Meridian AI Studio's capital structure and risk parameters.
 * Sources are recorded in src/data/sources.ts.
 */
export const MERIDIAN_WACC_INPUTS: WaccInputs = {
  riskFreeRate: 0.043,
  equityRiskPremium: 0.056,
  unleveredBeta: 1.25,
  smallCompanyPremium: 0.02,
  preTaxCostOfDebt: 0.059,
  equityWeight: 0.7,
  taxRate: 0.09,
};
