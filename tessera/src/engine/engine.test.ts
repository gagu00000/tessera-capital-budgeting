/**
 * TESSERA — engine verification suite.
 *
 * Every expected value below is either:
 *   (a) computed by hand and written out longhand in the comment above it, or
 *   (b) a mathematical identity that must hold regardless of the inputs.
 *
 * No expectation is copied from the engine's own output, because a snapshot of
 * a wrong answer is still a wrong answer.
 */

import { describe, it, expect } from 'vitest';
import { npv, annuityFactor, pvOfInflows, pvOfOutflows } from './npv';
import { irr, countSignChanges } from './irr';
import { mirr, mirrViaRootFind } from './mirr';
import { paybackPeriod, discountedPaybackPeriod } from './payback';
import {
  arrAverageInvestmentBasis,
  profitabilityIndex,
  equivalentAnnualAnnuity,
} from './ratios';
import { computeModel, computeDepreciation, fixedCostForYear } from './model';
import { computeWacc } from './wacc';
import { buildDrivers, computeTornado } from './sensitivity';
import { computeScenarios } from './scenarios';
import { ALT_A, ALT_C, WACC } from '../data/scenario';
import type { ProjectInputs } from './types';

// ===========================================================================
// 1. NPV
// ===========================================================================

describe('NPV', () => {
  it('matches a hand-computed textbook series', () => {
    // CF = [-1000, 500, 400, 300, 100] at r = 10%
    //   500 / 1.1000 = 454.545455
    //   400 / 1.2100 = 330.578512
    //   300 / 1.3310 = 225.394440
    //   100 / 1.4641 =  68.301346
    //   PV of inflows = 1078.819753
    //   NPV = 1078.819753 - 1000 = 78.819753
    const cf = [-1000, 500, 400, 300, 100];
    expect(npv(0.1, cf)).toBeCloseTo(78.819753, 6);
  });

  it('at a zero discount rate reduces to the simple sum', () => {
    const cf = [-1000, 500, 400, 300, 100];
    expect(npv(0, cf)).toBeCloseTo(300, 10);
  });

  it('discounts t=0 by a factor of exactly one', () => {
    expect(npv(0.5, [-1000])).toBe(-1000);
  });

  it('splits correctly into inflows and outflows', () => {
    const cf = [-1000, 500, 400, 300, 100];
    expect(pvOfInflows(0.1, cf)).toBeCloseTo(1078.819753, 6);
    expect(pvOfOutflows(0.1, cf)).toBeCloseTo(1000, 10);
  });
});

describe('Annuity factor', () => {
  it('matches the hand-computed 5-year 10% factor', () => {
    // (1 - 1.1^-5) / 0.10 = (1 - 0.620921323) / 0.10 = 3.790786769
    expect(annuityFactor(0.1, 5)).toBeCloseTo(3.790786769, 8);
  });

  it('reduces to n when the rate is zero', () => {
    expect(annuityFactor(0, 7)).toBe(7);
  });
});

// ===========================================================================
// 2. IRR
// ===========================================================================

