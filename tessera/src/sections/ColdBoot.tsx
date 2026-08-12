/**
 * Section 0 — Cold Boot.
 *
 * The hero. A WebGL silicon die powers on beneath the title, one tile per GPU in
 * the cluster under appraisal. Everything it shows is bound to the model: the
 * lit share is peak utilisation, the hue shifts toward iris as the cluster runs
 * hotter, and the particles crossing it are GPU-hours — cyan where consumed
 * internally, magenta where resold.
 *
 * The die is inspectable. Clicking a tile opens the unit economics of that
 * single GPU, allocated from the fleet model. Clicking an idle tile is the point
 * of the whole thing: it shows a GPU carrying a full share of capital and fixed
 * cost against no revenue whatsoever.
 *
 * Composition matters here: the die occupies the lower frame and the type sits
 * above it. An earlier version centred both, so the title fought the lattice for
 * the same space and the tiles read as an empty loading skeleton behind text.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { lazy, Suspense, useState } from 'react';
import { useModelStore } from '../store/useModelStore';
import { money, percent, hours as fmtHours } from '../lib/format';
import { computeGpuUnitEconomics } from '../lib/perGpu';
import { TONE_HEX } from '../ui/primitives';
import { useSceneCapability } from '../scene/useSceneCapability';

/**
 * Code-split, because three.js and the postprocessing pipeline are by far the
 * heaviest thing the application ships. Loading them lazily keeps them out of
 * the initial bundle, and since the import only happens once the capability
 * check has passed, anyone on a device without WebGL — or anyone who has asked
 * for reduced motion — never downloads them at all.
 */
const GpuDie = lazy(() =>
  import('../scene/GpuDie').then((module) => ({ default: module.GpuDie })),
);

const COLUMNS = 8;
const TILE_COUNT = 32;

