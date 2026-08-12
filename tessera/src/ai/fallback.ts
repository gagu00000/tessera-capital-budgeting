/**
 * Pre-authored commentary used when the Claude API is unreachable.
 *
 * This exists so a marker opening the submitted link without an API key still
 * sees a complete application rather than an error state. It is NOT passed off
 * as live model output — every surface that renders it is labelled as
 * pre-generated, because presenting authored text as an AI response would be
 * exactly the kind of unearned claim this project is trying to avoid.
 *
 * The figures below are the verified engine's outputs for Alternative A at the
 * published assumptions. If the user has changed an input, the live figures on
 * screen will no longer match this text — which is itself why the label matters.
 */

import type { RiskRegister, Comparison, Verdict } from './schemas';

export const FALLBACK_NOTICE =
  'Pre-generated commentary. The Claude API is not reachable from this deployment, so this text was authored in advance against the published base case rather than produced live.';

export const fallbackExplanation = (metric?: string): string => {
  const generic = `The appraisal turns on a single fact: at the published assumptions Alternative A produces a net present value of AED −51,476 on an outlay of AED 7,060,000. That is 0.73% of the money committed — far inside the margin of error of the assumptions themselves, so the base case cannot settle the decision on its own.

Everything else follows from that. The internal rate of return of 12.54% sits just below the 12.83% cost of capital, the profitability index of 0.993 sits just below 1.00, and the outlay is never recovered in present-value terms within the five-year life. These are not four findings; they are one finding stated four ways.

What settles the decision is the comparison against the alternatives and the sensitivity analysis, not the base case.`;

  if (!metric) return generic;

  const byMetric: Record<string, string> = {
    'Net Present Value': `Net present value asks what the project is worth today, after charging for the capital it uses. Here it is AED −51,476: the cash the cluster returns does not quite cover the cost of the money tied up in it.

The figure is small — 0.73% of the AED 7,060,000 outlay — which matters more than the sign. A project this close to zero is not a marginal accept or a marginal reject; it is a project whose answer depends entirely on assumptions that cannot be known precisely in advance.`,
    'Internal Rate of Return': `The internal rate of return is the annual return the project earns on the money tied up in it: 12.54% here, against a 12.83% cost of capital. Because it falls short of the hurdle, the project fails on this measure — but only by 0.29 percentage points.

IRR is worth treating carefully. It assumes every interim cash flow is reinvested at the IRR itself, which is usually optimistic. The modified IRR of 12.67%, which assumes reinvestment at the cost of capital instead, is the more conservative figure and still falls short.`,
    'Discounted Payback': `Discounted payback asks how long until the original outlay is recovered, counting each year's cash at what it is worth today. Here it is never recovered inside the five-year life.

That is the same finding as the negative NPV rather than an additional one — a project whose discounted cash flows never sum back to the outlay is a project with a negative NPV, by definition.`,
  };

  return byMetric[metric] ?? generic;
};

