/**
 * Sensitivity analysis.
 *
 * A driver is a named, bounded quantity that the appraisal depends on, together
 * with a function that writes a value of it back into the model inputs. Holding
 * drivers as data rather than as bespoke code per chart means the tornado,
 * spider, two-way grid and switching-value calculations all consume the same
 * definitions and cannot drift apart.
 */

import type { ProjectInputs } from './types';
import { computeModel } from './model';

export type DriverFormat = 'percent' | 'multiple' | 'currency' | 'rate';

export interface Driver {
  id: string;
  label: string;
  /** One-line explanation for the non-finance reader. */
  description: string;
  format: DriverFormat;
  /** Downside end of the plausible range. */
  min: number;
  base: number;
  /** Upside end of the plausible range. */
  max: number;
  /** Absolute bounds for switching-value searches, wider than the plausible range. */
  searchMin: number;
  searchMax: number;
  apply: (inputs: ProjectInputs, value: number) => ProjectInputs;
  /** Semantic colour token used by the charts. */
  tone: 'cyan' | 'magenta' | 'amber' | 'verdant' | 'iris';
}

/**
 * The drivers carried forward into the tornado chart, with plausible ranges
 * taken from the assumption sources rather than a uniform +/-30% shock. A blanket
 * percentage swing on every input would rank drivers by how wide the swing was
 * allowed to be rather than by how uncertain they genuinely are.
 */
export function buildDrivers(base: ProjectInputs): Driver[] {
  return [
    {
      id: 'priceErosion',
      label: 'GPU price erosion',
      description:
        'Annual rate at which the market price of GPU compute falls. Cuts both the ' +
        'avoided cloud cost and the resale price.',
      format: 'percent',
      min: 0.14,
      base: base.priceErosionRate,
      max: 0.04,
      searchMin: 0.0,
      searchMax: 0.35,
      tone: 'magenta',
      apply: (i, v) => ({ ...i, priceErosionRate: v }),
    },
    {
      id: 'utilisation',
      label: 'Utilisation',
      description:
        'Multiplier on the planned utilisation profile. Captures both slower ramp-up ' +
        'and weaker demand for resold capacity.',
      format: 'multiple',
      min: 0.8,
      base: 1,
      max: 1.1,
      searchMin: 0.2,
      searchMax: 1.4,
      tone: 'cyan',
      apply: (i, v) => ({
        ...i,
        utilisationByYear: base.utilisationByYear.map((u) => Math.min(1, u * v)),
      }),
    },
    {
      id: 'capex',
      label: 'Equipment cost',
      description: 'Multiplier on hardware cost, covering vendor pricing and FX movement.',
      format: 'multiple',
      min: 1.12,
      base: 1,
      max: 0.94,
      searchMin: 0.5,
      searchMax: 2.5,
      tone: 'amber',
      apply: (i, v) => ({ ...i, equipmentCost: base.equipmentCost * v }),
    },
    {
      id: 'resalePrice',
      label: 'Resale price',
      description: 'Year-1 price achieved on surplus GPU-hours sold to regional clients.',
      format: 'currency',
      min: base.externalRateYear1 * 0.75,
      base: base.externalRateYear1,
      max: base.externalRateYear1 * 1.15,
      searchMin: 0,
      searchMax: base.externalRateYear1 * 3,
      tone: 'cyan',
      apply: (i, v) => ({ ...i, externalRateYear1: v }),
    },
    {
      id: 'fixedCostEscalation',
      label: 'Fixed cost escalation',
      description: 'Annual increase in colocation, staffing, support and insurance costs.',
      format: 'percent',
      min: 0.06,
      base: base.fixedCostEscalation,
      max: 0.02,
      searchMin: -0.05,
      searchMax: 0.3,
      tone: 'amber',
      apply: (i, v) => ({ ...i, fixedCostEscalation: v }),
    },
    {
      id: 'salvage',
      label: 'Salvage value',
      description:
        'Realised resale value of the hardware at the end of year 5, as a share of ' +
        'original cost. The depreciation schedule does not move with it, so a shortfall ' +
        'creates a deductible loss on disposal.',
      format: 'percent',
      min: 0.08,
      base: base.salvageRateOfEquipment,
      max: 0.26,
      searchMin: 0,
      searchMax: 0.6,
      tone: 'verdant',
      apply: (i, v) => ({ ...i, salvageRateOfEquipment: v }),
    },
    {
      id: 'wacc',
      label: 'Cost of capital',
      description: 'Discount rate applied to every future cash flow.',
      format: 'percent',
      min: base.wacc + 0.03,
      base: base.wacc,
      max: base.wacc - 0.03,
      searchMin: 0.01,
      searchMax: 0.6,
      tone: 'iris',
      apply: (i, v) => ({ ...i, wacc: v, reinvestmentRate: v }),
    },
    {
      id: 'powerCost',
      label: 'Power & bandwidth cost',
      description: 'Variable cost per GPU-hour, dominated by the electricity tariff at PUE 1.35.',
      format: 'currency',
      min: base.variableCostPerGpuHour * 1.6,
      base: base.variableCostPerGpuHour,
      max: base.variableCostPerGpuHour * 0.8,
      searchMin: 0,
      searchMax: base.variableCostPerGpuHour * 30,
      tone: 'amber',
      apply: (i, v) => ({ ...i, variableCostPerGpuHour: v }),
    },
    {
      id: 'taxRate',
      label: 'Corporate tax rate',
      description:
        'UAE corporate tax is 9%. The upper bound tests the same project under a ' +
        'conventional 25% regime.',
      format: 'percent',
      min: 0.25,
      base: base.taxRate,
      max: 0.0,
      searchMin: 0,
      searchMax: 0.6,
      tone: 'iris',
      apply: (i, v) => ({ ...i, taxRate: v }),
    },
  ];
}