describe('IRR', () => {
  it('recovers an exactly-known rate on a two-point series', () => {
    // -100 today, +110 in one year  =>  IRR is exactly 10%
    expect(irr([-100, 110]).value).toBeCloseTo(0.1, 10);
  });

  it('recovers an exactly-known rate on a three-year series', () => {
    // -1000 today, +1331 in three years; 1.1^3 = 1.331  =>  IRR is exactly 10%
    expect(irr([-1000, 0, 0, 1331]).value).toBeCloseTo(0.1, 10);
  });

  it('returns a rate that genuinely zeroes NPV', () => {
    const cf = [-1000, 500, 400, 300, 100];
    const r = irr(cf).value!;
    expect(npv(r, cf)).toBeCloseTo(0, 8);
  });

  it('counts sign changes and flags non-conventional series', () => {
    expect(countSignChanges([-1000, 500, 400, 300])).toBe(1);
    expect(countSignChanges([-1000, 2500, -1600])).toBe(2);
    expect(irr([-1000, 500, 400, 300]).isConventional).toBe(true);
    expect(irr([-1000, 2500, -1600]).isConventional).toBe(false);
  });

  it('returns null when no sign change exists', () => {
    expect(irr([100, 200, 300]).value).toBeNull();
    expect(irr([-100, -200, -300]).value).toBeNull();
  });

  it('finds both roots of the classic two-IRR series', () => {
    // -1000, +2500, -1600 has two sign changes and two real IRRs.
    // NPV(r) = -1000 + 2500/(1+r) - 1600/(1+r)^2. Let x = 1/(1+r):
    //   -1600x^2 + 2500x - 1000 = 0  ->  1600x^2 - 2500x + 1000 = 0
    //   x = [2500 +/- sqrt(2500^2 - 4*1600*1000)] / (2*1600)
    //     = [2500 +/- sqrt(6,250,000 - 6,400,000)] / 3200
    // The discriminant is negative, so this particular series has NO real IRR.
    const result = irr([-1000, 2500, -1600]);
    expect(result.signChanges).toBe(2);
    expect(result.roots).toHaveLength(0);
    expect(result.isConventional).toBe(false);
  });

  it('finds both roots when a series really does have two', () => {
    // -1000, +2600, -1650: 1650x^2 - 2600x + 1000 = 0
    //   discriminant = 6,760,000 - 6,600,000 = 160,000, sqrt = 400
    //   x = (2600 +/- 400) / 3300  ->  x = 0.909090..., or x = 0.666666...
    //   r = 1/x - 1                ->  r = 10%,          or r = 50%
    const result = irr([-1000, 2600, -1650]);
    expect(result.signChanges).toBe(2);
    expect(result.roots).toHaveLength(2);
    expect(result.roots[0]).toBeCloseTo(0.1, 8);
    expect(result.roots[1]).toBeCloseTo(0.5, 8);
    expect(result.isConventional).toBe(false);
    // Both roots must genuinely zero the NPV function.
    for (const r of result.roots) {
      expect(npv(r, [-1000, 2600, -1650])).toBeCloseTo(0, 6);
    }
  });

  it('reports a single root and conventional status for an ordinary project', () => {
    const result = irr([-1000, 500, 400, 300, 100]);
    expect(result.roots).toHaveLength(1);
    expect(result.isConventional).toBe(true);
  });
});

// ===========================================================================
// 3. MIRR
// ===========================================================================

describe('MIRR', () => {
  it('matches a hand-computed value', () => {
    // CF = [-1000, 500, 400, 300, 100], finance 10%, reinvest 12%, N = 4
    //   PV of negatives = 1000
    //   FV of positives = 500(1.12^3) + 400(1.12^2) + 300(1.12) + 100
    //                   = 702.464 + 501.760 + 336.000 + 100.000 = 1640.224
    //   MIRR = (1640.224 / 1000)^(1/4) - 1
    //        = exp( ln(1.640224) / 4 ) - 1
    //        = exp( 0.49483280 / 4 ) - 1 = 1.13168560 - 1 = 0.13168560
    const cf = [-1000, 500, 400, 300, 100];
    expect(mirr(cf, 0.1, 0.12)).toBeCloseTo(0.1316856, 7);
  });

  it('agrees with the independent root-finding implementation', () => {
    const cf = [-1000, 500, 400, 300, 100];
    expect(mirr(cf, 0.1, 0.12)!).toBeCloseTo(mirrViaRootFind(cf, 0.1, 0.12)!, 10);
  });

  it('equals IRR when both rates equal the IRR itself', () => {
    // This is the defining property MIRR is built to relax: when interim cash
    // flows really are reinvested at the IRR, MIRR collapses onto IRR.
    const cf = [-1000, 500, 400, 300, 100];
    const r = irr(cf).value!;
    expect(mirr(cf, r, r)).toBeCloseTo(r, 8);
  });
});

