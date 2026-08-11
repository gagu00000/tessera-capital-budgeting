/**
 * TESSERA — the model assembler.
 *
 * Takes a ProjectInputs and produces the complete appraisal: the year-by-year
 * cash-flow bridge, the initial / operating / terminal cash flows, and all ten
 * decision metrics, plus a set of runtime consistency checks.
 *
 * Sign convention: outflows are negative in `cashFlows`, but the individual
 * cost fields on YearRow are stored as positive magnitudes for display.
 */

import type {
  ProjectInputs,
  YearRow,
  ModelResult,
  InitialCashFlowBreakdown,
  TerminalCashFlowBreakdown,
  BreakEvenResult,
  ConsistencyCheck,
  IrrResult,
} from './types';
import { npv, pvOfInflows, pvOfOutflows } from './npv';
import { irr } from './irr';
import { mirr, mirrViaRootFind } from './mirr';
import { paybackPeriod, discountedPaybackPeriod } from './payback';
import {
  arrAverageInvestmentBasis,
  arrInitialInvestmentBasis,
  profitabilityIndex,
  equivalentAnnualAnnuity,
} from './ratios';

// ---------------------------------------------------------------------------
// Component calculations
// ---------------------------------------------------------------------------

export function fixedCostForYear(inputs: ProjectInputs, year: number): number {
  const escalator = Math.pow(1 + inputs.fixedCostEscalation, year - 1);
  return inputs.fixedCostComponents
    .filter((c) => year >= c.startYear)
    .reduce((sum, c) => sum + c.year1Amount * escalator, 0);
}

export function priceForYear(year1Rate: number, erosion: number, year: number): number {
  return year1Rate * Math.pow(1 - erosion, year - 1);
}

export function availableHoursPerYear(inputs: ProjectInputs): number {
  return inputs.gpuCount * inputs.hoursPerYear * inputs.availabilityFactor;
}

export interface DepreciationSchedule {
  depreciableBase: number;
  salvageValue: number;
  annualDepreciation: number;
  closingBookValue: number;
}

export function computeDepreciation(inputs: ProjectInputs): DepreciationSchedule {
  const depreciableBase = inputs.equipmentCost + inputs.installTransportCost;

  /** What the asset is actually expected to fetch on disposal. */
  const salvageValue = inputs.salvageRateOfEquipment * inputs.equipmentCost;

  /**
   * What was assumed at purchase. The depreciation schedule was fixed then and
   * does not move when the realised salvage assumption changes.
   */
  const estimateRate =
    inputs.depreciationSalvageRateEstimate ?? inputs.salvageRateOfEquipment;

  const target =
    inputs.depreciationMethod === 'straightLineToSalvage'
      ? estimateRate * inputs.equipmentCost
      : 0;

  // Never allow negative depreciation: if the estimated salvage exceeds the
  // depreciable base, the asset is simply not depreciated.
  const annualDepreciation = Math.max(
    0,
    (depreciableBase - target) / inputs.projectLifeYears,
  );
  const closingBookValue = depreciableBase - annualDepreciation * inputs.projectLifeYears;

  return { depreciableBase, salvageValue, annualDepreciation, closingBookValue };
}

/**
 * Below this ratio of initial outlay to average annual benefit, an option is a
 * contractual commitment rather than a capital investment, and every metric that
 * divides by invested capital ceases to carry meaning.
 */
export const CAPITAL_INTENSITY_FLOOR = 0.25;

// ---------------------------------------------------------------------------
// Main model
// ---------------------------------------------------------------------------

export interface ComputeOptions {
  /** Skip the break-even solvers, which recursively re-evaluate the model. */
  skipBreakEven?: boolean;
  /**
   * Skip IRR root-finding and the consistency checks that depend on it. Used by
   * the sensitivity sweeps, which evaluate the model roughly 1,800 times per
   * tornado and need only NPV from each pass.
   */
  skipIrr?: boolean;
}

const EMPTY_IRR: IrrResult = {
  value: null,
  converged: false,
  roots: [],
  signChanges: 0,
  isConventional: false,
  residual: null,
};

