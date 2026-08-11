/**
 * Best-case, base-case and worst-case scenario analysis.
 *
 * These are not uniform +/-10% shocks applied to every input independently. The
 * drivers are correlated in reality and the scenarios say so explicitly: a more
 * aggressive fall in cloud prices simultaneously depresses the resale price the
 * surplus capacity can command AND the second-hand value of the hardware, because
 * all three are driven by the same underlying glut of compute supply. Shocking
 * them independently would understate the downside, which is the failure mode
 * that makes naive scenario analysis worse than none at all.
 */

import type { ProjectInputs, ModelResult } from './types';
import { computeModel } from './model';

export type ScenarioId = 'worst' | 'base' | 'best';

export interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  narrative: string;
  /** Human-readable list of what moved and to where. */
  assumptions: string[];
  apply: (inputs: ProjectInputs) => ProjectInputs;
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'worst',
    label: 'Worst case',
    narrative:
      'Compute supply outruns demand. Hyperscalers cut prices hard, the regional resale ' +
      'market softens with them, and second-hand hardware values fall in step. Colocation ' +
      'and power costs rise faster than planned.',
    assumptions: [
      'GPU price erosion accelerates to 14% a year',
      'Utilisation reaches only 80% of the planned profile',
      'Equipment costs 12% more than quoted',
      'Salvage realises 8% of original cost, against an 18% book estimate',
      'Fixed costs escalate at 6% a year',
    ],
    apply: (i) => ({
      ...i,
      priceErosionRate: 0.14,
      utilisationByYear: i.utilisationByYear.map((u) => Math.min(1, u * 0.8)),
      equipmentCost: i.equipmentCost * 1.12,
      salvageRateOfEquipment: 0.08,
      fixedCostEscalation: 0.06,
    }),
  },
  {
    id: 'base',
    label: 'Base case',
    narrative:
      'Prices fall at the rate implied by the last two hardware generations, the ramp ' +
      'proceeds as planned, and costs escalate broadly with regional inflation.',
    assumptions: [
      'GPU price erosion of 8% a year',
      'Utilisation follows the planned profile, peaking at 85%',
      'Equipment costs as quoted',
      'Salvage realises 18% of original cost',
      'Fixed costs escalate at 3% a year',
    ],
    apply: (i) => i,
  },
  {
    id: 'best',
    label: 'Best case',
    narrative:
      'Regional demand for sovereign, in-country inference capacity outpaces supply. ' +
      'Price erosion slows, the cluster runs close to saturation, and hardware holds ' +
      'its value better than the depreciation schedule assumed.',
    assumptions: [
      'GPU price erosion slows to 4% a year',
      'Utilisation runs 10% above the planned profile',
      'Equipment costs 6% below quotation',
      'Salvage realises 26% of original cost, producing a taxable gain on disposal',
      'Fixed costs escalate at 2% a year',
    ],
    apply: (i) => ({
      ...i,
      priceErosionRate: 0.04,
      utilisationByYear: i.utilisationByYear.map((u) => Math.min(1, u * 1.1)),
      equipmentCost: i.equipmentCost * 0.94,
      salvageRateOfEquipment: 0.26,
      fixedCostEscalation: 0.02,
    }),
  },
];

export interface ScenarioResult {
  definition: ScenarioDefinition;
  model: ModelResult;
}

export function computeScenarios(inputs: ProjectInputs): ScenarioResult[] {
  return SCENARIOS.map((definition) => ({
    definition,
    model: computeModel(definition.apply(inputs)),
  }));
}
