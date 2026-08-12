/**
 * Section 05 — Break-even. Required output 11.
 *
 * Three different break-even points, because they answer three different
 * questions and confusing them is how projects get approved that should not be:
 *
 *   cash        what utilisation covers the cash costs of running the cluster
 *   accounting  what utilisation additionally covers the depreciation charge
 *   NPV         what utilisation additionally covers the cost of the capital
 *
 * Only the third is a decision. The first two are comfortable numbers that a
 * project can clear while still destroying value, and the gap between them is
 * the most useful thing on this page.
 */

import { motion } from 'framer-motion';
import { useModelStore } from '../store/useModelStore';
import { SectionShell, GlassPanel, Pill, Callout, TONE_HEX } from '../ui/primitives';
import { percent, rate as fmtRate, hours as fmtHours } from '../lib/format';

export function BreakEven() {
  const model = useModelStore((s) => s.model);
  const be = model.breakEven;
  const inputs = model.inputs;

  const peakUtilisation = Math.max(...inputs.utilisationByYear);
  const npvBreakEven = be.npvBreakEvenPeakUtilisation;
  const headroom = npvBreakEven === null ? null : peakUtilisation - npvBreakEven;

  const year1 = model.years[0];
  /** Positive when the price needed to break even is above what the market pays. */
  const priceGap = (be.npvBreakEvenBlendedRate ?? 0) - (year1?.blendedRate ?? 0);

  return (
    <SectionShell
      id="breakeven"
      eyebrow="05 — Break-even"
      title="How much of the cluster has to sell before this is worth doing?"
      lede="Three thresholds, rising in severity. A project can clear the first two comfortably
        and still be the wrong decision, because neither of them charges anything for the capital
        tied up in the asset."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {/* The three thresholds */}
        <div className="lg:col-span-2">
          <GlassPanel tone="photon" className="h-full p-5">
            <div className="mb-5 flex items-center justify-between">
              <p className="eyebrow">Break-even utilisation, by test</p>
              <Pill tone="photon">Output 11</Pill>
            </div>

            <div className="space-y-5">
              <Threshold
                label="Cash break-even"
                question="Covers the cash cost of running the cluster"
                value={be.cashAverage}
                planned={peakUtilisation}
                tone="verdant"
                note="Excludes depreciation, which is a non-cash charge. Clearing this only means the cluster is not haemorrhaging cash."
                index={0}
              />
              <Threshold
                label="Accounting break-even"
                question="Also covers the depreciation charge"
                value={be.accountingAverage}
                planned={peakUtilisation}
                tone="amber"
                note="Where reported profit turns positive. Still charges nothing for the cost of the capital that bought the asset."
                index={1}
              />
              <Threshold
                label="NPV break-even"
                question="Also covers the cost of the capital itself"
                value={npvBreakEven ?? 0}
                planned={peakUtilisation}
                tone="plasma"
                note="The only one of the three that is a decision. Below this the project destroys value even while reporting an accounting profit."
                emphasis
                index={2}
              />
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-5">
          <GlassPanel tone="amber" className="p-5">
            <p className="eyebrow mb-4">Unit economics, year 1</p>
            <Row label="Blended price" value={`AED ${fmtRate(year1?.blendedRate ?? 0)}`} unit="/GPU-hr" />
            <Row
              label="Variable cost"
              value={`AED ${fmtRate(inputs.variableCostPerGpuHour)}`}
              unit="/GPU-hr"
            />
            <Row
              label="Contribution margin"
              value={`AED ${fmtRate(be.contributionMarginYear1)}`}
              unit="/GPU-hr"
              tone="verdant"
            />
            <Row
              label="Margin ratio"
              value={percent(be.contributionMarginRatioYear1, 1)}
              unit="of revenue"
            />
            <Row label="Sellable capacity" value={fmtHours(year1?.availableHours ?? 0)} unit="/year" />

            <p className="mt-4 border-t border-white/5 pt-3 text-[0.68rem] leading-relaxed text-slate-500">
              A {percent(be.contributionMarginRatioYear1, 0)} contribution margin looks
              excellent, and it is — the cost of running a GPU is trivial next to the price of
              its time. The difficulty is never the margin. It is that the capital has to be
              committed before anyone knows how many hours will sell.
            </p>
          </GlassPanel>

          <GlassPanel tone="plasma" className="p-5">
            <p className="eyebrow mb-3">Break-even price</p>
            <p className="numeric text-2xl" style={{ color: TONE_HEX.plasma }}>
              AED {fmtRate(be.npvBreakEvenBlendedRate ?? 0)}
            </p>
            <p className="mt-1.5 text-[0.7rem] text-slate-500">
              per GPU-hour, against a base case of AED {fmtRate(year1?.blendedRate ?? 0)}
            </p>
            <p className="mt-3 text-[0.68rem] leading-relaxed text-slate-500">
              {priceGap >= 0 ? (
                <>
                  The year-1 blended price at which NPV reaches zero, holding volumes
                  constant — AED {fmtRate(priceGap)} <strong>above</strong> what the market
                  pays today. The project needs a price it cannot currently command, in a
                  market where prices are falling {percent(inputs.priceErosionRate, 0)} a
                  year.
                </>
              ) : (
                <>
                  The year-1 blended price at which NPV reaches zero, holding volumes
                  constant. Today's price clears it by AED {fmtRate(-priceGap)}, but with
                  prices eroding {percent(inputs.priceErosionRate, 0)} a year the market
                  reaches this level on its own in{' '}
                  {estimateYearsToPrice(
                    year1?.blendedRate ?? 0,
                    be.npvBreakEvenBlendedRate ?? 0,
                    inputs.priceErosionRate,
                  )}
                  .
                </>
              )}
            </p>
          </GlassPanel>
        </div>
      </div>

      <div className="mt-5">
        {headroom !== null && headroom < 0.05 ? (
          <Callout tone="plasma" title="There is no headroom">
            The plan peaks at {percent(peakUtilisation, 0)} utilisation and NPV break-even sits
            at {percent(npvBreakEven ?? 0, 1)} — a margin of{' '}
            {percent(Math.abs(headroom), 1)}. The cluster has to run essentially exactly as
            planned for five years to be worth building at all. That is not a forecast, it is a
            requirement, and it is the clearest single argument against Alternative A.
          </Callout>
        ) : (
          <Callout tone="verdant" title="Headroom against the NPV threshold">
            The plan peaks at {percent(peakUtilisation, 0)} utilisation against an NPV
            break-even of {percent(npvBreakEven ?? 0, 1)}, leaving{' '}
            {percent(headroom ?? 0, 1)} of room before the decision reverses.
          </Callout>
        )}
      </div>
    </SectionShell>
  );
}

