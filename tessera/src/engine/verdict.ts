/**
 * Deterministic, rule-based investment verdict.
 *
 * This is NOT the AI recommendation. It is a fixed set of decision rules,
 * written down in advance, computed in pure TypeScript, and readable by anyone
 * who wants to check it. Its purpose is to give Claude's recommendation
 * something independent to be measured against.
 *
 * The brief awards marks for critical evaluation of AI output. Displaying an AI
 * verdict on its own invites the reader to accept it. Displaying it beside a
 * transparent rule-based verdict, with disagreements called out, forces the
 * comparison to actually happen.
 */

import type { ModelResult } from './types';
import type { ScenarioResult } from './scenarios';

export type Decision = 'ACCEPT' | 'REJECT' | 'DELAY' | 'REVIEW_FURTHER';

export interface RuleCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface RuleVerdict {
  decision: Decision;
  headline: string;
  checks: RuleCheck[];
  reasoning: string[];
  /** What would have to change for the decision to flip. */
  flipConditions: string[];
}

const DECISION_LABEL: Record<Decision, string> = {
  ACCEPT: 'Accept',
  REJECT: 'Reject',
  DELAY: 'Delay',
  REVIEW_FURTHER: 'Review further',
};

export function decisionLabel(decision: Decision): string {
  return DECISION_LABEL[decision];
}

/** NPV within this fraction of the outlay is treated as indistinguishable from zero. */
const MARGINAL_BAND = 0.05;
/** A worst case losing more than this fraction of the outlay demands further review. */
const WORST_CASE_LIMIT = 0.2;