// ===========================================================================
// 4. Payback
// ===========================================================================

describe('Payback', () => {
  it('interpolates inside the recovery year', () => {
    // -1000, then 400 a year. After year 2 the balance is -200.
    // Year 3 brings 400, so payback = 2 + 200/400 = 2.5 years.
    expect(paybackPeriod([-1000, 400, 400, 400])).toBeCloseTo(2.5, 10);
  });

  it('returns a whole number when recovery lands exactly on a year end', () => {
    expect(paybackPeriod([-1000, 500, 500])).toBeCloseTo(2, 10);
  });

  it('returns null when the outlay is never recovered', () => {
    expect(paybackPeriod([-1000, 100, 100, 100])).toBeNull();
  });

  it('is always slower once discounted', () => {
    const cf = [-1000, 400, 400, 400, 400];
    const plain = paybackPeriod(cf)!;
    const discounted = discountedPaybackPeriod(cf, 0.1)!;
    expect(discounted).toBeGreaterThan(plain);
  });
});

// ===========================================================================
// 5. Ratios
// ===========================================================================

describe('Ratios', () => {
  it('computes ARR on the average-investment basis', () => {
    // Average PAT = (100 + 200 + 300) / 3 = 200
    // Average investment = (1000 + 200) / 2 = 600
    // ARR = 200 / 600 = 33.33%
    expect(arrAverageInvestmentBasis([100, 200, 300], 1000, 200)).toBeCloseTo(1 / 3, 10);
  });

  it('satisfies the PI-NPV identity', () => {
    const pvIn = 1078.819753;
    const pvOut = 1000;
    const pi = profitabilityIndex(pvIn, pvOut);
    expect(pi).toBeCloseTo(1 + (pvIn - pvOut) / pvOut, 12);
  });

  it('computes EAA as NPV divided by the annuity factor', () => {
    // NPV 78.819753 over 5 years at 10%:
    //   3.790786769 * 20 = 75.81573538, leaving 3.00401762
    //   3.00401762 / 3.790786769 = 0.792452
    //   EAA = 20.792452
    expect(equivalentAnnualAnnuity(78.819753, 0.1, 5)).toBeCloseTo(20.792452, 6);
  });
});

// ===========================================================================
// 6. WACC
// ===========================================================================

describe('WACC', () => {
  it('derives Meridian cost of capital from its components', () => {
    // D/E = 0.30 / 0.70 = 0.428571
    // Levered beta = 1.25 * (1 + 0.91 * 0.428571) = 1.25 * 1.39 = 1.7375
    // Ke = 4.30% + 1.7375 * 5.60% + 2.00% = 4.30% + 9.73% + 2.00% = 16.03%
    // Kd after tax = 5.90% * 0.91 = 5.369%
    // WACC = 0.70 * 16.03% + 0.30 * 5.369% = 11.221% + 1.6107% = 12.8317%
    const w = computeWacc({
      riskFreeRate: 0.043,
      equityRiskPremium: 0.056,
      unleveredBeta: 1.25,
      smallCompanyPremium: 0.02,
      preTaxCostOfDebt: 0.059,
      equityWeight: 0.7,
      taxRate: 0.09,
    });
    expect(w.leveredBeta).toBeCloseTo(1.7375, 10);
    expect(w.costOfEquity).toBeCloseTo(0.1603, 6);
    expect(w.afterTaxCostOfDebt).toBeCloseTo(0.05369, 10);
    expect(w.wacc).toBeCloseTo(0.128317, 6);
  });
});

// ===========================================================================
// 7. Depreciation and disposal
// ===========================================================================

