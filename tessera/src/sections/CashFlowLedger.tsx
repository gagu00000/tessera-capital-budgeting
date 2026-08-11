/**
 * Section 03 — Cash Flow Ledger.
 *
 * Required outputs 1, 2 and 3: the initial cash flow, the annual operating cash
 * flows, and the terminal-year cash flow. Presented as an auditable bridge — the
 * reader can follow revenue down to net cash flow and check the arithmetic by
 * eye, which is the point of showing it rather than only the headline metrics.
 */

import { motion } from 'framer-motion';
import { useModelStore } from '../store/useModelStore';
import { SectionShell, GlassPanel, TONE_HEX, Pill } from '../ui/primitives';
import { money, percent, hours } from '../lib/format';

export function CashFlowLedger() {
  const model = useModelStore((s) => s.model);
  const { initial, terminal, years } = model;

  const peakInflow = Math.max(...years.map((y) => Math.abs(y.netCashFlow)), 1);

  return (
    <SectionShell
      id="ledger"
      eyebrow="03 — Cash flow ledger"
      title="Where every dirham comes from and goes."
      lede="Outputs 1 to 3 of the thirteen the brief requires. Revenue here is incremental: the
        on-demand cloud spend the cluster avoids, plus the cash received for surplus hours sold on."
    >
      <div className="grid gap-5 lg:grid-cols-4">
        {/* Initial */}
        <GlassPanel tone="plasma" className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="eyebrow">Initial · t=0</p>
            <Pill tone="plasma">Output 1</Pill>
          </div>
          <LedgerRow label="Equipment" value={-initial.equipmentCost} />
          <LedgerRow label="Installation & transport" value={-initial.installTransportCost} />
          <LedgerRow label="Working capital" value={-initial.workingCapital} />
          <LedgerRow label="Initial cash flow" value={initial.total} emphasis />

          <div className="mt-4 rounded-lg border border-white/5 bg-black/25 p-3">
            <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">Excluded</p>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="text-[0.74rem] text-slate-400">Feasibility study</span>
              <span className="numeric text-[0.78rem] text-slate-500 line-through">
                {money(initial.sunkCostExcluded)}
              </span>
            </div>
            <p className="mt-1.5 text-[0.66rem] leading-relaxed text-slate-500">
              Sunk before the decision point. Including it would penalise a project for money that
              is already gone.
            </p>
          </div>
        </GlassPanel>

        {/* Operating years */}
        <div className="lg:col-span-2">
          <GlassPanel tone="photon" className="h-full p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="eyebrow">Operating years</p>
              <Pill tone="photon">Output 2</Pill>
            </div>

            {/* Nine numeric columns are tight in a two-thirds-width panel, so the
                type is stepped down here rather than letting the last column clip. */}
            <div className="-mx-1.5 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[0.7rem]">
                <thead>
                  <tr className="text-slate-500">
                    <Th>Year</Th>
                    <Th right>Util.</Th>
                    <Th right>Revenue</Th>
                    <Th right>Var cost</Th>
                    <Th right>Fixed</Th>
                    <Th right>Dep&apos;n</Th>
                    <Th right>EBIT</Th>
                    <Th right>Tax</Th>
                    <Th right>OCF</Th>
                  </tr>
                </thead>
                <tbody className="numeric">
                  {years.map((y, i) => (
                    <motion.tr
                      key={y.year}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: i * 0.06 }}
                      className="border-t border-white/5"
                    >
                      <Td className="text-slate-300">{y.year}</Td>
                      <Td right className="text-slate-400">{percent(y.utilisation, 0)}</Td>
                      <Td right style={{ color: TONE_HEX.verdant }}>{money(y.revenue)}</Td>
                      <Td right className="text-slate-400">{money(y.variableCost)}</Td>
                      <Td right className="text-slate-400">{money(y.fixedCost)}</Td>
                      <Td right className="text-slate-500">{money(y.depreciation)}</Td>
                      <Td right className="text-slate-200">{money(y.ebit)}</Td>
                      <Td right className="text-slate-400">{money(y.tax)}</Td>
                      <Td right style={{ color: TONE_HEX.photon }}>{money(y.operatingCashFlow)}</Td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Net cash flow bars */}
            <div className="mt-6">
              <p className="mb-3 text-[0.7rem] uppercase tracking-[0.14em] text-slate-500">
                Net cash flow, and its present value
              </p>
              <div className="space-y-2.5">
                {years.map((y, i) => {
                  const width = (Math.abs(y.netCashFlow) / peakInflow) * 100;
                  const pvWidth = (Math.abs(y.presentValue) / peakInflow) * 100;
                  return (
                    <div key={y.year} className="flex items-center gap-3">
                      <span className="numeric w-8 shrink-0 text-[0.68rem] text-slate-500">
                        Y{y.year}
                      </span>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-black/30">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${width}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.7, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                          className="absolute inset-y-0 left-0 rounded-md"
                          style={{
                            background: 'rgb(56 232 255 / 0.16)',
                            border: '1px solid rgb(56 232 255 / 0.45)',
                          }}
                        />
                        {/* Discounted value, drawn inside — the visible gap is the time value of money */}
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${pvWidth}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.7, delay: 0.25 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                          className="absolute inset-y-0 left-0 rounded-md"
                          style={{ background: 'rgb(139 124 255 / 0.72)' }}
                        />
                      </div>
                      <span className="numeric w-24 shrink-0 text-right text-[0.7rem] text-slate-300">
                        {money(y.netCashFlow)}
                      </span>
                      <span className="numeric w-24 shrink-0 text-right text-[0.7rem] text-slate-500">
                        {money(y.presentValue)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-4 text-[0.66rem] text-slate-500">
                <LegendSwatch color="rgb(56 232 255 / 0.30)" label="Nominal cash flow" />
                <LegendSwatch color="rgb(139 124 255 / 0.72)" label="Present value at the hurdle rate — the filled portion is what it is worth today" />
              </div>
            </div>
          </GlassPanel>
        </div>

        {/* Terminal */}
        <GlassPanel tone="verdant" className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="eyebrow">Terminal · t={model.inputs.projectLifeYears}</p>
            <Pill tone="verdant">Output 3</Pill>
          </div>
          <LedgerRow label="Salvage value" value={terminal.salvageValue} />
          <LedgerRow label="Closing book value" value={terminal.closingBookValue} muted />
          <LedgerRow label="Gain / (loss) on disposal" value={terminal.gainOrLossOnDisposal} muted />
          <LedgerRow label="Tax on disposal" value={-terminal.taxOnDisposal} />
          <LedgerRow label="After-tax salvage" value={terminal.afterTaxSalvage} />
          <LedgerRow label="Working capital released" value={terminal.workingCapitalRecovered} />
          <LedgerRow label="Terminal cash flow" value={terminal.total} emphasis />

          <p className="mt-4 border-t border-white/5 pt-3 text-[0.66rem] leading-relaxed text-slate-500">
            Working capital is released, not earned — it is the same cash committed at the outset
            coming back. Treating it as a gain would double-count it.
          </p>

          <div className="mt-4 rounded-lg bg-black/25 p-3">
            <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">Capacity</p>
            <div className="mt-1.5 flex justify-between text-[0.74rem]">
              <span className="text-slate-400">Sellable per year</span>
              <span className="numeric text-slate-200">{hours(years[0]?.availableHours ?? 0)}</span>
            </div>
          </div>
        </GlassPanel>
      </div>
    </SectionShell>
  );
}

function LedgerRow({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  muted?: boolean;
}) {
  const colour = emphasis
    ? value >= 0
      ? TONE_HEX.verdant
      : TONE_HEX.plasma
    : muted
      ? '#5d6577'
      : '#b6bfd2';
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 ${
        emphasis ? 'mt-1 border-t border-white/12 pt-3' : 'border-b border-white/5'
      }`}
    >
      <span className={`text-[0.74rem] ${emphasis ? 'text-slate-200' : 'text-slate-400'}`}>
        {label}
      </span>
      <span
        className={`numeric shrink-0 ${emphasis ? 'text-[0.95rem]' : 'text-[0.78rem]'}`}
        style={{ color: colour }}
      >
        {money(value)}
      </span>
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-1.5 pb-2 text-[0.62rem] font-normal uppercase tracking-[0.1em] ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right = false,
  className = '',
  style,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`px-1.5 py-2 ${right ? 'text-right' : ''} ${className}`} style={style}>
      {children}
    </td>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-4 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
