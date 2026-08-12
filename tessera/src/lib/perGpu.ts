/**
 * Decomposes the fleet-level model down to a single GPU, so that clicking one
 * tile of the die shows what that GPU actually earns and costs.
 *
 * This is an allocation, not a separate calculation: every figure is the model's
 * own number for the peak year divided across the fleet. Nothing here can
 * disagree with the appraisal, because nothing here is independently computed.
 *
 * The split between sold and idle GPUs is what makes this worth showing. Capital
 * cost and the share of fixed cost fall on every GPU in the cluster whether or
 * not its capacity is ever sold, so an idle tile is carrying a full share of the
 * cost base against no revenue at all — which is the reason Alternative A's NPV
 * is negative, expressed as a single unit rather than as an aggregate.
 */

import type { ModelResult } from '../engine/types';

export interface GpuUnitEconomics {
  index: number;
  row: number;
  column: number;
  total: number;
  /** True when this GPU's capacity is sold at peak utilisation. */
  isSold: boolean;
  /** The year the die is showing — the one with the highest utilisation. */
  peakYear: number;
  peakUtilisation: number;

  hoursSoldPerYear: number;
  revenuePerYear: number;
  energyCostPerYear: number;
  fixedCostSharePerYear: number;
  /** Revenue less the energy and fixed costs allocated to this GPU. */
  contributionPerYear: number;

  /** Capitalised cost carried by this GPU, incurred whether or not it is sold. */
  capitalCost: number;
  /** Electricity drawn per year, at the model's PUE-adjusted rate. */
  energyKwhPerYear: number;
}

/** kWh drawn per GPU-hour at the wall, including a PUE of 1.35. */
const KWH_PER_GPU_HOUR = 1.35;

export function computeGpuUnitEconomics(
  model: ModelResult,
  index: number,
  columns: number,
): GpuUnitEconomics {
  const gpuCount = model.inputs.gpuCount;
  const utilisations = model.inputs.utilisationByYear;

  // The die renders peak utilisation, so the inspector reports the same year.
  const peakUtilisation = Math.max(...utilisations);
  const peakYearIndex = utilisations.indexOf(peakUtilisation);
  const row = model.years[peakYearIndex];

  const soldCount = Math.max(1, Math.round(gpuCount * peakUtilisation));
  const isSold = index < Math.round(gpuCount * peakUtilisation);

  const hoursSoldPerYear = isSold ? row.utilisedHours / soldCount : 0;
  const revenuePerYear = isSold ? row.revenue / soldCount : 0;
  const energyCostPerYear = isSold ? row.variableCost / soldCount : 0;

  // Fixed costs and capital fall on every GPU, sold or not.
  const fixedCostSharePerYear = row.fixedCost / gpuCount;
  const capitalCost = model.depreciableBase / gpuCount;

  return {
    index,
    row: Math.floor(index / columns) + 1,
    column: (index % columns) + 1,
    total: gpuCount,
    isSold,
    peakYear: row.year,
    peakUtilisation,
    hoursSoldPerYear,
    revenuePerYear,
    energyCostPerYear,
    fixedCostSharePerYear,
    contributionPerYear: revenuePerYear - energyCostPerYear - fixedCostSharePerYear,
    capitalCost,
    energyKwhPerYear: hoursSoldPerYear * KWH_PER_GPU_HOUR,
  };
}