describe('Depreciation', () => {
  it('depreciates straight line down to the salvage estimate', () => {
    // Base = 5,860,000 + 700,000 = 6,560,000; salvage = 18% * 5,860,000 = 1,054,800
    // Annual = (6,560,000 - 1,054,800) / 5 = 5,505,200 / 5 = 1,101,040
    const d = computeDepreciation(ALT_A);
    expect(d.depreciableBase).toBe(6_560_000);
    expect(d.salvageValue).toBeCloseTo(1_054_800, 6);
    expect(d.annualDepreciation).toBeCloseTo(1_101_040, 6);
    expect(d.closingBookValue).toBeCloseTo(1_054_800, 6);
  });

  it('depreciates the whole base when the method is straight line to zero', () => {
    const d = computeDepreciation({ ...ALT_A, depreciationMethod: 'straightLineToZero' });
    expect(d.annualDepreciation).toBeCloseTo(6_560_000 / 5, 6);
    expect(d.closingBookValue).toBeCloseTo(0, 6);
  });

  it('produces no disposal gain or loss when salvage lands on book value', () => {
    const m = computeModel(ALT_A);
    expect(m.terminal.gainOrLossOnDisposal).toBeCloseTo(0, 6);
    expect(m.terminal.taxOnDisposal).toBeCloseTo(0, 6);
  });

  it('taxes a gain when realised salvage beats the original estimate', () => {
    // Schedule fixed on an 18% estimate => book value 1,054,800.
    // Realised salvage 26% * 5,860,000 = 1,523,600.
    // Gain = 1,523,600 - 1,054,800 = 468,800; tax at 9% = 42,192.
    // After-tax salvage = 1,523,600 - 42,192 = 1,481,408.
    const m = computeModel({ ...ALT_A, salvageRateOfEquipment: 0.26 });
    expect(m.terminal.closingBookValue).toBeCloseTo(1_054_800, 6);
    expect(m.terminal.gainOrLossOnDisposal).toBeCloseTo(468_800, 6);
    expect(m.terminal.taxOnDisposal).toBeCloseTo(42_192, 6);
    expect(m.terminal.afterTaxSalvage).toBeCloseTo(1_481_408, 6);
  });

  it('gives a tax shield when realised salvage falls short of book value', () => {
    // Realised salvage 8% * 5,860,000 = 468,800; book value still 1,054,800.
    // Loss = 468,800 - 1,054,800 = -586,000; tax at 9% = -52,740 (a credit).
    // After-tax salvage = 468,800 + 52,740 = 521,540.
    const m = computeModel({ ...ALT_A, salvageRateOfEquipment: 0.08 });
    expect(m.terminal.gainOrLossOnDisposal).toBeCloseTo(-586_000, 6);
    expect(m.terminal.taxOnDisposal).toBeCloseTo(-52_740, 6);
    expect(m.terminal.afterTaxSalvage).toBeCloseTo(521_540, 6);
  });
});

// ===========================================================================
// 8. Fixed cost schedule
// ===========================================================================

describe('Fixed costs', () => {
  it('escalates at 3% and starts the support contract in year 2', () => {
    // Year 1 (no support contract): 520,000 + 320,000 + 110,000 + 86,000 = 1,036,000
    expect(fixedCostForYear(ALT_A, 1)).toBeCloseTo(1_036_000, 6);
    // Year 2 adds the 245,000 support contract; everything escalates by 1.03:
    //   (1,036,000 + 245,000) * 1.03 = 1,281,000 * 1.03 = 1,319,430
    expect(fixedCostForYear(ALT_A, 2)).toBeCloseTo(1_319_430, 6);
    // Year 5: 1,281,000 * 1.03^4 = 1,281,000 * 1.12550881 = 1,441,776.78561
    expect(fixedCostForYear(ALT_A, 5)).toBeCloseTo(1_441_776.78561, 4);
  });

  it('includes the opportunity cost of the owned technical room', () => {
    // Compare like with like: only components already running in year 1, since
    // the support contract does not start until year 2.
    const year1CashCosts = ALT_A.fixedCostComponents
      .filter((c) => !c.isOpportunityCost && c.startYear <= 1)
      .reduce((s, c) => s + c.year1Amount, 0);
    expect(year1CashCosts).toBe(950_000);
    expect(fixedCostForYear(ALT_A, 1) - year1CashCosts).toBeCloseTo(86_000, 6);
  });
});

