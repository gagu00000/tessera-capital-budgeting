/**
 * Section 07 — Scenario Triptych. Required output 13.
 *
 * Best, base and worst case. The drivers move TOGETHER rather than
 * independently, because in this market they are driven by the same underlying
 * cause: a glut of compute supply cuts the price of a GPU-hour, weakens demand
 * for the surplus capacity being resold, and depresses second-hand hardware
 * values, all at once. Shocking them independently would understate the
 * downside, which is the failure mode that makes careless scenario analysis
 * worse than none at all.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useModelStore } from '../store/useModelStore';
import { SectionShell, GlassPanel, Pill, Callout, TONE_HEX } from '../ui/primitives';
import { computeScenarios } from '../engine/scenarios';
import type { ScenarioId } from '../engine/scenarios';
import { money, percent, ratio, years as fmtYears } from '../lib/format';

const TONE: Record<ScenarioId, 'plasma' | 'photon' | 'verdant'> = {
  worst: 'plasma',
  base: 'photon',
  best: 'verdant',
};

export function ScenarioTriptych() {
  const { inputs, model } = useModelStore();
  const scenarios = useMemo(() => computeScenarios(inputs), [inputs]);

  const worst = scenarios.find((s) => s.definition.id === 'worst')!;
  const best = scenarios.find((s) => s.definition.id === 'best')!;
  const outlay = Math.abs(model.cashFlows[0]);
  const range = best.model.npv - worst.model.npv;

  return (
    <SectionShell
      id="scenarios"
      eyebrow="07 — Scenarios"
      title="Three futures, and how far apart they are."
      lede="The drivers move together rather than one at a time, because the same underlying
        cause moves all of them: an oversupply of compute cuts the price of a GPU-hour, softens
        demand for resold capacity, and depresses second-hand hardware values simultaneously."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {scenarios.map((scenario, i) => {
          const tone = TONE[scenario.definition.id];
          const m = scenario.model;
          const isBase = scenario.definition.id === 'base';

          return (
            <motion.div
              key={scenario.definition.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
            >
              <GlassPanel tone={tone} className="h-full p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-lg">{scenario.definition.label}</h3>
                  {isBase && <Pill tone="photon">Published</Pill>}
                </div>

                <p className="numeric text-[1.7rem] leading-none" style={{ color: TONE_HEX[tone] }}>
                  AED {money(m.npv)}
                </p>
                <p className="mt-1.5 text-[0.68rem] text-slate-500">
                  Net present value · {percent(m.npv / outlay, 1)} of the outlay
                </p>

                <div className="mt-4 space-y-0">
                  <Metric label="IRR" value={percent(m.irr.value)} hurdle={inputs.wacc} raw={m.irr.value} />
                  <Metric label="MIRR" value={percent(m.mirr)} hurdle={inputs.wacc} raw={m.mirr} />
                  <Metric label="Profitability Index" value={ratio(m.profitabilityIndex)} hurdle={1} raw={m.profitabilityIndex} />
                  <Metric label="Discounted payback" value={fmtYears(m.discountedPaybackPeriod)} />
                  <Metric label="Equivalent annual annuity" value={`AED ${money(m.equivalentAnnualAnnuity)}`} />
                </div>

                <p className="mt-4 border-t border-white/8 pt-3 text-[0.72rem] leading-relaxed text-slate-400">
                  {scenario.definition.narrative}
                </p>

                <ul className="mt-3 space-y-1">
                  {scenario.definition.assumptions.map((assumption) => (
                    <li key={assumption} className="flex gap-2 text-[0.68rem] leading-relaxed text-slate-500">
                      <span style={{ color: TONE_HEX[tone] }}>·</span>
                      {assumption}
                    </li>
                  ))}
                </ul>
              </GlassPanel>
            </motion.div>
          );
        })}
      </div>

      {/* The spread */}
      <div className="mt-5">
        <GlassPanel tone="iris" className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Outcome range</p>
            <Pill tone="iris">Output 13</Pill>
          </div>

          <div className="relative h-12 overflow-hidden rounded-lg bg-black/35">
            {(() => {
              const lo = Math.min(worst.model.npv, 0);
              const hi = Math.max(best.model.npv, 0);
              const span = hi - lo || 1;
              const pos = (v: number) => ((v - lo) / span) * 100;

              return (
                <>
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${pos(best.model.npv) - pos(worst.model.npv)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-y-0"
                    style={{
                      left: `${pos(worst.model.npv)}%`,
                      background:
                        'linear-gradient(90deg, rgb(255 79 216 / 0.35), rgb(56 232 255 / 0.25) 55%, rgb(75 227 155 / 0.35))',
                    }}
                  />
                  {/* NPV = 0 */}
                  <div
                    className="absolute inset-y-0 w-[2px]"
                    style={{ left: `${pos(0)}%`, background: TONE_HEX.amber }}
                  />
                  <span
                    className="numeric absolute top-1 text-[0.6rem]"
                    style={{ left: `calc(${pos(0)}% + 6px)`, color: TONE_HEX.amber }}
                  >
                    NPV 0
                  </span>
                  {/* Base case */}
                  <div
                    className="absolute inset-y-0 w-[2px]"
                    style={{ left: `${pos(model.npv)}%`, background: '#e8ecf5' }}
                  />
                </>
              );
            })()}
          </div>

          <div className="mt-2 flex justify-between text-[0.68rem]">
            <span className="numeric" style={{ color: TONE_HEX.plasma }}>
              AED {money(worst.model.npv)}
            </span>
            <span className="text-slate-500">
              spread of AED {money(range)} — {(range / outlay).toFixed(2)}× the outlay
            </span>
            <span className="numeric" style={{ color: TONE_HEX.verdant }}>
              AED {money(best.model.npv)}
            </span>
          </div>

          <div className="mt-5">
            <Callout tone={worst.model.npv < -0.2 * outlay ? 'plasma' : 'amber'} title="Reading the spread">
              The distance between the worst and best cases is{' '}
              <span className="numeric">{(range / outlay).toFixed(2)}×</span> the money being
              committed, and the base case sits close enough to zero that it falls inside that
              spread rather than dominating it. A project whose outcome range is wider than its
              own capital cost is not being chosen on its expected value — it is being chosen on
              a view about which end of the range is more likely, and that view should be stated
              explicitly rather than buried in a point estimate.
            </Callout>
          </div>
        </GlassPanel>
      </div>
    </SectionShell>
  );
}

function Metric({
  label,
  value,
  hurdle,
  raw,
}: {
  label: string;
  value: string;
  hurdle?: number;
  raw?: number | null;
}) {
  const passes = hurdle !== undefined && raw !== null && raw !== undefined ? raw > hurdle : null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5 last:border-0">
      <span className="text-[0.72rem] text-slate-400">{label}</span>
      <span className="numeric shrink-0 text-[0.76rem] text-slate-100">
        {passes !== null && (
          <span
            className="mr-1.5"
            style={{ color: passes ? TONE_HEX.verdant : TONE_HEX.plasma }}
          >
            {passes ? '✓' : '✕'}
          </span>
        )}
        {value}
      </span>
    </div>
  );
}