export function ColdBoot() {
  const model = useModelStore((s) => s.model);
  const capability = useSceneCapability();

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoomCommand, setZoomCommand] = useState<{ direction: 1 | -1; seq: number } | null>(
    null,
  );
  const [resetSeq, setResetSeq] = useState(0);

  const peakUtilisation = Math.max(...model.inputs.utilisationByYear);
  const litTiles = Math.round(TILE_COUNT * peakUtilisation);

  // Thermal load rises with utilisation. Normalised against a fully saturated
  // cluster so the hue shift is comparable across alternatives.
  const thermal = Math.min(1, peakUtilisation);

  const unit =
    selectedIndex === null ? null : computeGpuUnitEconomics(model, selectedIndex, COLUMNS);

  const zoom = (direction: 1 | -1) =>
    setZoomCommand((current) => ({ direction, seq: (current?.seq ?? 0) + 1 }));

  const interactive = capability.resolved && capability.enabled;

  return (
    <section
      id="cold-boot"
      className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden px-6 pt-[16vh]"
    >
      {/* The die, filling the lower frame. Pointer events are enabled so tiles
          can be picked; the text above sits on a higher stacking layer. */}
      <div className="absolute inset-x-0 bottom-0 top-[36vh]">
        {interactive ? (
          <Suspense fallback={null}>
            <GpuDie
              utilisation={peakUtilisation}
              thermal={thermal}
              internalShare={model.inputs.internalSharePct}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              zoomCommand={zoomCommand}
              resetSeq={resetSeq}
            />
          </Suspense>
        ) : (
          <StaticLattice litTiles={litTiles} />
        )}
      </div>

      <div className="pointer-events-none relative z-10 mx-auto max-w-4xl text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="eyebrow"
        >
          Corporate Finance · Capital Budgeting
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 text-[3.4rem] leading-[0.95] tracking-[-0.04em] md:text-[6.5rem]"
          style={{
            background:
              'linear-gradient(96deg, #38e8ff 0%, #8b7cff 34%, #ff4fd8 62%, #ffb547 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          TESSERA
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.24 }}
          className="mx-auto mt-5 max-w-2xl text-lg italic text-slate-300 md:text-2xl"
        >
          Should a studio own its intelligence, or keep renting it?
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-slate-400"
        >
          An AI-enabled capital budgeting appraisal of a AED&nbsp;7.06&nbsp;million GPU
          inference cluster — built, verified, and argued end to end.
        </motion.p>

        {/* Live readout, so the hero is showing the actual model rather than decoration */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <HeroStat label="Outlay" value={`AED ${money(Math.abs(model.cashFlows[0]))}`} tone="amber" />
          <HeroStat
            label="NPV"
            value={`AED ${money(model.npv)}`}
            tone={model.npv >= 0 ? 'verdant' : 'plasma'}
          />
          <HeroStat label="IRR" value={percent(model.irr.value)} tone="photon" />
          <HeroStat label="Hurdle" value={percent(model.inputs.wacc)} tone="iris" />
        </motion.div>
      </div>

      {/* Interaction hint + camera controls */}
      {interactive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.8 }}
          className="absolute left-6 top-[38vh] z-20 flex flex-col gap-2.5 md:left-10"
        >
          <p className="max-w-[13rem] text-[0.7rem] leading-relaxed text-slate-500">
            Click a GPU to inspect it · drag to orbit
          </p>
          <div className="flex gap-1.5">
            <CameraButton label="Zoom in" onClick={() => zoom(1)}>
              +
            </CameraButton>
            <CameraButton label="Zoom out" onClick={() => zoom(-1)}>
              −
            </CameraButton>
            <CameraButton label="Reset view" onClick={() => setResetSeq((s) => s + 1)}>
              ⟲
            </CameraButton>
          </div>
        </motion.div>
      )}

      {/* Unit inspector */}
      <AnimatePresence>
        {unit && (
          <motion.aside
            key={unit.index}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="glass absolute right-6 top-[38vh] z-20 w-[19rem] p-5 md:right-10"
            data-tone={unit.isSold ? 'photon' : 'plasma'}
          >
            <div className="relative z-10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base">GPU {unit.index + 1}</h3>
                  <p className="numeric mt-0.5 text-[0.68rem] text-slate-500">
                    H200 SXM · row {unit.row}, column {unit.column} of {unit.total}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedIndex(null)}
                  aria-label="Close inspector"
                  className="-mr-1 -mt-1 rounded-md px-2 py-1 text-slate-500 transition-colors hover:text-slate-100"
                >
                  ✕
                </button>
              </div>

              <span
                className="mt-3 inline-flex rounded-full px-2.5 py-1 text-[0.66rem]"
                style={{
                  background: unit.isSold
                    ? 'rgb(56 232 255 / 0.12)'
                    : 'rgb(255 79 216 / 0.12)',
                  color: unit.isSold ? TONE_HEX.photon : TONE_HEX.plasma,
                  border: `1px solid ${unit.isSold ? 'rgb(56 232 255 / 0.3)' : 'rgb(255 79 216 / 0.3)'}`,
                }}
              >
                {unit.isSold ? 'Capacity sold' : 'Idle — never sold'}
              </span>

              <dl className="mt-4 space-y-0">
                <InspectorRow label="Hours sold / yr" value={fmtHours(unit.hoursSoldPerYear)} />
                <InspectorRow
                  label="Revenue / yr"
                  value={`AED ${money(unit.revenuePerYear)}`}
                  tone={unit.isSold ? 'verdant' : undefined}
                />
                <InspectorRow label="Energy cost / yr" value={`AED ${money(unit.energyCostPerYear)}`} />
                <InspectorRow
                  label="Fixed cost share / yr"
                  value={`AED ${money(unit.fixedCostSharePerYear)}`}
                />
                <InspectorRow
                  label="Contribution / yr"
                  value={`AED ${money(unit.contributionPerYear)}`}
                  tone={unit.contributionPerYear >= 0 ? 'verdant' : 'plasma'}
                  emphasis
                />
                <InspectorRow label="Capital carried" value={`AED ${money(unit.capitalCost)}`} tone="amber" />
                <InspectorRow label="Electricity / yr" value={`${money(unit.energyKwhPerYear)} kWh`} />
              </dl>

              <p className="mt-4 border-t border-white/8 pt-3 text-[0.66rem] leading-relaxed text-slate-500">
                {unit.isSold
                  ? `Year ${unit.peakYear} at ${percent(unit.peakUtilisation, 0)} peak utilisation. Fleet figures divided across the GPUs whose capacity is sold — live from the model.`
                  : `This GPU carries AED ${money(unit.capitalCost)} of capital and AED ${money(unit.fixedCostSharePerYear)} of fixed cost a year, and earns nothing. Five of ${unit.total} are in this position at peak.`}
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Reads the die for the viewer, so the dark tiles are understood as data */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.85 }}
        className="pointer-events-none absolute inset-x-0 bottom-7 z-10 flex flex-col items-center gap-3 px-6"
      >
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[0.7rem] text-slate-500">
          <LegendItem colour={TONE_HEX.photon} label={`${litTiles} of ${TILE_COUNT} GPUs sold at peak`} />
          <LegendItem colour="#2a3242" label={`${TILE_COUNT - litTiles} idle — capacity never sold`} />
          <LegendItem colour={TONE_HEX.plasma} label="Hours resold to regional clients" />
        </div>
        <a
          href="#decision"
          className="pointer-events-auto flex flex-col items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-300"
        >
          <span className="eyebrow">The decision</span>
          <span className="pulse-dot text-lg">↓</span>
        </a>
      </motion.div>
    </section>
  );
}