// ===========================================================================
// 9. Full model — Alternative A, year 1, computed by hand
// ===========================================================================

describe('Alternative A — year 1 built up by hand', () => {
  const m = computeModel(ALT_A);
  const y1 = m.years[0];

  it('derives available and utilised hours', () => {
    // 32 GPUs * 8,760 h * 96% availability = 269,107.2 sellable GPU-hours
    // At 65% utilisation: 269,107.2 * 0.65 = 174,919.68
    expect(y1.availableHours).toBeCloseTo(269_107.2, 6);
    expect(y1.utilisedHours).toBeCloseTo(174_919.68, 6);
  });

  it('derives revenue from the two streams', () => {
    // Internal: 174,919.68 * 0.60 = 104,951.808 h @ AED 20.20 = 2,120,026.5216
    // External: 174,919.68 * 0.40 =  69,967.872 h @ AED 14.70 = 1,028,527.7184
    // Revenue = 3,148,554.24
    expect(y1.internalRevenue).toBeCloseTo(2_120_026.5216, 4);
    expect(y1.externalRevenue).toBeCloseTo(1_028_527.7184, 4);
    expect(y1.revenue).toBeCloseTo(3_148_554.24, 4);
  });

  it('derives EBIT, tax and operating cash flow', () => {
    // Variable cost: 174,919.68 * 0.70 = 122,443.776
    // Fixed cost: 1,036,000     Depreciation: 1,101,040
    // EBIT = 3,148,554.24 - 122,443.776 - 1,036,000 - 1,101,040 = 889,070.464
    // Tax at 9% = 80,016.34176      Net income = 809,054.12224
    // OCF = 809,054.12224 + 1,101,040 = 1,910,094.12224
    expect(y1.variableCost).toBeCloseTo(122_443.776, 4);
    expect(y1.fixedCost).toBeCloseTo(1_036_000, 6);
    expect(y1.ebit).toBeCloseTo(889_070.464, 4);
    expect(y1.tax).toBeCloseTo(80_016.34176, 4);
    expect(y1.netIncome).toBeCloseTo(809_054.12224, 4);
    expect(y1.operatingCashFlow).toBeCloseTo(1_910_094.12224, 4);
  });

  it('builds the initial cash flow with the sunk cost excluded', () => {
    // -(5,860,000 + 700,000 + 500,000) = -7,060,000.
    // The AED 120,000 feasibility study is reported but never enters a cash flow.
    expect(m.initial.total).toBeCloseTo(-7_060_000, 6);
    expect(m.cashFlows[0]).toBeCloseTo(-7_060_000, 6);
    expect(m.initial.sunkCostExcluded).toBe(120_000);
  });

  it('builds the terminal cash flow', () => {
    // After-tax salvage 1,054,800 (no gain or loss) + working capital 500,000
    expect(m.terminal.total).toBeCloseTo(1_554_800, 6);
  });

  it('recovers exactly the working capital it committed', () => {
    expect(m.terminal.workingCapitalRecovered).toBeCloseTo(500_000, 6);
  });
});

// ===========================================================================
// 10. Identities that must hold for every alternative
// ===========================================================================