export function computeModel(
  inputs: ProjectInputs,
  options: ComputeOptions = {},
): ModelResult {
  const { skipBreakEven = false, skipIrr = false } = options;
  const N = inputs.projectLifeYears;
  const H = availableHoursPerYear(inputs);
  const dep = computeDepreciation(inputs);

  // --- Pass 1: revenue and operating results ------------------------------
  interface Pass1 {
    utilisation: number;
    utilisedHours: number;
    internalHours: number;
    externalHours: number;
    internalRate: number;
    externalRate: number;
    blendedRate: number;
    internalRevenue: number;
    externalRevenue: number;
    revenue: number;
    variableCost: number;
    fixedCost: number;
    ebit: number;
    tax: number;
    netIncome: number;
    operatingCashFlow: number;
  }

  const pass1: Pass1[] = [];
  for (let t = 1; t <= N; t++) {
    const utilisation = inputs.utilisationByYear[t - 1] ?? 0;
    const utilisedHours = H * utilisation;
    const internalHours = utilisedHours * inputs.internalSharePct;
    const externalHours = utilisedHours * (1 - inputs.internalSharePct);

    const internalRate = priceForYear(inputs.internalRateYear1, inputs.priceErosionRate, t);
    const externalRate = priceForYear(inputs.externalRateYear1, inputs.priceErosionRate, t);
    const blendedRate =
      inputs.internalSharePct * internalRate + (1 - inputs.internalSharePct) * externalRate;

    const internalRevenue = internalHours * internalRate;
    const externalRevenue = externalHours * externalRate;
    const revenue = internalRevenue + externalRevenue;

    const variableCost = utilisedHours * inputs.variableCostPerGpuHour;
    const fixedCost = fixedCostForYear(inputs, t);

    const ebit = revenue - variableCost - fixedCost - dep.annualDepreciation;

    // A loss produces a tax credit only if it can be offset against the wider
    // entity's taxable profit; otherwise tax is floored at zero.
    const tax = ebit >= 0 || inputs.taxShieldOnLosses ? ebit * inputs.taxRate : 0;

    const netIncome = ebit - tax;
    const operatingCashFlow = netIncome + dep.annualDepreciation;

    pass1.push({
      utilisation,
      utilisedHours,
      internalHours,
      externalHours,
      internalRate,
      externalRate,
      blendedRate,
      internalRevenue,
      externalRevenue,
      revenue,
      variableCost,
      fixedCost,
      ebit,
      tax,
      netIncome,
      operatingCashFlow,
    });
  }

  // --- Pass 2: working capital -------------------------------------------
  // Working capital is committed at the START of the year it supports, i.e.
  // the cash leaves at the end of the preceding year (t-1).
  let workingCapitalInitial: number;
  const workingCapitalInvestment = new Array(N + 1).fill(0);

  if (inputs.workingCapitalMode === 'fixed') {
    workingCapitalInitial = inputs.workingCapitalInitial;
  } else {
    const pct = inputs.workingCapitalPercentOfRevenue;
    workingCapitalInitial = pct * (pass1[0]?.revenue ?? 0);
    for (let t = 1; t <= N - 1; t++) {
      workingCapitalInvestment[t] = pct * (pass1[t].revenue - pass1[t - 1].revenue);
    }
  }

  const totalWorkingCapitalInvested =
    workingCapitalInitial + workingCapitalInvestment.reduce((s, v) => s + v, 0);

  // --- Terminal cash flow -------------------------------------------------
  const gainOrLossOnDisposal = dep.salvageValue - dep.closingBookValue;
  const taxOnDisposal = gainOrLossOnDisposal * inputs.taxRate;
  const afterTaxSalvage = dep.salvageValue - taxOnDisposal;
  const workingCapitalRecovered = totalWorkingCapitalInvested;

  const terminal: TerminalCashFlowBreakdown = {
    salvageValue: dep.salvageValue,
    closingBookValue: dep.closingBookValue,
    gainOrLossOnDisposal,
    taxOnDisposal,
    afterTaxSalvage,
    workingCapitalRecovered,
    total: afterTaxSalvage + workingCapitalRecovered,
  };

  // --- Initial cash flow --------------------------------------------------
  const initial: InitialCashFlowBreakdown = {
    equipmentCost: inputs.equipmentCost,
    installTransportCost: inputs.installTransportCost,
    capitalisedCost: dep.depreciableBase,
    workingCapital: workingCapitalInitial,
    total: -(dep.depreciableBase + workingCapitalInitial),
    sunkCostExcluded: inputs.sunkCost,
  };

  // --- Assemble the cash-flow series --------------------------------------
  const cashFlows: number[] = new Array(N + 1).fill(0);
  cashFlows[0] = initial.total;
  for (let t = 1; t <= N; t++) {
    let cf = pass1[t - 1].operatingCashFlow - workingCapitalInvestment[t];
    if (t === N) cf += terminal.total;
    cashFlows[t] = cf;
  }

  // --- Build the display rows ---------------------------------------------
  const years: YearRow[] = [];
  let cumulative = cashFlows[0];
  let cumulativeDiscounted = cashFlows[0];
  let wcBalance = workingCapitalInitial;

  for (let t = 1; t <= N; t++) {
    const p = pass1[t - 1];
    const df = 1 / Math.pow(1 + inputs.wacc, t);
    const netCashFlow = cashFlows[t];
    const presentValue = netCashFlow * df;

    wcBalance += workingCapitalInvestment[t];
    if (t === N) wcBalance = 0; // fully recovered

    cumulative += netCashFlow;
    cumulativeDiscounted += presentValue;

    years.push({
      year: t,
      utilisation: p.utilisation,
      availableHours: H,
      utilisedHours: p.utilisedHours,
      internalHours: p.internalHours,
      externalHours: p.externalHours,
      internalRate: p.internalRate,
      externalRate: p.externalRate,
      blendedRate: p.blendedRate,
      internalRevenue: p.internalRevenue,
      externalRevenue: p.externalRevenue,
      revenue: p.revenue,
      variableCost: p.variableCost,
      fixedCost: p.fixedCost,
      contribution: p.revenue - p.variableCost,
      ebitda: p.revenue - p.variableCost - p.fixedCost,
      depreciation: dep.annualDepreciation,
      ebit: p.ebit,
      tax: p.tax,
      netIncome: p.netIncome,
      operatingCashFlow: p.operatingCashFlow,
      workingCapitalInvestment: workingCapitalInvestment[t],
      workingCapitalBalance: wcBalance,
      terminalCashFlow: t === N ? terminal.total : 0,
      netCashFlow,
      discountFactor: df,
      presentValue,
      cumulativeCashFlow: cumulative,
      cumulativeDiscountedCashFlow: cumulativeDiscounted,
      closingBookValue: dep.depreciableBase - dep.annualDepreciation * t,
    });
  }

  // --- Metrics -------------------------------------------------------------
  const npvValue = npv(inputs.wacc, cashFlows);
  const irrResult = skipIrr ? EMPTY_IRR : irr(cashFlows);
  const mirrValue = mirr(cashFlows, inputs.financeRate, inputs.reinvestmentRate);
  const pvIn = pvOfInflows(inputs.wacc, cashFlows);
  const pvOut = pvOfOutflows(inputs.wacc, cashFlows);
  const pi = profitabilityIndex(pvIn, pvOut);
  const netIncomeByYear = pass1.map((p) => p.netIncome);

  const averageRevenue = pass1.reduce((s, p) => s + p.revenue, 0) / Math.max(1, N);
  const capitalIntensity =
    averageRevenue === 0 ? Infinity : Math.abs(cashFlows[0]) / averageRevenue;

  const result: ModelResult = {
    inputs,
    years,
    cashFlows,
    initial,
    terminal,
    depreciableBase: dep.depreciableBase,
    annualDepreciation: dep.annualDepreciation,
    salvageValue: dep.salvageValue,
    npv: npvValue,
    irr: irrResult,
    mirr: mirrValue,
    profitabilityIndex: pi,
    paybackPeriod: paybackPeriod(cashFlows, 0),
    discountedPaybackPeriod: discountedPaybackPeriod(cashFlows, inputs.wacc),
    arr: arrAverageInvestmentBasis(
      netIncomeByYear,
      dep.depreciableBase,
      dep.closingBookValue,
    ),
    arrInitialBasis: arrInitialInvestmentBasis(
      netIncomeByYear,
      dep.depreciableBase + workingCapitalInitial,
    ),
    equivalentAnnualAnnuity: equivalentAnnualAnnuity(npvValue, inputs.wacc, N),
    pvOfInflows: pvIn,
    pvOfOutflows: pvOut,
    capitalIntensity,
    ratioMetricsMeaningful: capitalIntensity >= CAPITAL_INTENSITY_FLOOR,
    breakEven: skipBreakEven
      ? emptyBreakEven()
      : computeBreakEven(inputs, pass1, H, dep.annualDepreciation),
    checks: [],
    allChecksPass: true,
  };

  // The consistency checks exist to validate what is shown to the user. During a
  // sensitivity sweep nothing is shown, and several checks re-run the very root
  // finding that was just skipped, so they are omitted with it.
  if (!skipIrr) {
    result.checks = runConsistencyChecks(result, inputs, dep, totalWorkingCapitalInvested);
    result.allChecksPass = result.checks.every((c) => c.passed);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Break-even analysis
// ---------------------------------------------------------------------------

function emptyBreakEven(): BreakEvenResult {
  return {
    accountingByYear: [],
    cashByYear: [],
    accountingAverage: 0,
    cashAverage: 0,
    npvBreakEvenUtilisationFactor: null,
    npvBreakEvenPeakUtilisation: null,
    npvBreakEvenBlendedRate: null,
    contributionMarginYear1: 0,
    contributionMarginRatioYear1: 0,
  };
}

function computeBreakEven(
  inputs: ProjectInputs,
  pass1: Array<{ blendedRate: number; fixedCost: number }>,
  H: number,
  annualDepreciation: number,
): BreakEvenResult {
  const vc = inputs.variableCostPerGpuHour;

  // Utilisation u solving EBIT = 0:
  //   u * H * (blendedRate - vc) - FixedCost - Depreciation = 0
  const accountingByYear = pass1.map((p) => {
    const marginPerHour = p.blendedRate - vc;
    if (marginPerHour <= 0) return Infinity;
    return (p.fixedCost + annualDepreciation) / (H * marginPerHour);
  });

  // Cash break-even excludes depreciation, which is a non-cash charge.
  const cashByYear = pass1.map((p) => {
    const marginPerHour = p.blendedRate - vc;
    if (marginPerHour <= 0) return Infinity;
    return p.fixedCost / (H * marginPerHour);
  });

  const mean = (a: number[]) =>
    a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

  // NPV break-even: scale the whole utilisation vector by k until NPV = 0.
  const npvAtUtilisationFactor = (k: number): number =>
    computeModel(
      { ...inputs, utilisationByYear: inputs.utilisationByYear.map((u) => u * k) },
      { skipBreakEven: true, skipIrr: true },
    ).npv;

  const utilisationFactor = solveForZero(npvAtUtilisationFactor, 0.01, 5);

  // NPV break-even price: scale both year-1 rates until NPV = 0.
  const npvAtRateFactor = (m: number): number =>
    computeModel(
      {
        ...inputs,
        internalRateYear1: inputs.internalRateYear1 * m,
        externalRateYear1: inputs.externalRateYear1 * m,
      },
      { skipBreakEven: true, skipIrr: true },
    ).npv;

  const rateFactor = solveForZero(npvAtRateFactor, 0.01, 5);
  const blendedYear1 = pass1[0]?.blendedRate ?? 0;

  return {
    accountingByYear,
    cashByYear,
    accountingAverage: mean(accountingByYear),
    cashAverage: mean(cashByYear),
    npvBreakEvenUtilisationFactor: utilisationFactor,
    npvBreakEvenPeakUtilisation:
      utilisationFactor === null
        ? null
        : Math.max(...inputs.utilisationByYear) * utilisationFactor,
    npvBreakEvenBlendedRate: rateFactor === null ? null : blendedYear1 * rateFactor,
    contributionMarginYear1: blendedYear1 - vc,
    contributionMarginRatioYear1: blendedYear1 === 0 ? 0 : (blendedYear1 - vc) / blendedYear1,
  };
}

/**
 * Bisection solver for a monotonically increasing function f over [lo, hi].
 *
 * As in the IRR solver, the halting test is on the width of the x-bracket
 * rather than on |f(x)|: f here is an NPV in AED, and its slope with respect to
 * a utilisation multiplier runs to millions, so a loose x-tolerance leaves a
 * visibly non-zero NPV at the returned "break-even" point.
 */
function solveForZero(
  f: (x: number) => number,
  lo: number,
  hi: number,
  xTolerance = 1e-13,
  fTolerance = 1e-6,
  maxIterations = 200,
): number | null {
  let fLo = f(lo);
  let fHi = f(hi);
  if (fLo * fHi > 0) return null;

  let mid = lo;
  for (let i = 0; i < maxIterations; i++) {
    mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < fTolerance || (hi - lo) / 2 < xTolerance) break;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return mid;
}

// ---------------------------------------------------------------------------
// Consistency checks
// ---------------------------------------------------------------------------

function runConsistencyChecks(
  result: ModelResult,
  inputs: ProjectInputs,
  dep: DepreciationSchedule,
  totalWorkingCapitalInvested: number,
): ConsistencyCheck[] {
  const checks: ConsistencyCheck[] = [];

  const add = (
    name: string,
    a: number,
    b: number,
    tolerance: number,
    detail: string,
  ) => {
    const delta = Math.abs(a - b);
    checks.push({ name, passed: delta <= tolerance, detail, delta, tolerance });
  };

  // 1. The IRR must actually zero the NPV function. The tolerance is scaled to
  //    the size of the project: a residual of one fils means something very
  //    different on a AED 45,000 outlay than on a AED 7,060,000 one.
  const scale = result.cashFlows.reduce((s, cf) => s + Math.abs(cf), 0);
  if (result.irr.value !== null) {
    add(
      'NPV(IRR) = 0',
      npv(result.irr.value, result.cashFlows),
      0,
      Math.max(1e-6, 1e-9 * scale),
      'The returned IRR is substituted back into the NPV formula; the result must be zero.',
    );
  }

  // 2. PI must satisfy PI = 1 + NPV / |PV of outflows|.
  add(
    'PI identity',
    result.profitabilityIndex,
    1 + result.npv / result.pvOfOutflows,
    1e-9,
    'Profitability Index computed as PV(inflows)/PV(outflows) must equal 1 + NPV/|PV(outflows)|.',
  );

  // 3. MIRR closed form must equal MIRR obtained by root finding.
  const mirrRoot = mirrViaRootFind(result.cashFlows, inputs.financeRate, inputs.reinvestmentRate);
  if (result.mirr !== null && mirrRoot !== null) {
    add(
      'MIRR two ways',
      result.mirr,
      mirrRoot,
      1e-8,
      'Closed-form MIRR must equal the IRR of the collapsed [-PV_neg, ..., FV_pos] series.',
    );
  }

  // 4. Total depreciation charged must reconcile the book value.
  add(
    'Depreciation reconciliation',
    dep.annualDepreciation * inputs.projectLifeYears,
    dep.depreciableBase - dep.closingBookValue,
    1e-6,
    'Sum of annual depreciation must equal capitalised cost less closing book value.',
  );

  // 5. Working capital recovered must equal working capital invested.
  add(
    'Working capital recovery',
    result.terminal.workingCapitalRecovered,
    totalWorkingCapitalInvested,
    1e-6,
    'All working capital committed over the project life must be released at the end.',
  );

  // 6. OCF via the tax-shield formulation must equal OCF via net income + depreciation.
  //    (R - VC - FC)(1 - t) + t*D   ==   (R - VC - FC - D)(1 - t) + D
  //    Only valid where the loss tax shield is recognised.
  if (inputs.taxShieldOnLosses) {
    let maxDelta = 0;
    for (const row of result.years) {
      const viaShield =
        (row.revenue - row.variableCost - row.fixedCost) * (1 - inputs.taxRate) +
        inputs.taxRate * row.depreciation;
      maxDelta = Math.max(maxDelta, Math.abs(viaShield - row.operatingCashFlow));
    }
    add(
      'OCF tax-shield identity',
      maxDelta,
      0,
      1e-6,
      'Operating cash flow computed as (R-VC-FC)(1-t) + t*Depreciation must equal Net Income + Depreciation.',
    );
  }

  // 7. NPV summed from the year rows must equal NPV from the cash-flow array.
  const npvFromRows =
    result.cashFlows[0] + result.years.reduce((s, r) => s + r.presentValue, 0);
  add(
    'NPV cross-foot',
    npvFromRows,
    result.npv,
    1e-6,
    'NPV accumulated from the per-year present values must equal the NPV of the cash-flow series.',
  );

  return checks;
}
