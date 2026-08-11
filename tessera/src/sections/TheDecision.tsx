/**
 * Section 1 — The Decision.
 *
 * Establishes the company, the problem, and the four options on the table
 * before any number is shown. A capital budgeting result is uninterpretable
 * without knowing what it is a decision between.
 */

import { motion } from 'framer-motion';
import { SectionShell, GlassPanel, Pill, Callout } from '../ui/primitives';
import { MARKET, USD_TO_AED } from '../data/scenario';
import { money } from '../lib/format';

const OPTIONS = [
  {
    id: '0',
    tone: 'neutral' as const,
    label: 'Status quo',
    title: 'Continue buying on-demand cloud',
    body:
      'Meridian pays hyperscaler on-demand rates because at 34 people it cannot commit to ' +
      'the volumes that unlock deep discounts. This is the baseline: every other option is ' +
      'measured as an incremental change against it, and so has an NPV of zero by construction.',
    tag: 'Baseline',
  },
  {
    id: 'A',
    tone: 'amber' as const,
    label: 'Alternative A',
    title: 'Own a full 32-GPU cluster',
    body:
      'Buy four HGX H200 8-GPU nodes outright and rack them in leased Dubai colocation. ' +
      'Serves all internal inference demand, with surplus capacity resold to regional clients ' +
      'that require data to stay in the UAE.',
    tag: 'AED 7.06M outlay · 5 years',
  },
  {
    id: 'B',
    tone: 'iris' as const,
    label: 'Alternative B',
    title: 'Sign a 3-year reserved commitment',
    body:
      'No capital outlay and no hardware to manage, in exchange for committing to a fixed ' +
      'volume at a fixed rate for three years. The committed hours are payable whether or not ' +
      'they are consumed, and the locked rate cannot fall.',
    tag: 'AED 45k outlay · 3 years',
  },
  {
    id: 'C',
    tone: 'photon' as const,
    label: 'Alternative C',
    title: 'Hybrid — own the baseline, rent the peak',
    body:
      'Buy two nodes, sized to the inference demand that is structurally always-on, and keep ' +
      'serving peak load from on-demand cloud. Peak hours are bought at status-quo prices, so ' +
      'they carry no incremental effect in either direction.',
    tag: 'AED 3.83M outlay · 5 years',
  },
];

export function TheDecision() {
  return (
    <SectionShell
      id="decision"
      eyebrow="01 — The decision"
      title="Meridian AI Studio has outgrown renting its compute."
      lede="A 34-person product studio in Dubai Internet City, building Arabic–English document
        intelligence and speech products on AED 18.4 million of annual revenue. Every inference
        request it serves runs on rented GPU capacity billed at on-demand rates. The question is
        whether to stop renting."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {OPTIONS.map((option, i) => (
              <motion.div
                key={option.id}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.55, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              >
                <GlassPanel
                  tone={option.tone === 'neutral' ? undefined : option.tone}
                  className="h-full p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="eyebrow">{option.label}</p>
                    <Pill tone={option.tone}>{option.tag}</Pill>
                  </div>
                  <h3 className="mt-3 text-lg leading-snug">{option.title}</h3>
                  <p className="mt-2.5 text-[0.82rem] leading-relaxed text-slate-400">
                    {option.body}
                  </p>
                </GlassPanel>
              </motion.div>
            ))}
          </div>

          <Callout tone="plasma" title="Why this decision is genuinely hard">
            The price of GPU compute has been falling roughly 8% a year. Buying hardware converts
            a falling variable cost into a fixed sunk one — good if utilisation holds, punishing
            if it does not. Renting keeps flexibility but forfeits the margin. Locking a rate
            protects against rises in a market that has only been going down.
          </Callout>
        </div>

        <div className="space-y-4">
          <GlassPanel tone="photon" className="p-5">
            <p className="eyebrow mb-4">Market position</p>
            <Row label="On-demand rate paid today" value={`AED ${MARKET.onDemandRateYear1.toFixed(2)}`} unit="/GPU-hr" />
            <Row label="Reserved rate obtainable" value={`AED ${MARKET.reservedRateYear1.toFixed(2)}`} unit="/GPU-hr" />
            <Row label="Resale price achievable" value={`AED ${MARKET.resaleRateYear1.toFixed(2)}`} unit="/GPU-hr" />
            <Row label="Annual price erosion" value={`−${(MARKET.priceErosionRate * 100).toFixed(0)}%`} unit="/year" />
            <Row label="Variable cost to self-serve" value={`AED ${MARKET.variableCostPerGpuHour.toFixed(2)}`} unit="/GPU-hr" />
            <p className="mt-4 border-t border-white/5 pt-3 text-[0.68rem] leading-relaxed text-slate-500">
              Rates converted at the dirham's peg of USD 1 = AED {USD_TO_AED}. On-demand
              equates to roughly USD {(MARKET.onDemandRateYear1 / USD_TO_AED).toFixed(2)} per
              GPU-hour.
            </p>
          </GlassPanel>

          <GlassPanel tone="amber" className="p-5">
            <p className="eyebrow mb-3">Costs that are not what they seem</p>

            <div className="mb-4">
              <p className="text-[0.78rem] text-slate-300">Sunk cost — excluded</p>
              <p className="numeric mt-1 text-sm text-slate-500 line-through">
                AED {money(MARKET.sunkCost)}
              </p>
              <p className="mt-1.5 text-[0.7rem] leading-relaxed text-slate-500">
                Thermal and power feasibility study, commissioned and paid in Q1 2026. The cash
                has gone whichever option is chosen, so it appears in no cash flow.
              </p>
            </div>

            <div>
              <p className="text-[0.78rem] text-slate-300">Opportunity cost — included</p>
              <p className="numeric mt-1 text-sm" style={{ color: '#ffb547' }}>
                AED 86,000 <span className="text-slate-500">/year</span>
              </p>
              <p className="mt-1.5 text-[0.7rem] leading-relaxed text-slate-500">
                The 45 m² technical room is owned outright, so it costs nothing in cash — but
                using it forfeits the sublease income it would otherwise earn. That forgone
                income is a real cost of the project.
              </p>
            </div>
          </GlassPanel>
        </div>
      </div>
    </SectionShell>
  );
}

function Row({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="text-[0.76rem] text-slate-400">{label}</span>
      <span className="numeric shrink-0 text-[0.82rem] text-slate-100">
        {value}
        <span className="ml-1 text-[0.68rem] text-slate-500">{unit}</span>
      </span>
    </div>
  );
}