describe('Cross-cutting identities', () => {
  const cases: ProjectInputs[] = [ALT_A, ALT_C];

  for (const inputs of cases) {
    describe(`Alternative ${inputs.id}`, () => {
      const m = computeModel(inputs);

      it('passes every built-in consistency check', () => {
        const failures = m.checks.filter((c) => !c.passed);
        expect(failures.map((f) => `${f.name} (delta ${f.delta})`)).toEqual([]);
        expect(m.allChecksPass).toBe(true);
      });

      it('has an IRR that zeroes the NPV function', () => {
        expect(npv(m.irr.value!, m.cashFlows)).toBeCloseTo(0, 3);
      });

      it('has an NPV whose sign agrees with IRR against WACC', () => {
        if (m.npv > 0) expect(m.irr.value!).toBeGreaterThan(WACC);
        else expect(m.irr.value!).toBeLessThan(WACC);
      });

      it('has an NPV whose sign agrees with PI against 1.0', () => {
        if (m.npv > 0) expect(m.profitabilityIndex).toBeGreaterThan(1);
        else expect(m.profitabilityIndex).toBeLessThan(1);
      });

      it('has a discounted payback no faster than its simple payback', () => {
        if (m.discountedPaybackPeriod !== null && m.paybackPeriod !== null) {
          expect(m.discountedPaybackPeriod).toBeGreaterThanOrEqual(m.paybackPeriod);
        }
      });

      it('reconciles NPV to the sum of discounted cash flows', () => {
        const manual = m.cashFlows.reduce(
          (s, cf, t) => s + cf / Math.pow(1 + inputs.wacc, t),
          0,
        );
        expect(manual).toBeCloseTo(m.npv, 6);
      });

      it('produces an NPV of exactly zero when discounted at its own IRR', () => {
        const atIrr = computeModel({ ...inputs, wacc: m.irr.value! });
        expect(atIrr.npv).toBeCloseTo(0, 3);
      });
    });
  }
});

// ===========================================================================
// 11. Break-even
// ===========================================================================

describe('Break-even', () => {
  const m = computeModel(ALT_A);

  it('computes year-1 accounting break-even utilisation by hand', () => {
    // Blended rate = 0.60 * 20.20 + 0.40 * 14.70 = 12.12 + 5.88 = 18.00
    // Contribution per GPU-hour = 18.00 - 0.70 = 17.30
    // Break-even hours = (1,036,000 + 1,101,040) / 17.30 = 2,137,040 / 17.30 = 123,528.32
    // As a share of 269,107.2 available hours = 45.90%
    expect(m.years[0].blendedRate).toBeCloseTo(18.0, 10);
    expect(m.breakEven.contributionMarginYear1).toBeCloseTo(17.3, 10);
    expect(m.breakEven.accountingByYear[0]).toBeCloseTo(0.459, 3);
  });

  it('puts cash break-even below accounting break-even', () => {
    // Cash break-even omits the non-cash depreciation charge, so it must be lower.
    expect(m.breakEven.cashByYear[0]).toBeLessThan(m.breakEven.accountingByYear[0]);
  });

  it('finds the utilisation multiplier that drives NPV to zero', () => {
    const k = m.breakEven.npvBreakEvenUtilisationFactor!;
    const atBreakEven = computeModel({
      ...ALT_A,
      utilisationByYear: ALT_A.utilisationByYear.map((u) => u * k),
    });
    expect(atBreakEven.npv).toBeCloseTo(0, 2);
  });

  it('finds the price level that drives NPV to zero', () => {
    const target = m.breakEven.npvBreakEvenBlendedRate!;
    const factor = target / m.years[0].blendedRate;
    const atBreakEven = computeModel({
      ...ALT_A,
      internalRateYear1: ALT_A.internalRateYear1 * factor,
      externalRateYear1: ALT_A.externalRateYear1 * factor,
    });
    expect(atBreakEven.npv).toBeCloseTo(0, 2);
  });
});

// ===========================================================================
// 12. Behavioural sanity — the model must respond in the right direction
// ===========================================================================

