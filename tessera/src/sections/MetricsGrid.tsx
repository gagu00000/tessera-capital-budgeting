/**
 * Section 04 — Decision Metrics.
 *
 * Required outputs 4 to 10. Each tile states the number, the hurdle it is being
 * judged against, and a plain-language reading of what it means — because the
 * brief requires the application to be usable by someone who does not do
 * finance, and a bare "IRR 12.54%" communicates nothing to that reader.
 */

import { motion } from 'framer-motion';
import { useModelStore } from '../store/useModelStore';
import { SectionShell, GlassPanel, MetricTile, Callout, Pill, TONE_HEX } from '../ui/primitives';
import type { Verdict } from '../ui/primitives';
import { money, percent, ratio, years as fmtYears } from '../lib/format';

export function MetricsGrid() {
  const model = useModelStore((s) => s.model);
  const { inputs } = model;
  const life = inputs.projectLifeYears;
  const meaningful = model.ratioMetricsMeaningful;

  const verdictOf = (passed: boolean): Verdict => (passed ? 'pass' : 'fail');
  const nm: Verdict = 'none';

  return (
    <SectionShell
      id="metrics"
      eyebrow="04 — Decision metrics"
      title="Ten measures, one decision."
      lede="Outputs 4 to 10. They do not always agree, and where they disagree the reason is
        stated rather than smoothed over — that disagreement is usually the most informative thing
        on the page."
    >
      {!meaningful && (
        <div className="mb-6">
          <Callout tone="amber" title="Ratio metrics suppressed for this option">
            This alternative commits AED {money(Math.abs(model.cashFlows[0]))} of capital against
            average annual benefits of {money(model.years.reduce((s, y) => s + y.revenue, 0) / life)}.
            Every measure that divides by invested capital — IRR, Profitability Index, ARR and
            payback — therefore tends toward infinity and stops carrying meaning. It is a
            contractual commitment, not a capital investment. NPV and Equivalent Annual Annuity
            remain valid and are the correct basis for judging it.
          </Callout>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricTile
          index={0}
          label="Net Present Value"
          value={`AED ${money(model.npv)}`}
          sub={`Discounted at ${percent(inputs.wacc)}`}
          hurdle="Accept if greater than zero"
          verdict={verdictOf(model.npv > 0)}
          note={
            model.npv > 0
              ? 'The project adds this much to the value of the business today, after paying for the capital it uses.'
              : 'The project destroys this much value today. The cash it returns does not cover the cost of the capital tied up in it.'
          }
        />

        <MetricTile
          index={1}
          label="Internal Rate of Return"
          value={meaningful ? percent(model.irr.value) : '—'}
          sub={`Hurdle ${percent(inputs.wacc)}`}
          hurdle="Accept if above the cost of capital"
          verdict={meaningful ? verdictOf((model.irr.value ?? 0) > inputs.wacc) : nm}
          note={
            !meaningful
              ? 'Not meaningful — almost no capital is employed.'
              : model.irr.isConventional
                ? 'The annual return the project earns on the money tied up in it.'
                : `Warning: this cash-flow pattern has ${model.irr.roots.length} valid IRRs. Use NPV and MIRR instead.`
          }
        />

        <MetricTile
          index={2}
          label="Modified IRR"
          value={meaningful ? percent(model.mirr) : '—'}
          sub={`Reinvested at ${percent(inputs.reinvestmentRate)}`}
          hurdle="Accept if above the cost of capital"
          verdict={meaningful ? verdictOf((model.mirr ?? 0) > inputs.wacc) : nm}
          note="IRR assumes interim cash is reinvested at the IRR itself, which is usually optimistic. MIRR assumes it earns the cost of capital instead."
        />

        <MetricTile
          index={3}
          label="Profitability Index"
          value={meaningful ? ratio(model.profitabilityIndex) : '—'}
          sub={`PV in ${money(model.pvOfInflows)} / PV out ${money(model.pvOfOutflows)}`}
          hurdle="Accept if above 1.00"
          verdict={meaningful ? verdictOf(model.profitabilityIndex > 1) : nm}
          note={
            meaningful
              ? `Every dirham invested returns ${model.profitabilityIndex.toFixed(2)} dirhams in today's money.`
              : 'Not meaningful — almost no capital is employed.'
          }
        />

        <MetricTile
          index={4}
          label="Equivalent Annual Annuity"
          value={`AED ${money(model.equivalentAnnualAnnuity)}`}
          sub={`Level equivalent over ${life} years`}
          hurdle="Required to compare unequal lives"
          verdict={verdictOf(model.equivalentAnnualAnnuity > 0)}
          note="Converts NPV into a level annual figure, so a 3-year option and a 5-year one can be compared on the same footing."
        />

        <MetricTile
          index={5}
          label="Payback Period"
          value={meaningful ? fmtYears(model.paybackPeriod) : '—'}
          sub={`Project life ${life} years`}
          hurdle="Shorter is better; ignores time value"
          verdict={
            meaningful ? verdictOf((model.paybackPeriod ?? Infinity) <= life) : nm
          }
          note="How long until the original outlay is recovered in plain cash terms. Says nothing about what happens afterwards."
        />

        <MetricTile
          index={6}
          label="Discounted Payback"
          value={meaningful ? fmtYears(model.discountedPaybackPeriod) : '—'}
          sub={`At ${percent(inputs.wacc)}`}
          hurdle="Accept if inside the project life"
          verdict={
            meaningful
              ? verdictOf(
                  model.discountedPaybackPeriod !== null &&
                    model.discountedPaybackPeriod <= life,
                )
              : nm
          }
          note={
            model.discountedPaybackPeriod === null
              ? 'The outlay is never recovered in present-value terms within the project life.'
              : 'The same test, but counting each year’s cash at what it is worth today.'
          }
        />

        <MetricTile
          index={7}
          label="Accounting Rate of Return"
          value={meaningful ? percent(model.arr) : '—'}
          sub={`On initial investment: ${percent(model.arrInitialBasis)}`}
          hurdle="Compare against the target book return"
          verdict={nm}
          note="An accounting measure, not a cash one: it uses profit after tax and ignores the time value of money. Shown on both conventions because textbooks differ."
        />

        <MetricTile
          index={8}
          label="Annual depreciation"
          value={`AED ${money(model.annualDepreciation)}`}
          sub={`Base ${money(model.depreciableBase)} → ${money(model.terminal.closingBookValue)}`}
          hurdle="Non-cash; shields tax"
          verdict={nm}
          note="Not a cash outflow. It reduces taxable profit, so it is added back when converting profit to cash flow."
        />

        <MetricTile
          index={9}
          label="Consistency checks"
          value={`${model.checks.filter((c) => c.passed).length} / ${model.checks.length}`}
          sub={model.allChecksPass ? 'All identities hold' : 'Discrepancy detected'}
          hurdle="Verified on every recalculation"
          verdict={model.allChecksPass ? 'pass' : 'fail'}
          note="Seven mathematical identities are re-asserted every time the model runs, so a bad input combination is caught rather than displayed."
        />
      </div>

      {/* Multiple-IRR warning, shown only when it actually applies */}
      {model.irr.roots.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <Callout tone="plasma" title="This cash-flow pattern has more than one IRR">
            The net cash flows change sign {model.irr.signChanges} times, so by Descartes' rule of
            signs there can be more than one rate at which NPV equals zero — and here there are{' '}
            {model.irr.roots.length}:{' '}
            <span className="numeric">
              {model.irr.roots.map((r) => percent(r)).join(' and ')}
            </span>
            . Neither is more correct than the other, which is precisely why IRR cannot be used to
            judge this option. NPV and MIRR remain well defined and should be used instead.
          </Callout>
        </motion.div>
      )}

      {/* Consistency check detail */}
      <div className="mt-6">
        <GlassPanel tone={model.allChecksPass ? 'verdant' : 'plasma'} className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Verification — asserted on this calculation</p>
            <Pill tone={model.allChecksPass ? 'verdant' : 'plasma'}>
              {model.allChecksPass ? 'All identities hold' : 'Check failed'}
            </Pill>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {model.checks.map((check) => (
              <div key={check.name} className="rounded-lg bg-black/25 p-3">
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: check.passed ? TONE_HEX.verdant : TONE_HEX.plasma,
                      boxShadow: `0 0 8px ${check.passed ? TONE_HEX.verdant : TONE_HEX.plasma}`,
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-[0.72rem] text-slate-200">{check.name}</p>
                    <p className="numeric mt-0.5 text-[0.62rem] text-slate-500">
                      δ = {check.delta.toExponential(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[0.68rem] leading-relaxed text-slate-500">
            These run on every recalculation, not only in testing. A separate Python
            re-implementation using numpy-financial independently reproduces all of the figures
            above; the comparison is recorded in the project's verification report.
          </p>
        </GlassPanel>
      </div>
    </SectionShell>
  );
}
