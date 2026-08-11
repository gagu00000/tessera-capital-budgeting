/**
 * Dumps the TypeScript engine's results to JSON so that the independent Python
 * implementation in verification/verify_model.py can compare against them.
 *
 * Run with:  npx vite-node scripts/export-results.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeModel } from '../src/engine/model';
import { ALTERNATIVES, DIAGNOSTICS, WACC, WACC_BREAKDOWN } from '../src/data/scenario';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '../../verification/ts-results.json');

const payload = {
  generatedAt: new Date().toISOString(),
  wacc: WACC,
  waccBreakdown: WACC_BREAKDOWN,
  alternatives: [...ALTERNATIVES, ...DIAGNOSTICS].map((inputs) => {
    const m = computeModel(inputs);
    return {
      id: inputs.id,
      label: inputs.label,
      projectLifeYears: inputs.projectLifeYears,
      cashFlows: m.cashFlows,
      initial: m.initial,
      terminal: m.terminal,
      depreciableBase: m.depreciableBase,
      annualDepreciation: m.annualDepreciation,
      salvageValue: m.salvageValue,
      npv: m.npv,
      irr: m.irr.value,
      irrRoots: m.irr.roots,
      irrIsConventional: m.irr.isConventional,
      irrSignChanges: m.irr.signChanges,
      mirr: m.mirr,
      profitabilityIndex: m.profitabilityIndex,
      paybackPeriod: m.paybackPeriod,
      discountedPaybackPeriod: m.discountedPaybackPeriod,
      arr: m.arr,
      arrInitialBasis: m.arrInitialBasis,
      equivalentAnnualAnnuity: m.equivalentAnnualAnnuity,
      pvOfInflows: m.pvOfInflows,
      pvOfOutflows: m.pvOfOutflows,
      capitalIntensity: m.capitalIntensity,
      ratioMetricsMeaningful: m.ratioMetricsMeaningful,
      breakEven: m.breakEven,
      years: m.years.map((y) => ({
        year: y.year,
        utilisation: y.utilisation,
        utilisedHours: y.utilisedHours,
        revenue: y.revenue,
        variableCost: y.variableCost,
        fixedCost: y.fixedCost,
        depreciation: y.depreciation,
        ebit: y.ebit,
        tax: y.tax,
        netIncome: y.netIncome,
        operatingCashFlow: y.operatingCashFlow,
        netCashFlow: y.netCashFlow,
        presentValue: y.presentValue,
      })),
      checks: m.checks,
      allChecksPass: m.allChecksPass,
    };
  }),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(`Wrote ${outPath}`);