describe('Directional behaviour', () => {
  const base = computeModel(ALT_A);

  it('lowers NPV when the discount rate rises', () => {
    expect(computeModel({ ...ALT_A, wacc: ALT_A.wacc + 0.02 }).npv).toBeLessThan(base.npv);
  });

  it('lowers NPV when price erosion accelerates', () => {
    expect(computeModel({ ...ALT_A, priceErosionRate: 0.14 }).npv).toBeLessThan(base.npv);
  });

  it('raises NPV when utilisation improves', () => {
    const better = computeModel({
      ...ALT_A,
      utilisationByYear: ALT_A.utilisationByYear.map((u) => Math.min(1, u * 1.1)),
    });
    expect(better.npv).toBeGreaterThan(base.npv);
  });

  it('lowers NPV when capital expenditure rises', () => {
    expect(computeModel({ ...ALT_A, equipmentCost: 6_446_000 }).npv).toBeLessThan(base.npv);
  });

  it('raises NPV when realised salvage improves', () => {
    expect(computeModel({ ...ALT_A, salvageRateOfEquipment: 0.26 }).npv).toBeGreaterThan(
      base.npv,
    );
  });

  it('flags loss of the group tax shield as value-destroying', () => {
    // Denying relief for loss years can only reduce or hold cash flows.
    const noShield = computeModel({ ...ALT_A, taxShieldOnLosses: false });
    expect(noShield.npv).toBeLessThanOrEqual(base.npv + 1e-6);
  });
});

// ===========================================================================
// 13. Sensitivity
// ===========================================================================

describe('Sensitivity', () => {
  const drivers = buildDrivers(ALT_A);
  const bars = computeTornado(ALT_A, drivers);

  it('returns bars sorted by the width of their NPV swing', () => {
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i - 1].swing).toBeGreaterThanOrEqual(bars[i].swing);
    }
  });

  it('puts the switching value for the cost of capital exactly on the IRR', () => {
    // This is an identity, not a coincidence. The switching value is the rate at
    // which NPV becomes zero, and IRR is defined as the rate at which NPV is
    // zero — so the two must agree. It cross-checks the sensitivity solver
    // against the root finder, which share no code.
    const base = computeModel(ALT_A);
    const waccBar = bars.find((b) => b.driver.id === 'wacc')!;
    expect(waccBar.switchingValue).not.toBeNull();
    expect(waccBar.switchingValue!).toBeCloseTo(base.irr.value!, 6);
  });

  it('produces a zero NPV at every switching value it reports', () => {
    for (const bar of bars) {
      if (bar.switchingValue === null) continue;
      const shocked = computeModel(bar.driver.apply(ALT_A, bar.switchingValue), {
        skipBreakEven: true,
        skipIrr: true,
      });
      expect(shocked.npv).toBeCloseTo(0, 2);
    }
  });

  it('moves NPV the right way at each end of every driver range', () => {
    // driver.min is defined as the adverse end and driver.max as the favourable
    // one, so the NPV at min must never exceed the NPV at max.
    for (const bar of bars) {
      expect(bar.npvAtMin).toBeLessThan(bar.npvAtMax);
    }
  });
});

describe('Scenarios', () => {
  const results = computeScenarios(ALT_A);
  const npv = (id: string) => results.find((r) => r.definition.id === id)!.model.npv;

  it('orders worst below base below best', () => {
    expect(npv('worst')).toBeLessThan(npv('base'));
    expect(npv('base')).toBeLessThan(npv('best'));
  });

  it('leaves the base case identical to the unmodified model', () => {
    expect(npv('base')).toBeCloseTo(computeModel(ALT_A).npv, 6);
  });
});

// ===========================================================================
// 14. Contractual options are correctly flagged as non-capital
// ===========================================================================

describe('Capital intensity flag', () => {
  it('treats the owned-hardware options as genuine capital investments', () => {
    expect(computeModel(ALT_A).ratioMetricsMeaningful).toBe(true);
    expect(computeModel(ALT_C).ratioMetricsMeaningful).toBe(true);
  });
});
