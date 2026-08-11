/**
 * Console report of the full appraisal — used during development to inspect the
 * engine's output, and to produce the figures quoted in the written report.
 *
 * Run with:  npx vite-node scripts/report.ts
 */

import { computeModel } from '../src/engine/model';
import { ALTERNATIVES, DIAGNOSTICS, WACC, WACC_BREAKDOWN } from '../src/data/scenario';
import type { ModelResult } from '../src/engine/types';

const aed = (n: number) =>
  n.toLocaleString('en-AE', { maximumFractionDigits: 0 }).padStart(14);
const pct = (n: number | null, dp = 2) =>
  n === null ? '        n/a' : `${(n * 100).toFixed(dp)}%`.padStart(11);
const num = (n: number | null, dp = 3) =>
  n === null ? '     never' : n.toFixed(dp).padStart(11);

console.log('\n================ WACC DERIVATION ================');
console.log(`  Levered beta (Hamada)      ${WACC_BREAKDOWN.leveredBeta.toFixed(4)}`);
console.log(`  Cost of equity (CAPM)      ${pct(WACC_BREAKDOWN.costOfEquity)}`);
console.log(`  After-tax cost of debt     ${pct(WACC_BREAKDOWN.afterTaxCostOfDebt)}`);
console.log(`  WACC                       ${pct(WACC, 4)}`);

function report(m: ModelResult) {
  const i = m.inputs;
  console.log(`\n\n================ ALTERNATIVE ${i.id} — ${i.label} ================`);

  console.log('\n-- Initial cash flow --');
  console.log(`  Equipment                  ${aed(m.initial.equipmentCost)}`);
  console.log(`  Installation & transport   ${aed(m.initial.installTransportCost)}`);
  console.log(`  Capitalised (depreciable)  ${aed(m.initial.capitalisedCost)}`);
  console.log(`  Working capital            ${aed(m.initial.workingCapital)}`);
  console.log(`  TOTAL CF0                  ${aed(m.initial.total)}`);
  console.log(`  [excluded] sunk cost       ${aed(m.initial.sunkCostExcluded)}`);

  console.log('\n-- Operating years --');
  console.log(
    '  Yr   Util   UtilHrs        Revenue      VarCost      FixCost         Dep         EBIT          Tax          OCF      NetCF           PV',
  );
  for (const r of m.years) {
    console.log(
      `  ${String(r.year).padStart(2)}  ${(r.utilisation * 100).toFixed(0).padStart(4)}% ` +
        `${r.utilisedHours.toFixed(0).padStart(9)} ${aed(r.revenue)} ${aed(r.variableCost)} ` +
        `${aed(r.fixedCost)} ${aed(r.depreciation)} ${aed(r.ebit)} ${aed(r.tax)} ` +
        `${aed(r.operatingCashFlow)} ${aed(r.netCashFlow)} ${aed(r.presentValue)}`,
    );
  }

  console.log('\n-- Terminal cash flow --');
  console.log(`  Salvage value              ${aed(m.terminal.salvageValue)}`);
  console.log(`  Closing book value         ${aed(m.terminal.closingBookValue)}`);
  console.log(`  Gain/(loss) on disposal    ${aed(m.terminal.gainOrLossOnDisposal)}`);
  console.log(`  Tax on disposal            ${aed(m.terminal.taxOnDisposal)}`);
  console.log(`  After-tax salvage          ${aed(m.terminal.afterTaxSalvage)}`);
  console.log(`  Working capital recovered  ${aed(m.terminal.workingCapitalRecovered)}`);
  console.log(`  TOTAL terminal             ${aed(m.terminal.total)}`);

  console.log('\n-- Decision metrics --');
  console.log(`  NPV @ ${(WACC * 100).toFixed(2)}%             ${aed(m.npv)}`);
  console.log(`  IRR                        ${pct(m.irr.value)}   (sign changes: ${m.irr.signChanges}, conventional: ${m.irr.isConventional})`);
  console.log(`  MIRR                       ${pct(m.mirr)}`);
  console.log(`  Profitability Index        ${num(m.profitabilityIndex)}`);
  console.log(`  Payback period (yrs)       ${num(m.paybackPeriod)}`);
  console.log(`  Discounted payback (yrs)   ${num(m.discountedPaybackPeriod)}`);
  console.log(`  ARR (avg investment)       ${pct(m.arr)}`);
  console.log(`  ARR (initial investment)   ${pct(m.arrInitialBasis)}`);
  console.log(`  Equivalent Annual Annuity  ${aed(m.equivalentAnnualAnnuity)}   (life ${i.projectLifeYears} yrs)`);
  console.log(`  PV of inflows              ${aed(m.pvOfInflows)}`);
  console.log(`  PV of outflows             ${aed(m.pvOfOutflows)}`);

  console.log('\n-- Break-even --');
  const be = m.breakEven;
  console.log(`  Contribution margin/GPU-hr ${be.contributionMarginYear1.toFixed(2)} AED  (${(be.contributionMarginRatioYear1 * 100).toFixed(1)}% of revenue)`);
  console.log(`  Accounting BE utilisation  ${be.accountingByYear.map((v) => (v * 100).toFixed(1) + '%').join('  ')}`);
  console.log(`  Cash BE utilisation        ${be.cashByYear.map((v) => (v * 100).toFixed(1) + '%').join('  ')}`);
  console.log(`  NPV BE utilisation factor  ${num(be.npvBreakEvenUtilisationFactor)}`);
  console.log(`  NPV BE peak utilisation    ${pct(be.npvBreakEvenPeakUtilisation, 1)}`);
  console.log(`  NPV BE blended rate        ${be.npvBreakEvenBlendedRate?.toFixed(2)} AED/GPU-hr (vs actual ${m.years[0].blendedRate.toFixed(2)})`);

  console.log('\n-- Consistency checks --');
  for (const c of m.checks) {
    console.log(`  [${c.passed ? 'PASS' : 'FAIL'}] ${c.name.padEnd(30)} delta=${c.delta.toExponential(3)} (tol ${c.tolerance.toExponential(1)})`);
  }
  console.log(`  ALL CHECKS PASS: ${m.allChecksPass}`);

  console.log('\n-- Cash flow series --');
  console.log('  ' + m.cashFlows.map((c) => c.toFixed(2)).join('  '));
}

const results = ALTERNATIVES.map((a) => computeModel(a));
results.forEach(report);

const diagnostics = DIAGNOSTICS.map((a) => computeModel(a));
diagnostics.forEach(report);

console.log('\n\n================ ALTERNATIVE COMPARISON ================');
console.log('  Alt  Life        Outlay           NPV        EAA/yr        IRR       MIRR      PI    DiscPayback  RatioMetrics');
for (const m of [...results, ...diagnostics]) {
  console.log(
    `  ${m.inputs.id.padEnd(3)}   ${m.inputs.projectLifeYears}  ${aed(-m.cashFlows[0])} ${aed(m.npv)} ` +
      `${aed(m.equivalentAnnualAnnuity)} ${pct(m.irr.value)} ${pct(m.mirr)} ` +
      `${m.profitabilityIndex.toFixed(3).padStart(7)} ${num(m.discountedPaybackPeriod, 2)}   ` +
      `${m.ratioMetricsMeaningful ? 'meaningful' : 'NOT MEANINGFUL'} (intensity ${m.capitalIntensity.toFixed(2)})`,
  );
}
console.log('');
