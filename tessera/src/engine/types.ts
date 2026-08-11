/**
 * TESSERA — Capital Budgeting Engine
 * Core type definitions.
 *
 * All monetary values are in AED (nominal, undiscounted unless stated).
 * All rates are decimal fractions (0.09 = 9%), never percentages.
 *
 * Year indexing convention used throughout the engine:
 *   t = 0  -> the investment date (initial outlay)
 *   t = 1..N -> end of operating year t
 */

/** A single named fixed-cost line item. */
export interface FixedCostComponent {
  label: string;
  /** Amount in Year 1 money terms (AED), before escalation. */
  year1Amount: number;
  /** First operating year in which this cost is incurred (1-based). */
  startYear: number;
  /** True if this line is an opportunity cost rather than a cash expense. */
  isOpportunityCost?: boolean;
  note?: string;
}

export type DepreciationMethod = 'straightLineToSalvage' | 'straightLineToZero';
export type WorkingCapitalMode = 'fixed' | 'percentOfRevenue';
export type ArrBasis = 'averageInvestment' | 'initialInvestment';

export interface ProjectInputs {
  id: string;
  label: string;
  description: string;

  // ---- Capital outlay -------------------------------------------------
  /** Hardware cost (depreciable, and the base for salvage %). */
  equipmentCost: number;
  /** Installation, freight, customs, commissioning — capitalised into the depreciable base. */
  installTransportCost: number;

  // ---- Working capital ------------------------------------------------
  workingCapitalMode: WorkingCapitalMode;
  /** Used when mode = 'fixed'. Invested at t=0, recovered in full at t=N. */
  workingCapitalInitial: number;
  /** Used when mode = 'percentOfRevenue'. Fraction of the coming year's revenue. */
  workingCapitalPercentOfRevenue: number;

  // ---- Horizon --------------------------------------------------------
  projectLifeYears: number;

  // ---- Capacity -------------------------------------------------------
  gpuCount: number;
  hoursPerYear: number;
  /** Fraction of wall-clock hours the fleet is available (maintenance downtime removed). */
  availabilityFactor: number;
  /** Utilisation of available hours, one entry per operating year. */
  utilisationByYear: number[];

  // ---- Revenue --------------------------------------------------------
  /** Share of utilised hours consumed internally (valued at the avoided cloud rate). */
  internalSharePct: number;
  /** Year-1 avoided cloud rate, AED per GPU-hour. */
  internalRateYear1: number;
  /** Year-1 external resale price, AED per GPU-hour. */
  externalRateYear1: number;
  /** Annual decline in both rates (0.08 = prices fall 8% per year). */
  priceErosionRate: number;

  // ---- Operating costs ------------------------------------------------
  /** AED per utilised GPU-hour (power at PUE + bandwidth + storage wear). */
  variableCostPerGpuHour: number;
  fixedCostComponents: FixedCostComponent[];
  /** Annual escalation applied to every fixed-cost component. */
  fixedCostEscalation: number;

  // ---- Depreciation & salvage ----------------------------------------
  depreciationMethod: DepreciationMethod;
  /** REALISED salvage on disposal, as a fraction of equipmentCost. */
  salvageRateOfEquipment: number;
  /**
   * The salvage ESTIMATE made at purchase, which fixes the depreciation
   * schedule for the whole life of the asset. Defaults to
   * `salvageRateOfEquipment`, so in the base case book value lands exactly on
   * salvage and no gain or loss arises.
   *
   * Holding this separate matters for sensitivity analysis: the depreciation
   * charge was locked in years ago and cannot retrospectively change, so moving
   * the realised salvage must produce a taxable gain or a tax-deductible loss
   * on disposal. Collapsing the two would silently suppress that tax effect.
   */
  depreciationSalvageRateEstimate?: number;

  // ---- Rates ----------------------------------------------------------
  taxRate: number;
  /** Discount rate used for NPV, PI, discounted payback. */
  wacc: number;
  /** MIRR reinvestment rate for positive cash flows. */
  reinvestmentRate: number;
  /** MIRR finance rate for negative cash flows. */
  financeRate: number;

  /**
   * If true, an operating loss generates a tax credit at `taxRate`, on the
   * assumption the loss is offset against the wider entity's taxable profit.
   * If false, tax is floored at zero in loss years.
   */
  taxShieldOnLosses: boolean;

