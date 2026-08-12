/**
 * Builds the facts package sent to Claude.
 *
 * This is the enforcement point for the rule that governs the whole AI layer:
 * **Claude interprets, Claude does not calculate.** Every number the model is
 * allowed to mention is computed by the verified engine, rounded here, and
 * handed over as data. The model is never asked to derive, combine, or estimate
 * a figure, and the response schemas contain no numeric fields — so there is no
 * route by which an AI-invented number can reach the interface.
 *
 * The brief is explicit that AI must support the analysis rather than produce
 * it. This module is what makes that structural rather than aspirational.
 */

import type { ModelResult } from '../engine/types';
import type { ScenarioResult } from '../engine/scenarios';
import type { TornadoBar } from '../engine/sensitivity';
import type { RuleVerdict } from '../engine/verdict';

const round = (value: number, dp = 0) => Number(value.toFixed(dp));
const pct = (value: number | null, dp = 2) => (value === null ? null : round(value * 100, dp));

export interface AdvisorFacts {
  currency: 'AED';
  scenario: {
    company: string;
    decision: string;
    modelDate: string;
  };
  alternative: {
    id: string;
    label: string;
    description: string;
    lifeYears: number;
  };
  metrics: Record<string, number | string | null>;
  cashFlows: number[];
  years: Array<Record<string, number>>;
  breakEven: Record<string, number | null>;
  drivers?: Array<Record<string, number | string | null>>;
  scenarios?: Array<Record<string, number | string | null>>;
  alternatives?: Array<Record<string, number | string | null>>;
  ruleVerdict?: { decision: string; headline: string; reasoning: string[] };
  question?: string;
  metricInFocus?: string;
}