export const fallbackRisks: RiskRegister = {
  summary:
    'The risk profile is dominated by a single structural exposure: the project converts a falling variable cost into a fixed sunk one. Every driver in the sensitivity analysis crosses zero within its plausible range, which is a symptom of a base case sitting 0.73% away from the threshold rather than nine independent problems.',
  risks: [
    {
      title: 'GPU price erosion outpaces the forecast',
      category: 'market',
      severity: 'high',
      likelihood: 'high',
      driver: 'GPU price erosion',
      rationale:
        'The model assumes prices fall 8% a year. At 14% the NPV falls to AED −1,140,546. The switching value is 7.7%, meaning the project needs erosion to be slower than already forecast to break even.',
      mitigation:
        'Contract a share of resale capacity on multi-year fixed pricing before committing capital, converting part of the exposure into a known quantity.',
    },
    {
      title: 'Utilisation falls short of the ramp',
      category: 'operational',
      severity: 'high',
      likelihood: 'medium',
      driver: 'Utilisation',
      rationale:
        'NPV break-even requires 85.4% peak utilisation against a plan that peaks at 85.0%. There is no headroom: the cluster must run essentially exactly as forecast for five years.',
      mitigation:
        'Size the purchase to the demand that is structurally always-on rather than to forecast peak, and serve the peak from cloud.',
    },
    {
      title: 'Technology obsolescence before end of life',
      category: 'technology',
      severity: 'high',
      likelihood: 'medium',
      driver: 'Salvage value',
      rationale:
        'The five-year life assumes the hardware remains commercially competitive throughout. A new GPU generation would depress both the resale price achievable and the AED 1,054,800 salvage value assumed at disposal.',
      mitigation:
        'Stage the purchase so a second tranche can be deferred or specified against whatever generation is current when it is needed.',
    },
    {
      title: 'Concentration of resale demand',
      category: 'market',
      severity: 'medium',
      likelihood: 'medium',
      driver: 'Resale price',
      rationale:
        'Forty per cent of utilised hours are sold externally at AED 14.70. The switching value is AED 14.92 — above what the model already assumes is achievable, so the resale stream has no margin for a softer market.',
      mitigation:
        'Secure committed offtake from two or more regional clients before purchase rather than assuming a spot market.',
    },
    {
      title: 'Key-person dependency on cluster operations',
      category: 'operational',
      severity: 'medium',
      likelihood: 'medium',
      driver: 'none',
      rationale:
        'The model provisions one incremental platform engineer. In a 34-person studio, the operational knowledge for a colocation deployment concentrates in one or two people, and their departure would not show up in any financial driver.',
      mitigation:
        'Contract vendor-managed support alongside the internal hire, and document runbooks as a condition of the capex release.',
    },
    {
      title: 'Capital committed ahead of demand certainty',
      category: 'financial',
      severity: 'high',
      likelihood: 'high',
      driver: 'Equipment cost',
      rationale:
        'The AED 7,060,000 outlay is committed in full at the outset, while the revenue that justifies it accrues over five years. The contribution margin of AED 17.30 per GPU-hour is excellent; the difficulty is that the capital is spent before anyone knows how many hours will sell.',
      mitigation:
        'Use equipment financing to align the cash profile with the revenue profile, or reduce the tranche size.',
    },
    {
      title: 'Data-residency demand fails to materialise',
      category: 'strategic',
      severity: 'medium',
      likelihood: 'low',
      driver: 'none',
      rationale:
        'The external resale stream rests on regional clients needing inference to stay in the UAE. That is a policy-driven demand assumption with no modelled driver, and it underpins forty per cent of utilised hours.',
      mitigation:
        'Validate with letters of intent from two prospective clients before committing, treating the resale stream as unproven until then.',
    },
    {
      title: 'Loss relief unavailable against group profit',
      category: 'regulatory',
      severity: 'low',
      likelihood: 'low',
      driver: 'Corporate tax rate',
      rationale:
        'Operating cash flows assume losses can be offset against the wider entity\'s taxable profit. If that relief were unavailable the cash flows in loss-making years would be lower. UAE corporate tax is 9%, so the effect is bounded, but it is an assumption rather than a certainty.',
      mitigation:
        'Confirm the group relief position with the studio\'s tax adviser before the capex release.',
    },
  ],
};

