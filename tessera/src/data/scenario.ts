/**
 * TESSERA — locked base-case scenario data.
 *
 * Meridian AI Studio FZ-LLC, Dubai Internet City.
 * All figures in AED. Model date: August 2026. FX assumption: USD 1 = AED 3.6725
 * (the dirham's peg, fixed since 1997).
 *
 * Every alternative is appraised on an INCREMENTAL basis against Alt 0
 * (continue buying on-demand cloud capacity). Revenue for the owned-hardware
 * options is therefore the sum of:
 *   (a) avoided on-demand cloud spend on internally consumed GPU-hours, and
 *   (b) cash received from reselling surplus GPU-hours to regional clients.
 */

import type { ProjectInputs } from '../engine/types';
import { computeWacc, MERIDIAN_WACC_INPUTS } from '../engine/wacc';

export const WACC_BREAKDOWN = computeWacc(MERIDIAN_WACC_INPUTS);
export const WACC = WACC_BREAKDOWN.wacc;

export const USD_TO_AED = 3.6725;

/** Shared market and policy assumptions. */
export const MARKET = {
  /** What Meridian pays today for hyperscaler on-demand H200 capacity. USD 5.50/GPU-hr. */
  onDemandRateYear1: 20.2,
  /** Price at which surplus owned capacity can be resold regionally. USD 4.00/GPU-hr. */
  resaleRateYear1: 14.7,
  /**
   * Reserved rate obtainable at Meridian's committed volume — a 22% discount.
   * Deliberately not the 35-40% headline discount, which requires a commitment
   * far above this studio's demand.
   */
  reservedRateYear1: 15.75,
  /** Annual decline in GPU compute prices. The dominant risk driver. */
  priceErosionRate: 0.08,
  /** Power at the wall per GPU-hour, including PUE 1.35, plus bandwidth and storage wear. */
  variableCostPerGpuHour: 0.7,
  taxRate: 0.09,
  hoursPerYear: 8760,
  availabilityFactor: 0.96,
  fixedCostEscalation: 0.03,
  /** Already incurred before the decision point — irrelevant to the appraisal. */
  sunkCost: 120000,
  sunkCostNote:
    'Thermal and power feasibility study commissioned Q1 2026 and paid in full. ' +
    'The cash has gone regardless of which option is chosen, so it is excluded from every alternative.',
};

const RATE_PARAMS = {
  taxRate: MARKET.taxRate,
  wacc: WACC,
  reinvestmentRate: WACC,
  financeRate: MERIDIAN_WACC_INPUTS.preTaxCostOfDebt * (1 - MARKET.taxRate),
  taxShieldOnLosses: true,
  hoursPerYear: MARKET.hoursPerYear,
  availabilityFactor: MARKET.availabilityFactor,
  priceErosionRate: MARKET.priceErosionRate,
  fixedCostEscalation: MARKET.fixedCostEscalation,
  sunkCost: MARKET.sunkCost,
  sunkCostNote: MARKET.sunkCostNote,
};

// ---------------------------------------------------------------------------
// Alternative A — buy the full 32-GPU cluster
// ---------------------------------------------------------------------------

export const ALT_A: ProjectInputs = {
  ...RATE_PARAMS,
  id: 'A',
  label: 'Own — Full 32-GPU Cluster',
  description:
    'Purchase four HGX H200 8-GPU nodes outright, racked in leased Dubai colocation. ' +
    'Serves all internal inference demand and resells surplus capacity to regional clients.',

  equipmentCost: 5_860_000,
  installTransportCost: 700_000,

  workingCapitalMode: 'fixed',
  workingCapitalInitial: 500_000,
  workingCapitalPercentOfRevenue: 0.08,

  projectLifeYears: 5,

  gpuCount: 32,
  utilisationByYear: [0.65, 0.8, 0.85, 0.84, 0.78],

  internalSharePct: 0.6,
  internalRateYear1: MARKET.onDemandRateYear1,
  externalRateYear1: MARKET.resaleRateYear1,

  variableCostPerGpuHour: MARKET.variableCostPerGpuHour,
  fixedCostComponents: [
    { label: 'Colocation space & cooling (4 racks)', year1Amount: 520_000, startYear: 1 },
    { label: 'Hardware support & warranty contract', year1Amount: 245_000, startYear: 2,
      note: 'Year 1 is covered by the manufacturer warranty included in the purchase price.' },
    { label: 'Platform / MLOps engineer (1.0 incremental FTE)', year1Amount: 320_000, startYear: 1 },
    { label: 'Insurance, licences & monitoring', year1Amount: 110_000, startYear: 1 },
    { label: 'Foregone sublease of owned technical room (45 m²)', year1Amount: 86_000, startYear: 1,
      isOpportunityCost: true,
      note: 'Opportunity cost: the room is owned, but using it forfeits AED 86,000/yr of sublease income.' },
  ],

  depreciationMethod: 'straightLineToSalvage',
  salvageRateOfEquipment: 0.18,
  depreciationSalvageRateEstimate: 0.18,
};

