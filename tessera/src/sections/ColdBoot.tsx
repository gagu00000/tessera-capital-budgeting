/**
 * Section 0 — Cold Boot.
 *
 * The hero. A WebGL silicon die powers on beneath the title, one tile per GPU in
 * the cluster under appraisal. Everything it shows is bound to the model: the
 * lit share is peak utilisation, the hue shifts toward amber as the cluster runs
 * hotter, and the particles crossing it are GPU-hours — cyan where consumed
 * internally, magenta where resold.
 *
 * Composition matters here: the die occupies the lower frame and the type sits
 * above it. An earlier version centred both, so the title fought the lattice for
 * the same space and the tiles read as an empty loading skeleton behind text.
 */

import { motion } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { useModelStore } from '../store/useModelStore';
import { money, percent } from '../lib/format';
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

const TILE_COUNT = 32;

export function ColdBoot() {
  const model = useModelStore((s) => s.model);
  const capability = useSceneCapability();

  const peakUtilisation = Math.max(...model.inputs.utilisationByYear);
  const litTiles = Math.round(TILE_COUNT * peakUtilisation);

  // Thermal load rises with utilisation. Normalised against a fully saturated
  // cluster so the hue shift is comparable across alternatives.
  const thermal = Math.min(1, peakUtilisation);

  return (
    <section
      id="cold-boot"
      className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden px-6 pt-[18vh]"
    >
      {/* The die, filling the lower frame */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[38vh]">
        {capability.resolved && capability.enabled ? (
          <Suspense fallback={null}>
            <GpuDie
              utilisation={peakUtilisation}
              thermal={thermal}
              internalShare={model.inputs.internalSharePct}
            />
          </Suspense>
        ) : (
          <StaticLattice litTiles={litTiles} />
        )}
      </div>

      <div className="relative z-10 mx-auto max-w-4xl text-center">
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
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
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

      {/* Reads the die for the viewer, so the dark tiles are understood as data */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.85 }}
        className="absolute inset-x-0 bottom-7 z-10 flex flex-col items-center gap-3 px-6"
      >
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[0.7rem] text-slate-500">
          <LegendItem colour={TONE_HEX.photon} label={`${litTiles} of ${TILE_COUNT} GPUs sold at peak`} />
          <LegendItem colour="#2a3242" label={`${TILE_COUNT - litTiles} idle — capacity never sold`} />
          <LegendItem colour={TONE_HEX.plasma} label="Hours resold to regional clients" />
        </div>
        <a
          href="#decision"
          className="flex flex-col items-center gap-1.5 text-slate-500 transition-colors hover:text-slate-300"
        >
          <span className="eyebrow">The decision</span>
          <span className="pulse-dot text-lg">↓</span>
        </a>
      </motion.div>
    </section>
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