export function buildFacts(options: {
  model: ModelResult;
  tornado?: TornadoBar[];
  scenarios?: ScenarioResult[];
  alternatives?: ModelResult[];
  ruleVerdict?: RuleVerdict;
  question?: string;
  metricInFocus?: string;
}): AdvisorFacts {
  const { model, tornado, scenarios, alternatives, ruleVerdict, question, metricInFocus } = options;
  const i = model.inputs;

  const facts: AdvisorFacts = {
    currency: 'AED',
    scenario: {
      company:
        'Meridian AI Studio FZ-LLC, a 34-person AI product studio in Dubai Internet City with AED 18.4m annual revenue.',
      decision:
        'Whether to buy its own GPU inference capacity instead of renting on-demand cloud capacity. All alternatives are appraised incrementally against the status quo of continuing to rent.',
      modelDate: 'August 2026',
    },
    alternative: {
      id: i.id,
      label: i.label,
      description: i.description,
      lifeYears: i.projectLifeYears,
    },
    metrics: {
      initialOutlay: round(Math.abs(model.cashFlows[0])),
      npv: round(model.npv),
      npvAsPercentOfOutlay: round((model.npv / Math.abs(model.cashFlows[0])) * 100, 2),
      irrPercent: pct(model.irr.value),
      irrIsUnique: model.irr.isConventional ? 'yes' : 'no — this cash-flow pattern has multiple IRRs',
      mirrPercent: pct(model.mirr),
      waccPercent: pct(i.wacc),
      profitabilityIndex: round(model.profitabilityIndex, 4),
      paybackYears: model.paybackPeriod === null ? null : round(model.paybackPeriod, 2),
      discountedPaybackYears:
        model.discountedPaybackPeriod === null ? null : round(model.discountedPaybackPeriod, 2),
      arrPercent: pct(model.arr),
      equivalentAnnualAnnuity: round(model.equivalentAnnualAnnuity),
      annualDepreciation: round(model.annualDepreciation),
      salvageValue: round(model.salvageValue),
      terminalCashFlow: round(model.terminal.total),
      sunkCostExcluded: round(model.initial.sunkCostExcluded),
      taxRatePercent: pct(i.taxRate, 1),
      priceErosionPercent: pct(i.priceErosionRate, 1),
      peakUtilisationPercent: pct(Math.max(...i.utilisationByYear), 1),
      ratioMetricsMeaningful: model.ratioMetricsMeaningful
        ? 'yes'
        : 'no — this option employs almost no capital, so IRR, PI, ARR and payback are not meaningful and must not be cited',
    },
    cashFlows: model.cashFlows.map((c) => round(c)),
    years: model.years.map((y) => ({
      year: y.year,
      utilisationPercent: round(y.utilisation * 100, 1),
      revenue: round(y.revenue),
      variableCost: round(y.variableCost),
      fixedCost: round(y.fixedCost),
      depreciation: round(y.depreciation),
      ebit: round(y.ebit),
      tax: round(y.tax),
      operatingCashFlow: round(y.operatingCashFlow),
      netCashFlow: round(y.netCashFlow),
      presentValue: round(y.presentValue),
    })),
    breakEven: {
      cashBreakEvenUtilisationPercent: round(model.breakEven.cashAverage * 100, 1),
      accountingBreakEvenUtilisationPercent: round(model.breakEven.accountingAverage * 100, 1),
      npvBreakEvenPeakUtilisationPercent:
        model.breakEven.npvBreakEvenPeakUtilisation === null
          ? null
          : round(model.breakEven.npvBreakEvenPeakUtilisation * 100, 1),
      npvBreakEvenBlendedRate:
        model.breakEven.npvBreakEvenBlendedRate === null
          ? null
          : round(model.breakEven.npvBreakEvenBlendedRate, 2),
      contributionMarginPerGpuHour: round(model.breakEven.contributionMarginYear1, 2),
    },
  };

  if (tornado) {
    facts.drivers = tornado.map((bar) => ({
      driver: bar.driver.label,
      description: bar.driver.description,
      npvAtAdverseEnd: round(bar.npvAtMin),
      npvAtFavourableEnd: round(bar.npvAtMax),
      npvSwing: round(bar.swing),
      crossesZero: Math.sign(bar.npvAtMin) !== Math.sign(bar.npvAtMax) ? 'yes' : 'no',
      switchingValue: bar.switchingValue === null ? null : round(bar.switchingValue, 4),
      baseValue: round(bar.driver.base, 4),
    }));
  }

  if (scenarios) {
    facts.scenarios = scenarios.map((s) => ({
      scenario: s.definition.label,
      narrative: s.definition.narrative,
      assumptions: s.definition.assumptions.join('; '),
      npv: round(s.model.npv),
      irrPercent: pct(s.model.irr.value),
      profitabilityIndex: round(s.model.profitabilityIndex, 3),
      equivalentAnnualAnnuity: round(s.model.equivalentAnnualAnnuity),
    }));
  }

  if (alternatives) {
    facts.alternatives = alternatives.map((m) => ({
      id: m.inputs.id,
      label: m.inputs.label,
      lifeYears: m.inputs.projectLifeYears,
      initialOutlay: round(Math.abs(m.cashFlows[0])),
      npv: round(m.npv),
      equivalentAnnualAnnuity: round(m.equivalentAnnualAnnuity),
      irrPercent: pct(m.irr.value),
      profitabilityIndex: round(m.profitabilityIndex, 3),
      discountedPaybackYears:
        m.discountedPaybackPeriod === null ? null : round(m.discountedPaybackPeriod, 2),
      ratioMetricsMeaningful: m.ratioMetricsMeaningful ? 'yes' : 'no',
    }));
  }

  if (ruleVerdict) {
    facts.ruleVerdict = {
      decision: ruleVerdict.decision,
      headline: ruleVerdict.headline,
      reasoning: ruleVerdict.reasoning,
    };
  }

  if (question) facts.question = question;
  if (metricInFocus) facts.metricInFocus = metricInFocus;

  return facts;
}