/** Years until an eroding price falls from `from` to `to`. */
function estimateYearsToPrice(from: number, to: number, erosion: number): string {
  if (from <= 0 || to <= 0 || erosion <= 0) return 'n/a';
  if (to >= from) return 'less than a year';
  const years = Math.log(to / from) / Math.log(1 - erosion);
  return `${years.toFixed(1)} years`;
}

function Threshold({
  label,
  question,
  value,
  planned,
  tone,
  note,
  emphasis = false,
  index,
}: {
  label: string;
  question: string;
  value: number;
  planned: number;
  tone: 'verdant' | 'amber' | 'plasma';
  note: string;
  emphasis?: boolean;
  index: number;
}) {
  const clear = planned >= value;
  const width = Math.min(100, value * 100);
  const plannedWidth = Math.min(100, planned * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={emphasis ? 'rounded-lg bg-black/25 p-3.5' : ''}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[0.82rem] text-slate-200">{label}</span>
        <span className="numeric text-[0.95rem]" style={{ color: TONE_HEX[tone] }}>
          {percent(value, 1)}
        </span>
      </div>
      <p className="mb-2.5 text-[0.7rem] text-slate-500">{question}</p>

      <div className="relative h-6 overflow-hidden rounded-md bg-black/40">
        {/* Planned utilisation */}
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${plannedWidth}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-y-0 left-0"
          style={{ background: 'rgb(56 232 255 / 0.2)' }}
        />
        {/* Threshold marker */}
        <motion.div
          initial={{ left: 0, opacity: 0 }}
          whileInView={{ left: `${width}%`, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.3 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-y-0 w-[2px]"
          style={{ background: TONE_HEX[tone], boxShadow: `0 0 10px ${TONE_HEX[tone]}` }}
        />
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[0.66rem] text-slate-500">{note}</span>
        <span
          className="numeric shrink-0 text-[0.66rem]"
          style={{ color: clear ? TONE_HEX.verdant : TONE_HEX.plasma }}
        >
          {clear ? '✓ cleared' : '✕ not cleared'}
        </span>
      </div>
    </motion.div>
  );
}

function Row({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: 'verdant';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="text-[0.74rem] text-slate-400">{label}</span>
      <span className="numeric shrink-0 text-[0.8rem]" style={{ color: tone ? TONE_HEX[tone] : '#e8ecf5' }}>
        {value}
        <span className="ml-1 text-[0.66rem] text-slate-500">{unit}</span>
      </span>
    </div>
  );
}