  // ---- Excluded from the appraisal, displayed for transparency --------
  /** Already incurred, therefore irrelevant to the decision. Never enters any cash flow. */
  sunkCost: number;
  sunkCostNote: string;
}

/** Per-year operating detail — the income-statement / cash-flow bridge. */
export interface YearRow {
  year: number;
  utilisation: number;
  availableHours: number;
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
  contribution: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  tax: number;
  netIncome: number;
  operatingCashFlow: number;
  /** Cash invested in (positive) or released from (negative) working capital at end of this year. */
  workingCapitalInvestment: number;
  /** Cumulative working capital tied up at the end of this year. */
  workingCapitalBalance: number;
  /** Terminal items recognised in this year (after-tax salvage + WC recovery). */
  terminalCashFlow: number;
  netCashFlow: number;
  discountFactor: number;
  presentValue: number;
  cumulativeCashFlow: number;
  cumulativeDiscountedCashFlow: number;
  closingBookValue: number;
}

export interface InitialCashFlowBreakdown {
  equipmentCost: number;
  installTransportCost: number;
  capitalisedCost: number;
  workingCapital: number;
  total: number;
  sunkCostExcluded: number;
}

export interface TerminalCashFlowBreakdown {
  salvageValue: number;
  closingBookValue: number;
  gainOrLossOnDisposal: number;
  taxOnDisposal: number;
  afterTaxSalvage: number;
  workingCapitalRecovered: number;
  total: number;
}

export interface BreakEvenResult {
  /** Utilisation at which EBIT = 0, evaluated year by year. */
  accountingByYear: number[];
  /** Utilisation at which operating cash flow before tax = 0 (depreciation excluded). */
  cashByYear: number[];
  /** Life-average accounting break-even utilisation. */
  accountingAverage: number;
  /** Life-average cash break-even utilisation. */
  cashAverage: number;
  /** Multiplier on the utilisation vector that drives NPV to zero. */
  npvBreakEvenUtilisationFactor: number | null;
  /** Peak utilisation implied by that multiplier. */
  npvBreakEvenPeakUtilisation: number | null;
  /** Year-1 blended AED/GPU-hour at which NPV = 0 (holding volumes constant). */
  npvBreakEvenBlendedRate: number | null;
  /** Contribution margin per GPU-hour, year 1. */
  contributionMarginYear1: number;
  contributionMarginRatioYear1: number;
}

export interface IrrResult {
  /** The lowest root found, or null when none exists. */
  value: number | null;
  converged: boolean;
  /** Every rate at which NPV crosses zero, ascending. More than one means IRR is ambiguous. */
  roots: number[];
  /** Number of sign changes in the cash-flow series. >1 means IRR may be non-unique. */
  signChanges: number;
  /** True only when the series has one sign change and exactly one root was located. */
  isConventional: boolean;
  /** Residual NPV at the returned rate — must be ~0 for a valid root. */
  residual: number | null;
}

export interface ModelResult {
  inputs: ProjectInputs;
  years: YearRow[];
  cashFlows: number[];

  initial: InitialCashFlowBreakdown;
  terminal: TerminalCashFlowBreakdown;

  depreciableBase: number;
  annualDepreciation: number;
  salvageValue: number;

  npv: number;
  irr: IrrResult;
  mirr: number | null;
  profitabilityIndex: number;
  paybackPeriod: number | null;
  discountedPaybackPeriod: number | null;
  arr: number;
  arrInitialBasis: number;
  equivalentAnnualAnnuity: number;

  pvOfInflows: number;
  pvOfOutflows: number;

  /** Initial outlay as a multiple of average annual revenue/benefit. */
  capitalIntensity: number;
  /**
   * False when the option employs almost no capital (a contractual rather than
   * capital commitment). Ratio metrics — IRR, PI, ARR, payback — all divide by
   * invested capital, so they explode toward infinity and become meaningless.
   * NPV and EAA remain valid and should be used instead.
   */
  ratioMetricsMeaningful: boolean;

  breakEven: BreakEvenResult;

  /** Internal consistency checks — all must pass for the result to be trusted. */
  checks: ConsistencyCheck[];
  allChecksPass: boolean;
}

export interface ConsistencyCheck {
  name: string;
  passed: boolean;
  detail: string;
  /** Absolute difference between the two independently computed quantities. */
  delta: number;
  tolerance: number;
}
