/**
 * Section 0 — Cold Boot.
 *
 * The hero. A 32-tile lattice powers on tile by tile, one tile per GPU in the
 * cluster under appraisal. In Part 3 this is replaced by the WebGL die; the DOM
 * lattice here is the reduced-motion and no-WebGL fallback, so it is built to
 * stand on its own rather than as a placeholder.
 */

import { motion } from 'framer-motion';
import { useModelStore } from '../store/useModelStore';
import { money, percent } from '../lib/format';
import { TONE_HEX } from '../ui/primitives';

const TILE_COUNT = 32;

export function ColdBoot() {
  const model = useModelStore((s) => s.model);
  const peakUtilisation = Math.max(...model.inputs.utilisationByYear);
  const litTiles = Math.round(TILE_COUNT * peakUtilisation);

  return (
    <section
      id="cold-boot"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6"
    >
      {/* The lattice — one tile per GPU. Lit tiles show planned peak utilisation,
          so the hero is displaying the model rather than ornament. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="grid gap-2.5 md:gap-3"
          style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}
        >
          {Array.from({ length: TILE_COUNT }).map((_, i) => {
            const isLit = i < litTiles;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.55,
                  delay: 0.3 + i * 0.03,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="h-16 w-16 rounded-[7px] md:h-[6.5rem] md:w-[6.5rem]"
                style={{
                  background: isLit
                    ? 'linear-gradient(152deg, rgb(56 232 255 / 0.34), rgb(139 124 255 / 0.16) 55%, rgb(255 181 71 / 0.14))'
                    : 'rgb(255 255 255 / 0.012)',
                  border: `1px solid ${isLit ? 'rgb(56 232 255 / 0.55)' : 'rgb(255 255 255 / 0.035)'}`,
                  boxShadow: isLit
                    ? '0 0 34px rgb(56 232 255 / 0.22) inset, 0 0 30px -4px rgb(56 232 255 / 0.42)'
                    : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Sits between the lattice and the title so the type stays legible while
          the lattice keeps its presence at the edges. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(40rem 24rem at 50% 48%, rgb(7 8 12 / 0.86) 16%, rgb(7 8 12 / 0.55) 44%, transparent 74%)',
        }}
      />

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
          className="mt-5 text-[3.4rem] leading-[0.95] tracking-[-0.04em] md:text-[6rem]"
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
          className="mx-auto mt-6 max-w-2xl text-lg italic text-slate-300 md:text-2xl"
        >
          Should a studio own its intelligence, or keep renting it?
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-slate-400"
        >
          An AI-enabled capital budgeting appraisal of a AED&nbsp;7.06&nbsp;million GPU
          inference cluster — built, verified, and argued end to end.
        </motion.p>

        {/* Live readout, so the hero is showing the actual model rather than decoration */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-3"
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

        <motion.a
          href="#decision"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="mt-14 inline-flex flex-col items-center gap-2 text-slate-500 transition-colors hover:text-slate-300"
        >
          <span className="eyebrow">The decision</span>
          <span className="pulse-dot text-lg">↓</span>
        </motion.a>
      </div>
    </section>
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