export function computeRuleVerdict(
  model: ModelResult,
  scenarios: ScenarioResult[],
): RuleVerdict {
  const outlay = Math.abs(model.cashFlows[0]);
  const wacc = model.inputs.wacc;
  const life = model.inputs.projectLifeYears;

  const worst = scenarios.find((s) => s.definition.id === 'worst');
  const best = scenarios.find((s) => s.definition.id === 'best');

  const npvPositive = model.npv > 0;
  const piAboveOne = model.profitabilityIndex > 1;
  const irrAboveWacc = model.irr.value !== null && model.irr.value > wacc;
  const paybackInsideLife =
    model.discountedPaybackPeriod !== null && model.discountedPaybackPeriod <= life;

  const isMarginal = Math.abs(model.npv) < MARGINAL_BAND * outlay;
  const worstCaseSevere = worst ? worst.model.npv < -WORST_CASE_LIMIT * outlay : false;
  const bestCaseRecovers = best ? best.model.npv > 0 : false;

  const checks: RuleCheck[] = [
    {
      label: 'NPV is positive',
      passed: npvPositive,
      detail: `NPV of ${fmt(model.npv)} at a ${(wacc * 100).toFixed(2)}% cost of capital.`,
    },
    {
      label: 'Profitability Index exceeds 1.00',
      passed: piAboveOne,
      detail: `PI of ${model.profitabilityIndex.toFixed(3)} — every dirham invested returns ${model.profitabilityIndex.toFixed(2)} in present value.`,
    },
    {
      label: 'IRR clears the cost of capital',
      passed: irrAboveWacc,
      detail:
        model.irr.value === null
          ? 'IRR is undefined for this cash-flow pattern.'
          : `IRR of ${(model.irr.value * 100).toFixed(2)}% against a hurdle of ${(wacc * 100).toFixed(2)}%.`,
    },
    {
      label: 'Discounted payback falls inside the project life',
      passed: paybackInsideLife,
      detail:
        model.discountedPaybackPeriod === null
          ? `The outlay is never recovered in present-value terms within ${life} years.`
          : `Recovered after ${model.discountedPaybackPeriod.toFixed(2)} of ${life} years.`,
    },
    {
      label: 'Worst case remains survivable',
      passed: !worstCaseSevere,
      detail: worst
        ? `Worst-case NPV of ${fmt(worst.model.npv)}, against a ${(WORST_CASE_LIMIT * 100).toFixed(0)}% of outlay tolerance (${fmt(-WORST_CASE_LIMIT * outlay)}).`
        : 'No worst-case scenario supplied.',
    },
  ];

  const reasoning: string[] = [];
  const flipConditions: string[] = [];
  let decision: Decision;

  // Options that employ almost no capital cannot be judged on capital-based
  // ratios, so the rules fall back to NPV and the scenario range alone.
  if (!model.ratioMetricsMeaningful) {
    decision = model.npv > 0 ? 'ACCEPT' : 'REJECT';
    reasoning.push(
      'This option commits almost no capital, so Profitability Index, IRR, ARR and payback ' +
        'are not meaningful and have been excluded from the decision.',
    );
    reasoning.push(
      `Judged on NPV alone, the option is worth ${fmt(model.npv)} in present value against ` +
        'the status quo.',
    );
    flipConditions.push('NPV turning negative over the committed term.');
    return {
      decision,
      headline: `${DECISION_LABEL[decision]} — judged on NPV alone`,
      checks,
      reasoning,
      flipConditions,
    };
  }

  if (npvPositive && piAboveOne && irrAboveWacc && paybackInsideLife && !worstCaseSevere) {
    decision = 'ACCEPT';
    reasoning.push(
      `Every decision criterion is satisfied: NPV ${fmt(model.npv)}, PI ${model.profitabilityIndex.toFixed(3)}, ` +
        `IRR ${pct(model.irr.value)} against a ${pct(wacc)} hurdle, and the outlay is recovered ` +
        `in present-value terms within the project life.`,
    );
    if (worst) {
      reasoning.push(
        `The worst case still lands at ${fmt(worst.model.npv)}, inside the tolerance for a project of this size.`,
      );
    }
    flipConditions.push(
      'Price erosion accelerating materially beyond the assumed rate.',
      'Utilisation falling below the NPV break-even level.',
    );
  } else if (isMarginal) {
    decision = 'REVIEW_FURTHER';
    reasoning.push(
      `NPV of ${fmt(model.npv)} is within ${(MARGINAL_BAND * 100).toFixed(0)}% of the ${fmt(outlay)} outlay, ` +
        'which is inside the margin of error of the assumptions themselves.',
    );
    reasoning.push(
      'A decision this close cannot be settled by the base case. It turns on the sensitivity ' +
        'analysis, the comparison against alternatives, and non-financial considerations.',
    );
    flipConditions.push(
      'Any single driver moving to the adverse end of its plausible range.',
      'A better-scaled alternative being available for the same demand.',
    );
  } else if (!npvPositive && !irrAboveWacc && !bestCaseRecovers) {
    decision = 'REJECT';
    reasoning.push(
      `NPV of ${fmt(model.npv)} is negative and IRR of ${pct(model.irr.value)} sits below the ` +
        `${pct(wacc)} cost of capital.`,
    );
    reasoning.push('Even the best case fails to produce a positive NPV.');
    flipConditions.push('A structural fall in equipment cost, or a materially higher achievable price.');
  } else if (!npvPositive && bestCaseRecovers) {
    decision = 'DELAY';
    reasoning.push(
      `The base case is value-destroying at ${fmt(model.npv)}, but the best case reaches ` +
        `${fmt(best!.model.npv)}. The project is not wrong in principle, only mistimed.`,
    );
    reasoning.push(
      'Deferring preserves the option to invest once the uncertainty that separates those two ' +
        'outcomes has resolved.',
    );
    flipConditions.push(
      'Observed price erosion settling at the lower end of its range.',
      'Contracted demand rising far enough to lift utilisation above break-even.',
    );
  } else {
    decision = 'REVIEW_FURTHER';
    reasoning.push(
      'The criteria disagree with one another, which usually means the project is sound on ' +
        'one dimension and weak on another.',
    );
    const failed = checks.filter((c) => !c.passed).map((c) => c.label.toLowerCase());
    if (failed.length) reasoning.push(`Unsatisfied criteria: ${failed.join('; ')}.`);
    flipConditions.push('Resolution of whichever criterion currently fails.');
  }

  return {
    decision,
    headline: `${DECISION_LABEL[decision]} — ${summaryFor(decision)}`,
    checks,
    reasoning,
    flipConditions,
  };
}

function summaryFor(decision: Decision): string {
  switch (decision) {
    case 'ACCEPT':
      return 'all decision criteria satisfied';
    case 'REJECT':
      return 'value-destroying across the plausible range';
    case 'DELAY':
      return 'sound in principle, mistimed in practice';
    case 'REVIEW_FURTHER':
      return 'too close to call on the base case alone';
  }
}

function fmt(value: number): string {
  const sign = value < 0 ? '−' : '';
  return `AED ${sign}${Math.abs(Math.round(value)).toLocaleString('en-AE')}`;
}

function pct(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;
}