export const fallbackComparison: Comparison = {
  recommendedAlternativeId: 'C',
  headline:
    'Alternative C — own a 16-GPU baseline and burst to cloud — is the only option that creates value on the measure that governs mutually exclusive projects.',
  rationale: [
    'On NPV, which governs when projects are mutually exclusive, Alternative C produces AED 726,442 against Alternative A\'s AED −51,476 and Alternative B\'s AED 693,082.',
    'Alternative C clears every capital test that Alternative A fails: a profitability index of 1.190 against 0.993, an IRR of 20.64% against 12.54%, and discounted payback of 4.14 years against never.',
    'Alternative A fails because it buys capacity into a market where the price of that capacity is falling 8% a year. Its NPV break-even needs 85.4% peak utilisation against a plan of 85.0% — no headroom at all.',
    'Alternative C works for the opposite reason: it buys only the capacity that is structurally saturated, and pays status-quo prices for the peak, where owning confers no advantage.',
  ],
  rankingConflict: {
    present: true,
    explanation:
      'The alternatives rank differently depending on the measure. Alternative C leads on NPV at AED 726,442 against Alternative B\'s AED 693,082, but Alternative B leads on Equivalent Annual Annuity at AED 292,697 against AED 205,691. For mutually exclusive projects NPV governs, because it measures total value created rather than value per unit of time — but the EAA reversal is real and needs the explanation below rather than dismissal.',
  },
  unequalLives: {
    present: true,
    explanation:
      'Alternative B runs three years against the others\' five, so EAA is the correct adjustment in principle. But EAA assumes each option can be repeated indefinitely on identical terms, and for a locked price in a market falling 8% a year that assumption is doing enormous work. Held over five years the same commitment produces an NPV of AED 553,267 and an EAA of AED 156,656 — below Alternative C. Alternative B\'s EAA advantage is real but self-liquidating.',
  },
  caveats: [
    'The recommendation depends on 16 GPUs being genuinely saturated by internal demand. If the always-on baseline is smaller than assumed, Alternative C inherits Alternative A\'s problem at a smaller scale.',
    'Alternative B is stronger than a first reading suggests, and materially stronger if the studio could negotiate a discount deeper than the 22% assumed.',
    'All three alternatives assume the resale market for surplus capacity exists at the prices modelled; none of them has been validated with a signed customer.',
  ],
};

export const fallbackVerdict: Verdict = {
  decision: 'REJECT',
  confidence: 'high',
  headline:
    'Reject Alternative A and adopt Alternative C: the full cluster fails its own break-even test, while the hybrid creates AED 726,442 of value from the same demand.',
  reasoning: [
    'Alternative A produces an NPV of AED −51,476, an IRR of 12.54% against a 12.83% cost of capital, and a profitability index of 0.993. It fails every capital test, though narrowly.',
    'The decisive figure is not the NPV but the break-even: NPV break-even requires 85.4% peak utilisation against a plan of 85.0%. The project needs the cluster to run essentially exactly as forecast for five years merely to be worth building.',
    'The worst case reaches AED −4,073,264, which is 57.7% of the capital committed. The spread between worst and best cases is 0.92 times the outlay — wider than the investment itself.',
    'Alternative C serves the same underlying demand for AED 3,830,000 and produces an NPV of AED 726,442, a PI of 1.190 and discounted payback of 4.14 years.',
    'This agrees with the rule-based verdict on the direction but not on the label: the rules return REVIEW FURTHER because Alternative A\'s NPV falls inside their marginal band. That is right about Alternative A in isolation and wrong about the decision, because a better-scaled option for the same demand is already on the table.',
  ],
  conditions: [
    'Size the owned tranche to demand that is contracted or structurally always-on, not to forecast peak.',
    'Secure committed offtake from at least two regional clients before releasing capital for the resale-dependent portion.',
    'Set a review trigger on observed GPU price erosion: if it exceeds 10% a year, re-appraise before any second tranche.',
  ],
  flipTriggers: [
    'Price erosion settling below 4% a year, which would take Alternative A into positive NPV territory.',
    'A structural fall in equipment cost of more than about 10%, which the sensitivity analysis shows is close to Alternative A\'s switching value.',
    'Contracted demand rising far enough that 32 GPUs are saturated rather than 85% utilised.',
  ],
  keyRisk:
    'GPU price erosion. It is the second-widest driver in the tornado, it moves both the avoided cloud cost and the resale price at once, and its switching value of 7.7% sits below the 8% the model already assumes.',
};