function InspectorRow({
  label,
  value,
  tone,
  emphasis = false,
}: {
  label: string;
  value: string;
  tone?: 'verdant' | 'plasma' | 'amber';
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        emphasis ? 'mt-1 border-y border-white/8' : 'border-b border-white/5'
      }`}
    >
      <dt className="text-[0.72rem] text-slate-400">{label}</dt>
      <dd
        className="numeric shrink-0 text-[0.76rem]"
        style={{ color: tone ? TONE_HEX[tone] : '#e8ecf5' }}
      >
        {value}
      </dd>
    </div>
  );
}

function CameraButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="glass h-8 w-8 text-sm text-slate-300 transition-colors hover:text-slate-100"
    >
      <span className="relative z-10">{children}</span>
    </button>
  );
}

function LegendItem({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: colour, boxShadow: `0 0 8px ${colour}` }}
      />
      {label}
    </span>
  );
}

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'photon' | 'plasma' | 'amber' | 'verdant' | 'iris';
}) {
  return (
    <div className="glass px-4 py-2.5" data-tone={tone}>
      <div className="relative z-10">
        <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <p className="numeric mt-1 text-sm" style={{ color: TONE_HEX[tone] }}>
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Fallback for devices without WebGL and for users who have asked for reduced
 * motion. Flat, static, and still carrying the same lit/unlit information.
 */
function StaticLattice({ litTiles }: { litTiles: number }) {
  return (
    <div className="flex h-full items-start justify-center pt-10">
      <div
        className="grid gap-2.5 opacity-70 md:gap-3"
        style={{
          gridTemplateColumns: `repeat(8, minmax(0, 1fr))`,
          transform: 'perspective(900px) rotateX(52deg)',
        }}
      >
        {Array.from({ length: TILE_COUNT }).map((_, i) => {
          const isLit = i < litTiles;
          return (
            <div
              key={i}
              className="h-14 w-14 rounded-[6px] md:h-20 md:w-20"
              style={{
                background: isLit
                  ? 'linear-gradient(152deg, rgb(56 232 255 / 0.34), rgb(139 124 255 / 0.16))'
                  : 'rgb(255 255 255 / 0.02)',
                border: `1px solid ${isLit ? 'rgb(56 232 255 / 0.5)' : 'rgb(255 255 255 / 0.05)'}`,
                boxShadow: isLit ? '0 0 26px rgb(56 232 255 / 0.28)' : 'none',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
