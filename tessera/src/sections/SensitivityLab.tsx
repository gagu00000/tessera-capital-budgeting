/**
 * Section 06 — Sensitivity Lab. Required output 12.
 *
 * With a base-case NPV inside the margin of error of its own assumptions, this
 * section is where the decision is actually made. The tornado ranks the drivers,
 * the switching values say how far each can move before the answer flips, and
 * the two-way grid shows what happens when the two biggest move together.
 */

import { useMemo } from 'react';
import { useModelStore } from '../store/useModelStore';
import { SectionShell, GlassPanel, Callout, Pill, TONE_HEX } from '../ui/primitives';
import { Tornado } from '../charts/Tornado';
import { Heatmap2D } from '../charts/Heatmap2D';
import {
  buildDrivers,
  computeTornado,
  computeTwoWayGrid,
} from '../engine/sensitivity';
import { money, driverValue } from '../lib/format';

const GRID_STEPS = 11;

export function SensitivityLab() {
  const { inputs, model } = useModelStore();

  const drivers = useMemo(() => buildDrivers(inputs), [inputs]);
  const bars = useMemo(() => computeTornado(inputs, drivers), [inputs, drivers]);

  // The two widest bars are crossed in the grid — the pair the decision is most
  // exposed to, chosen by the analysis rather than picked in advance.
  const [driverX, driverY] = useMemo(
    () => [bars[0]?.driver, bars[1]?.driver],
    [bars],
  );

  const cells = useMemo(
    () =>
      driverX && driverY
        ? computeTwoWayGrid(inputs, driverX, driverY, GRID_STEPS)
        : [],
    [inputs, driverX, driverY],
  );

  const crossers = bars.filter(
    (b) => Math.sign(b.npvAtMin) !== Math.sign(b.npvAtMax),
  );

  const percentOfOutlay = (
    (Math.abs(model.npv) / Math.abs(model.cashFlows[0])) *
    100
  ).toFixed(2);

  return (
    <SectionShell
      id="sensitivity"
      eyebrow="06 — Sensitivity"
      title="Which assumption is the decision actually resting on?"
      lede="Each driver is moved across its own plausible range rather than by a uniform
        percentage, because a blanket shock ranks drivers by how much room they were given
        rather than by how uncertain they genuinely are."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GlassPanel tone="plasma" className="h-full p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="eyebrow">Tornado — NPV swing by driver</p>
              <Pill tone="plasma">Output 12</Pill>
            </div>
            <Tornado bars={bars} baseNpv={model.npv} />
          </GlassPanel>
        </div>

        <div className="space-y-5">
          <GlassPanel tone="amber" className="p-5">
            <p className="eyebrow mb-3">Switching values</p>
            <p className="mb-4 text-[0.72rem] leading-relaxed text-slate-500">
              The value at which each driver, moving alone, takes NPV to exactly zero.
              More useful than a percentage shock, because it is stated in the driver's own
              units and can be argued about directly.
            </p>
            <div className="space-y-1">
              {bars.slice(0, 6).map((bar) => (
                <div
                  key={bar.driver.id}
                  className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5 last:border-0"
                >
                  <span className="truncate text-[0.72rem] text-slate-400">
                    {bar.driver.label}
                  </span>
                  <span className="numeric shrink-0 text-[0.74rem]">
                    <span className="text-slate-500">
                      {driverValue(bar.driver.base, bar.driver.format)}
                    </span>
                    <span className="mx-1.5 text-slate-600">→</span>
                    <span style={{ color: TONE_HEX.amber }}>
                      {bar.switchingValue === null
                        ? 'never'
                        : driverValue(bar.switchingValue, bar.driver.format)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </GlassPanel>

          <Callout
            tone="plasma"
            title={
              crossers.length === bars.length
                ? 'Every driver can flip the decision alone'
                : `${crossers.length} of ${bars.length} drivers can flip the decision alone`
            }
          >
            {crossers.length === 0 ? (
              <>No single driver takes NPV across zero within its plausible range.</>
            ) : crossers.length === bars.length ? (
              <>
                All {bars.length} drivers cross NPV = 0 somewhere inside their plausible
                range — including the corporate tax rate, which is the least contentious
                assumption in the model. That is not nine separate problems. It is one
                problem stated nine times: a base case sitting {percentOfOutlay}% away from
                zero is closer to the threshold than any individual assumption is to being
                certain, so whichever driver you choose to worry about will move it.
              </>
            ) : (
              <>
                {crossers.map((c) => c.driver.label).join(', ')} each cross NPV = 0 without
                help from any other assumption. The base case is not robust to any one of
                them moving to the adverse end of a range that is entirely plausible.
              </>
            )}
          </Callout>
        </div>
      </div>

      {driverX && driverY && (
        <div className="mt-5">
          <GlassPanel tone="photon" className="p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow mb-1.5">Two-way grid</p>
                <h3 className="text-base">
                  {driverY.label}{' '}
                  <span className="text-slate-500">against</span> {driverX.label}
                </h3>
              </div>
              <p className="max-w-md text-[0.7rem] leading-relaxed text-slate-500">
                The two widest bars from the tornado, crossed. A tornado moves one driver at
                a time and cannot show that two individually survivable moves are fatal
                together — the boundary between the green and magenta regions is exactly
                that.
              </p>
            </div>
            <Heatmap2D
              cells={cells}
              driverX={driverX}
              driverY={driverY}
              steps={GRID_STEPS}
              baseX={driverX.base}
              baseY={driverY.base}
            />
          </GlassPanel>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Summary
          label="Widest single driver"
          value={bars[0]?.driver.label ?? '—'}
          detail={`Swings NPV by AED ${money(bars[0]?.swing ?? 0)}`}
          tone="plasma"
        />
        <Summary
          label="Base-case NPV"
          value={`AED ${money(model.npv)}`}
          detail={`${((Math.abs(model.npv) / Math.abs(model.cashFlows[0])) * 100).toFixed(2)}% of the outlay — inside the margin of error of the assumptions`}
          tone={model.npv >= 0 ? 'verdant' : 'plasma'}
        />
        <Summary
          label="Drivers crossing zero"
          value={`${crossers.length} of ${bars.length}`}
          detail="Each capable of flipping the decision without help"
          tone="amber"
        />
      </div>
    </SectionShell>
  );
}

function Summary({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'plasma' | 'verdant' | 'amber';
}) {
  return (
    <GlassPanel tone={tone} className="p-4">
      <p className="text-[0.66rem] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-base" style={{ color: TONE_HEX[tone] }}>
        {value}
      </p>
      <p className="mt-1.5 text-[0.68rem] leading-relaxed text-slate-500">{detail}</p>
    </GlassPanel>
  );
}