export interface TornadoBar {
  driver: Driver;
  npvAtMin: number;
  npvAtMax: number;
  /** Absolute NPV distance between the two ends — the bar length. */
  swing: number;
  /** Value of the driver at which NPV becomes zero, or null if unreachable in range. */
  switchingValue: number | null;
}

export function computeTornado(inputs: ProjectInputs, drivers: Driver[]): TornadoBar[] {
  const bars = drivers.map((driver) => {
    const npvAtMin = computeModel(driver.apply(inputs, driver.min), { skipBreakEven: true, skipIrr: true }).npv;
    const npvAtMax = computeModel(driver.apply(inputs, driver.max), { skipBreakEven: true, skipIrr: true }).npv;
    return {
      driver,
      npvAtMin,
      npvAtMax,
      swing: Math.abs(npvAtMax - npvAtMin),
      switchingValue: computeSwitchingValue(inputs, driver),
    };
  });
  return bars.sort((a, b) => b.swing - a.swing);
}

/**
 * The value of a driver at which NPV crosses zero — the point at which the
 * decision flips. More informative than a percentage shock, because it is
 * expressed in the driver's own units and can be compared against what the
 * business believes is achievable.
 */
export function computeSwitchingValue(inputs: ProjectInputs, driver: Driver): number | null {
  const f = (v: number) => computeModel(driver.apply(inputs, v), { skipBreakEven: true, skipIrr: true }).npv;

  let lo = driver.searchMin;
  let hi = driver.searchMax;
  let fLo = f(lo);
  let fHi = f(hi);

  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return null; // NPV never crosses zero anywhere in range

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < 1e-6 || (hi - lo) / 2 < 1e-12) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export interface SpiderPoint {
  /** Proportional change applied to the driver, e.g. -0.2 for a 20% reduction. */
  change: number;
  npv: number;
}

export interface SpiderSeries {
  driver: Driver;
  points: SpiderPoint[];
}

/**
 * Spider chart: NPV against a uniform proportional change in each driver.
 * Unlike the tornado, every driver is shocked by the same relative amount, so
 * the steepness of each line is directly comparable.
 */
export function computeSpider(
  inputs: ProjectInputs,
  drivers: Driver[],
  changes: number[] = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3],
): SpiderSeries[] {
  return drivers.map((driver) => ({
    driver,
    points: changes.map((change) => ({
      change,
      npv: computeModel(driver.apply(inputs, driver.base * (1 + change)), { skipBreakEven: true, skipIrr: true }).npv,
    })),
  }));
}

export interface TwoWayCell {
  x: number;
  y: number;
  npv: number;
}

/** Two-way sensitivity grid across the plausible ranges of two drivers. */
export function computeTwoWayGrid(
  inputs: ProjectInputs,
  driverX: Driver,
  driverY: Driver,
  steps = 11,
): TwoWayCell[] {
  const cells: TwoWayCell[] = [];
  const spanX = driverX.max - driverX.min;
  const spanY = driverY.max - driverY.min;

  for (let iy = 0; iy < steps; iy++) {
    const y = driverY.min + (spanY * iy) / (steps - 1);
    for (let ix = 0; ix < steps; ix++) {
      const x = driverX.min + (spanX * ix) / (steps - 1);
      const modified = driverY.apply(driverX.apply(inputs, x), y);
      cells.push({ x, y, npv: computeModel(modified, { skipBreakEven: true, skipIrr: true }).npv });
    }
  }
  return cells;
}
