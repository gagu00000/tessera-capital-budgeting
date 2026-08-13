/**
 * Section 02 — Assumption Console.
 *
 * Every input the brief requires the user to be able to enter, grouped by the
 * question it answers rather than by data type. A live NPV readout tracks each
 * change, so the console teaches the shape of the model by responding to it.
 */

import { motion } from 'framer-motion';
import { useModelStore } from '../store/useModelStore';
import type { AlternativeId } from '../store/useModelStore';
import { SectionShell, GlassPanel, SliderField, Field, TONE_HEX } from '../ui/primitives';
import { money, percent, rate as fmtRate, hours } from '../lib/format';
import { WACC_BREAKDOWN } from '../data/scenario';
import { MERIDIAN_WACC_INPUTS } from '../engine/wacc';
import { availableHoursPerYear } from '../engine/model';

const ALTERNATIVE_TABS: { id: AlternativeId; label: string; tone: 'amber' | 'iris' | 'photon' }[] = [
  { id: 'A', label: 'A · Own 32 GPU', tone: 'amber' },
  { id: 'B', label: 'B · Rent 3-yr', tone: 'iris' },
  { id: 'C', label: 'C · Hybrid 16 GPU', tone: 'photon' },
];

export function AssumptionConsole() {
  const { inputs, model, activeId, isDirty, patchInputs, setUtilisation, setFixedCost, selectAlternative, resetToBaseCase } =
    useModelStore();

  const capacity = availableHoursPerYear(inputs);

  return (
    <SectionShell
      id="assumptions"
      eyebrow="02 — Assumption console"
      title="Every input, and what moving it does."
      lede="These are the published assumptions, each traceable to a source. Change any of them and
        the entire appraisal re-solves — all thirteen outputs, every chart, and the recommendation."
    >
      {/* Alternative selector + live verdict strip */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {ALTERNATIVE_TABS.map((tab) => {
            const active = tab.id === activeId;
            return (
              <button
                key={tab.id}
                onClick={() => selectAlternative(tab.id)}
                className="rounded-full px-4 py-2 text-[0.78rem] transition-all"
                style={{
                  background: active ? `rgb(${toRgb(tab.tone)} / 0.14)` : 'rgb(255 255 255 / 0.03)',
                  border: `1px solid ${active ? `rgb(${toRgb(tab.tone)} / 0.4)` : 'rgb(255 255 255 / 0.07)'}`,
                  color: active ? TONE_HEX[tab.tone] : '#8a93a6',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <button
              onClick={resetToBaseCase}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[0.72rem] text-slate-400 transition-colors hover:text-slate-100"
            >
              Reset to published assumptions
            </button>
          )}
          <LiveNpv npv={model.npv} isDirty={isDirty} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ---- Capital outlay ---- */}
        <GlassPanel tone="amber" className="p-5">
          <p className="eyebrow mb-4">Capital outlay</p>
          <div className="space-y-4">
            <Field label="Equipment cost" suffix="AED">
              <input
                type="number"
                value={Math.round(inputs.equipmentCost)}
                step={10000}
                onChange={(e) => patchInputs({ equipmentCost: Number(e.target.value) })}
              />
            </Field>
            <Field
              label="Installation & transportation"
              suffix="AED"
              hint="Freight, insurance, 5% UAE customs duty, rack-and-stack, electrical works and commissioning. Capitalised into the depreciable base."
            >
              <input
                type="number"
                value={Math.round(inputs.installTransportCost)}
                step={5000}
                onChange={(e) => patchInputs({ installTransportCost: Number(e.target.value) })}
              />
            </Field>
            <Field
              label="Working capital requirement"
              suffix="AED"
              hint="Spare parts, colocation power deposit and net receivables. Released in full at the end of the project."
            >
              <input
                type="number"
                value={Math.round(inputs.workingCapitalInitial)}
                step={25000}
                onChange={(e) => patchInputs({ workingCapitalInitial: Number(e.target.value) })}
              />
            </Field>

            <div className="rounded-lg bg-black/25 p-3">
              <div className="flex justify-between text-[0.74rem]">
                <span className="text-slate-400">Depreciable base</span>
                <span className="numeric text-slate-100">AED {money(model.depreciableBase)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[0.74rem]">
                <span className="text-slate-400">Initial cash flow</span>
                <span className="numeric" style={{ color: TONE_HEX.plasma }}>
                  AED {money(model.cashFlows[0])}
                </span>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* ---- Capacity & utilisation ---- */}
        <GlassPanel tone="photon" className="p-5">
          <p className="eyebrow mb-4">Capacity & utilisation</p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="GPU count">
                <input
                  type="number"
                  value={inputs.gpuCount}
                  step={8}
                  min={0}
                  onChange={(e) => patchInputs({ gpuCount: Number(e.target.value) })}
                />
              </Field>
              <Field label="Project life" suffix="years">
                <input
                  type="number"
                  value={inputs.projectLifeYears}
                  min={1}
                  max={10}
                  onChange={(e) => {
                    const life = Math.max(1, Math.min(10, Number(e.target.value)));
                    const current = inputs.utilisationByYear;
                    const utilisationByYear = Array.from(
                      { length: life },
                      (_, i) => current[i] ?? current[current.length - 1] ?? 0.8,
                    );
                    patchInputs({ projectLifeYears: life, utilisationByYear });
                  }}
                />
              </Field>
            </div>

            <SliderField
              label="Availability factor"
              value={inputs.availabilityFactor}
              min={0.8}
              max={1}
              step={0.005}
              onChange={(v) => patchInputs({ availabilityFactor: v })}
              display={percent(inputs.availabilityFactor, 1)}
              hint={`${hours(capacity)} sellable per year after maintenance downtime.`}
              tone="photon"
            />

            <div>
              <p className="mb-2.5 text-[0.78rem] text-slate-300">Utilisation by year</p>
              <div className="space-y-2.5">
                {inputs.utilisationByYear.map((u, i) => (
                  <SliderField
                    key={i}
                    label={`Year ${i + 1}`}
                    value={u}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => setUtilisation(i, v)}
                    display={percent(u, 0)}
                    tone="photon"
                  />
                ))}
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* ---- Revenue ---- */}
        <GlassPanel tone="verdant" className="p-5">
          <p className="eyebrow mb-4">Revenue</p>
          <div className="space-y-4">
            <SliderField
              label="Internal share of hours"
              value={inputs.internalSharePct}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => patchInputs({ internalSharePct: v })}
              display={percent(inputs.internalSharePct, 0)}
              hint="Hours consumed by Meridian's own products, valued at the on-demand cloud rate they avoid paying. The remainder is resold."
              tone="verdant"
            />
            <Field label="Avoided on-demand rate" suffix="AED / GPU-hr">
              <input
                type="number"
                value={inputs.internalRateYear1}
                step={0.25}
                onChange={(e) => patchInputs({ internalRateYear1: Number(e.target.value) })}
              />
            </Field>
            <Field label="External resale price" suffix="AED / GPU-hr">
              <input
                type="number"
                value={inputs.externalRateYear1}
                step={0.25}
                onChange={(e) => patchInputs({ externalRateYear1: Number(e.target.value) })}
              />
            </Field>
            <SliderField
              label="Annual price erosion"
              value={inputs.priceErosionRate}
              min={0}
              max={0.25}
              step={0.005}
              onChange={(v) => patchInputs({ priceErosionRate: v })}
              display={`−${percent(inputs.priceErosionRate, 1)}`}
              hint="Applies to both rates. The single most important assumption in the appraisal."
              tone="plasma"
            />

            <div className="rounded-lg bg-black/25 p-3">
              <div className="flex justify-between text-[0.74rem]">
                <span className="text-slate-400">Year-1 blended rate</span>
                <span className="numeric text-slate-100">
                  AED {fmtRate(model.years[0]?.blendedRate ?? 0)}
                </span>
              </div>
              <div className="mt-1.5 flex justify-between text-[0.74rem]">
                <span className="text-slate-400">Year-1 revenue</span>
                <span className="numeric" style={{ color: TONE_HEX.verdant }}>
                  AED {money(model.years[0]?.revenue ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* ---- Operating costs ---- */}
        <GlassPanel tone="amber" className="p-5">
          <p className="eyebrow mb-4">Operating costs</p>
          <div className="space-y-4">
            <Field
              label="Variable cost"
              suffix="AED / GPU-hr"
              hint="1.35 kWh per GPU-hour at PUE 1.35, priced at the DEWA industrial tariff, plus bandwidth and storage wear."
            >
              <input
                type="number"
                value={inputs.variableCostPerGpuHour}
                step={0.05}
                onChange={(e) => patchInputs({ variableCostPerGpuHour: Number(e.target.value) })}
              />
            </Field>

            <div>
              <p className="mb-2 text-[0.78rem] text-slate-300">
                Fixed cost components{' '}
                <span className="text-[0.66rem] text-slate-500">· year-1 amounts, editable</span>
              </p>
              <div className="space-y-1.5">
                {inputs.fixedCostComponents.map((c, i) => (
                  <div
                    key={c.label}
                    className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.72rem] leading-snug text-slate-300">{c.label}</p>
                      <p className="text-[0.62rem] text-slate-500">
                        {c.startYear > 1 ? `From year ${c.startYear}` : 'From year 1'}
                        {c.isOpportunityCost && ' · opportunity cost'}
                      </p>
                    </div>
                    <input
                      type="number"
                      aria-label={`${c.label} — year 1 amount`}
                      className="w-28 shrink-0 text-right"
                      value={c.year1Amount}
                      step={5_000}
                      onChange={(e) => setFixedCost(i, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <SliderField
              label="Fixed cost escalation"
              value={inputs.fixedCostEscalation}
              min={0}
              max={0.1}
              step={0.005}
              onChange={(v) => patchInputs({ fixedCostEscalation: v })}
              display={percent(inputs.fixedCostEscalation, 1)}
              tone="amber"
            />
          </div>
        </GlassPanel>

        {/* ---- Depreciation, salvage & tax ---- */}
        <GlassPanel tone="iris" className="p-5">
          <p className="eyebrow mb-4">Depreciation, salvage & tax</p>
          <div className="space-y-4">
            <Field label="Depreciation method">
              <select
                value={inputs.depreciationMethod}
                onChange={(e) =>
                  patchInputs({
                    depreciationMethod: e.target.value as typeof inputs.depreciationMethod,
                  })
                }
              >
                <option value="straightLineToSalvage">Straight line, to salvage estimate</option>
                <option value="straightLineToZero">Straight line, to zero</option>
              </select>
            </Field>

            <SliderField
              label="Realised salvage value"
              value={inputs.salvageRateOfEquipment}
              min={0}
              max={0.5}
              step={0.01}
              onChange={(v) => patchInputs({ salvageRateOfEquipment: v })}
              display={`${percent(inputs.salvageRateOfEquipment, 0)} of cost`}
              hint="The depreciation schedule was fixed at purchase on an 18% estimate and does not move, so a different realised value creates a taxable gain or a deductible loss."
              tone="verdant"
            />

            <SliderField
              label="Corporate tax rate"
              value={inputs.taxRate}
              min={0}
              max={0.35}
              step={0.01}
              onChange={(v) => patchInputs({ taxRate: v })}
              display={percent(inputs.taxRate, 0)}
              hint="UAE corporate tax is 9% above the AED 375,000 threshold."
              tone="iris"
            />

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={inputs.taxShieldOnLosses}
                onChange={(e) => patchInputs({ taxShieldOnLosses: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#8b7cff]"
              />
              <span>
                <span className="text-[0.78rem] text-slate-300">Relieve losses against group profit</span>
                <span className="mt-0.5 block text-[0.68rem] leading-snug text-slate-500">
                  If unchecked, tax is floored at zero in loss-making years rather than generating a credit.
                </span>
              </span>
            </label>

            <div className="rounded-lg bg-black/25 p-3">
              <div className="flex justify-between text-[0.74rem]">
                <span className="text-slate-400">Annual depreciation</span>
                <span className="numeric text-slate-100">AED {money(model.annualDepreciation)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[0.74rem]">
                <span className="text-slate-400">Gain / (loss) on disposal</span>
                <span
                  className="numeric"
                  style={{
                    color:
                      model.terminal.gainOrLossOnDisposal === 0
                        ? '#8a93a6'
                        : model.terminal.gainOrLossOnDisposal > 0
                          ? TONE_HEX.verdant
                          : TONE_HEX.plasma,
                  }}
                >
                  AED {money(model.terminal.gainOrLossOnDisposal)}
                </span>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* ---- Cost of capital ---- */}
        <GlassPanel tone="iris" className="p-5">
          <p className="eyebrow mb-4">Cost of capital</p>
          <p className="mb-4 text-[0.72rem] leading-relaxed text-slate-500">
            The discount rate is derived from its components rather than asserted, so every part
            of it can be challenged individually.
          </p>

          <div className="space-y-1">
            <WaccRow label="Risk-free rate" value={percent(MERIDIAN_WACC_INPUTS.riskFreeRate)} />
            <WaccRow label="Equity risk premium" value={percent(MERIDIAN_WACC_INPUTS.equityRiskPremium)} />
            <WaccRow label="Unlevered beta" value={MERIDIAN_WACC_INPUTS.unleveredBeta.toFixed(2)} />
            <WaccRow
              label="Levered beta (Hamada)"
              value={WACC_BREAKDOWN.leveredBeta.toFixed(4)}
              emphasis
            />
            <WaccRow label="Small-company premium" value={percent(MERIDIAN_WACC_INPUTS.smallCompanyPremium)} />
            <WaccRow label="Cost of equity (CAPM)" value={percent(WACC_BREAKDOWN.costOfEquity)} emphasis />
            <WaccRow label="After-tax cost of debt" value={percent(WACC_BREAKDOWN.afterTaxCostOfDebt)} />
            <WaccRow label="Equity / debt weights" value={`70% / 30%`} />
          </div>

          <div className="mt-4 rounded-lg border border-[#8b7cff]/25 bg-[#8b7cff]/8 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[0.78rem] text-slate-300">WACC</span>
              <span className="numeric text-lg" style={{ color: TONE_HEX.iris }}>
                {percent(WACC_BREAKDOWN.wacc, 4)}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <SliderField
              label="Override discount rate"
              value={inputs.wacc}
              min={0.04}
              max={0.3}
              step={0.001}
              onChange={(v) => patchInputs({ wacc: v, reinvestmentRate: v })}
              display={percent(inputs.wacc, 2)}
              hint="Also sets the MIRR reinvestment rate, which is assumed equal to the cost of capital."
              tone="iris"
            />
          </div>
        </GlassPanel>
      </div>
    </SectionShell>
  );
}

function WaccRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between border-b border-white/5 py-1.5 text-[0.74rem] last:border-0">
      <span className={emphasis ? 'text-slate-300' : 'text-slate-400'}>{label}</span>
      <span className={`numeric ${emphasis ? 'text-slate-100' : 'text-slate-300'}`}>{value}</span>
    </div>
  );
}

function LiveNpv({ npv, isDirty }: { npv: number; isDirty: boolean }) {
  const positive = npv >= 0;
  return (
    <motion.div
      key={Math.round(npv)}
      initial={{ opacity: 0.55, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="glass px-4 py-2"
      data-tone={positive ? 'verdant' : 'plasma'}
    >
      <div className="relative z-10 flex items-baseline gap-3">
        <span className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">
          {isDirty ? 'NPV (modified)' : 'NPV'}
        </span>
        <span
          className="numeric text-base"
          style={{ color: positive ? TONE_HEX.verdant : TONE_HEX.plasma }}
        >
          AED {money(npv)}
        </span>
      </div>
    </motion.div>
  );
}

function toRgb(tone: 'amber' | 'iris' | 'photon'): string {
  return { amber: '255 181 71', iris: '139 124 255', photon: '56 232 255' }[tone];
}