// ---------------------------------------------------------------------------
// Alternative B — 3-year cloud reserved commitment (contractual, not capital)
// ---------------------------------------------------------------------------
//
// Modelled inside the same engine as follows:
//   revenue    = committed GPU-hours actually consumed, valued at the on-demand
//                rate that would otherwise have been paid (this is the benefit)
//   fixed cost = the locked annual commitment payment (escalation set to zero,
//                because a locked price is precisely what is being bought)
//   utilisation is capped at the commitment level, since hours consumed beyond
//   the commitment are billed at on-demand rates and therefore yield no saving.

const COMMITMENT_LEVEL = 0.8;
const COMMITTED_HOURS =
  32 * MARKET.hoursPerYear * MARKET.availabilityFactor * COMMITMENT_LEVEL;

export const ALT_B: ProjectInputs = {
  ...RATE_PARAMS,
  id: 'B',
  label: 'Rent — 3-Year Reserved Commitment',
  description:
    'Sign a three-year reserved-capacity commitment with the incumbent hyperscaler. ' +
    'No capital outlay and no residual asset, but the committed volume must be paid ' +
    'for whether or not it is consumed, and the locked rate cannot fall.',

  equipmentCost: 0,
  installTransportCost: 45_000,

  workingCapitalMode: 'fixed',
  workingCapitalInitial: 0,
  workingCapitalPercentOfRevenue: 0,

  projectLifeYears: 3,

  gpuCount: 32,
  utilisationByYear: [0.65, COMMITMENT_LEVEL, COMMITMENT_LEVEL],

  internalSharePct: 1.0,
  internalRateYear1: MARKET.onDemandRateYear1,
  externalRateYear1: 0,

  variableCostPerGpuHour: 0,
  fixedCostComponents: [
    {
      label: 'Reserved capacity commitment (locked for 3 years)',
      year1Amount: COMMITTED_HOURS * MARKET.reservedRateYear1,
      startYear: 1,
      note: 'Payable in full whether or not the committed hours are consumed.',
    },
  ],
  fixedCostEscalation: 0,

  depreciationMethod: 'straightLineToZero',
  salvageRateOfEquipment: 0,
};

// ---------------------------------------------------------------------------
// Alternative C — hybrid: own the saturated baseline, rent the peak
// ---------------------------------------------------------------------------

export const ALT_C: ProjectInputs = {
  ...RATE_PARAMS,
  id: 'C',
  label: 'Hybrid — Own 16 GPUs, Burst to Cloud',
  description:
    'Purchase two HGX H200 nodes sized to the demand that is structurally always-on, ' +
    'and continue to serve peak demand from on-demand cloud. Peak hours are bought at ' +
    'status-quo prices, so they carry no incremental effect either way.',

  equipmentCost: 3_110_000,
  installTransportCost: 420_000,

  workingCapitalMode: 'fixed',
  workingCapitalInitial: 300_000,
  workingCapitalPercentOfRevenue: 0.08,

  projectLifeYears: 5,

  gpuCount: 16,
  utilisationByYear: [0.9, 0.92, 0.92, 0.9, 0.86],

  internalSharePct: 0.85,
  internalRateYear1: MARKET.onDemandRateYear1,
  externalRateYear1: MARKET.resaleRateYear1,

  variableCostPerGpuHour: MARKET.variableCostPerGpuHour,
  fixedCostComponents: [
    { label: 'Colocation space & cooling (2 racks)', year1Amount: 260_000, startYear: 1 },
    { label: 'Hardware support & warranty contract', year1Amount: 125_000, startYear: 2 },
    { label: 'Platform / MLOps engineer (0.6 incremental FTE)', year1Amount: 200_000, startYear: 1 },
    { label: 'Insurance, licences & monitoring', year1Amount: 70_000, startYear: 1 },
    { label: 'Foregone sublease of owned technical room (45 m²)', year1Amount: 86_000, startYear: 1,
      isOpportunityCost: true },
  ],

  depreciationMethod: 'straightLineToSalvage',
  salvageRateOfEquipment: 0.18,
  depreciationSalvageRateEstimate: 0.18,
};

// ---------------------------------------------------------------------------
// Alternative B extended — diagnostic only, not a real option on the table
// ---------------------------------------------------------------------------
//
// Equivalent Annual Annuity compares unequal lives by assuming each option can
// be replicated on identical terms for ever. For a locked price in a market
// where prices fall 8% a year, that assumption is doing enormous work. This
// variant runs the same commitment over five years to show what the locked rate
// is worth once on-demand prices have fallen past it. It exists to stress-test
// Alt B's EAA ranking, not to be chosen.

export const ALT_B_EXTENDED: ProjectInputs = {
  ...ALT_B,
  id: 'B5',
  label: 'Rent — Same Commitment Held for 5 Years (diagnostic)',
  description:
    'The three-year reserved commitment extended over the five-year horizon used ' +
    'for the owned-hardware options, to test whether the locked rate remains a saving.',
  projectLifeYears: 5,
  utilisationByYear: [
    0.65,
    COMMITMENT_LEVEL,
    COMMITMENT_LEVEL,
    COMMITMENT_LEVEL,
    COMMITMENT_LEVEL,
  ],
};

export const ALTERNATIVES: ProjectInputs[] = [ALT_A, ALT_B, ALT_C];
export const DIAGNOSTICS: ProjectInputs[] = [ALT_B_EXTENDED];
export const BASE_CASE = ALT_A;
