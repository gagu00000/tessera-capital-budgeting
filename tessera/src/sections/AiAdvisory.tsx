/**
 * Section 08 — AI Advisory.
 *
 * Four Claude-powered surfaces: a plain-language explainer, a risk register, an
 * alternatives comparator, and a verdict.
 *
 * The verdict is deliberately shown BESIDE a deterministic rule-based verdict
 * computed in pure TypeScript from fixed decision rules. Displaying an AI
 * recommendation alone invites the reader to accept it. Displaying it next to a
 * transparent rule-based one, with agreement or divergence called out, forces
 * the comparison to actually happen — which is what the brief means by
 * critically evaluating AI output, and what "the final judgment must be made by
 * the student" requires in practice.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModelStore, PRISTINE_MODEL_LIST } from '../store/useModelStore';
import { SectionShell, GlassPanel, Pill, Callout, TONE_HEX, TONE_RGB } from '../ui/primitives';
import type { Tone } from '../ui/primitives';
import { buildFacts } from '../ai/payload';
import { useComparison, useExplainer, useRiskRegister, useVerdict } from '../ai/useAdvisor';
import type { Source } from '../ai/useAdvisor';
import { FALLBACK_NOTICE } from '../ai/fallback';
import { buildDrivers, computeTornado } from '../engine/sensitivity';
import { computeScenarios } from '../engine/scenarios';
import { computeRuleVerdict, decisionLabel } from '../engine/verdict';
import type { Decision } from '../engine/verdict';
import { money, percent } from '../lib/format';

const DECISION_TONE: Record<Decision, Tone> = {
  ACCEPT: 'verdant',
  REJECT: 'plasma',
  DELAY: 'amber',
  REVIEW_FURTHER: 'photon',
};

const EXPLAINER_TOPICS = [
  'Net Present Value',
  'Internal Rate of Return',
  'Discounted Payback',
  'Break-even utilisation',
] as const;

export function AiAdvisory() {
  const { inputs, model } = useModelStore();

  const scenarios = useMemo(() => computeScenarios(inputs), [inputs]);
  const tornado = useMemo(
    () => computeTornado(inputs, buildDrivers(inputs)),
    [inputs],
  );
  const ruleVerdict = useMemo(
    () => computeRuleVerdict(model, scenarios),
    [model, scenarios],
  );

  const facts = useMemo(
    () =>
      buildFacts({
        model,
        tornado,
        scenarios,
        alternatives: PRISTINE_MODEL_LIST,
        ruleVerdict,
      }),
    [model, tornado, scenarios, ruleVerdict],
  );

  const verdict = useVerdict();
  const risks = useRiskRegister();
  const comparison = useComparison();
  const explainer = useExplainer();

  const [topic, setTopic] = useState<string>(EXPLAINER_TOPICS[0]);

  const agreement =
    verdict.data === null
      ? null
      : verdict.data.decision === ruleVerdict.decision
        ? 'agree'
        : 'diverge';

  return (
    <SectionShell
      id="advisory"
      eyebrow="08 — AI advisory"
      title="What Claude makes of it — and where I disagree."
      lede="Claude receives the verified figures as structured data and returns interpretation.
        It never computes, derives, or estimates a number: the response schemas contain no numeric
        fields at all, so there is no route by which an AI-invented figure could reach this page."
    >
      {/* Verdict, side by side with the rule-based one */}
      {/* The two rows carry ids so the report figures can frame them
          individually — the section as a whole is far too tall to read once
          scaled onto a page. */}
      <div id="advisory-verdict" className="grid gap-5 lg:grid-cols-2">
        <GlassPanel tone="iris" className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Claude's recommendation</p>
            <div className="flex items-center gap-2">
              {verdict.source && <SourceBadge source={verdict.source} />}
              <Pill tone="iris">Claude Opus 5</Pill>
            </div>
          </div>

          {verdict.status === 'idle' && (
            <RunPrompt
              label="Ask Claude for a recommendation"
              onRun={() => verdict.run(facts)}
            />
          )}
          {verdict.status === 'loading' && <Loading label="Reasoning about the appraisal…" />}

          {verdict.data && (
            <div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span
                  className="text-2xl"
                  style={{ color: TONE_HEX[DECISION_TONE[verdict.data.decision]] }}
                >
                  {decisionLabel(verdict.data.decision)}
                </span>
                <span className="text-[0.7rem] text-slate-500">
                  {verdict.data.confidence} confidence
                </span>
              </div>
              <p className="mt-3 text-[0.86rem] leading-relaxed text-slate-200">
                {verdict.data.headline}
              </p>

              <ul className="mt-4 space-y-2">
                {verdict.data.reasoning.map((point) => (
                  <li key={point} className="flex gap-2.5 text-[0.78rem] leading-relaxed text-slate-400">
                    <span style={{ color: TONE_HEX.iris }}>·</span>
                    {point}
                  </li>
                ))}
              </ul>

              {verdict.data.conditions.length > 0 && (
                <div className="mt-4 border-t border-white/8 pt-3">
                  <p className="eyebrow mb-2">Conditions</p>
                  <ul className="space-y-1.5">
                    {verdict.data.conditions.map((c) => (
                      <li key={c} className="text-[0.74rem] leading-relaxed text-slate-400">
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 border-t border-white/8 pt-3">
                <p className="eyebrow mb-2">Would reverse this if</p>
                <ul className="space-y-1.5">
                  {verdict.data.flipTriggers.map((t) => (
                    <li key={t} className="text-[0.74rem] leading-relaxed text-slate-400">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </GlassPanel>

        <GlassPanel tone="photon" className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Rule-based verdict</p>
            <Pill tone="photon">Deterministic</Pill>
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            <span
              className="text-2xl"
              style={{ color: TONE_HEX[DECISION_TONE[ruleVerdict.decision]] }}
            >
              {decisionLabel(ruleVerdict.decision)}
            </span>
          </div>
          <p className="mt-3 text-[0.86rem] leading-relaxed text-slate-200">
            {ruleVerdict.headline}
          </p>

          <div className="mt-4 space-y-1">
            {ruleVerdict.checks.map((check) => (
              <div
                key={check.label}
                className="flex items-start justify-between gap-3 border-b border-white/5 py-1.5 last:border-0"
              >
                <span className="text-[0.74rem] text-slate-400">{check.label}</span>
                <span
                  className="shrink-0 text-[0.74rem]"
                  style={{ color: check.passed ? TONE_HEX.verdant : TONE_HEX.plasma }}
                >
                  {check.passed ? '✓' : '✕'}
                </span>
              </div>
            ))}
          </div>

          <ul className="mt-4 space-y-2 border-t border-white/8 pt-3">
            {ruleVerdict.reasoning.map((point) => (
              <li key={point} className="text-[0.76rem] leading-relaxed text-slate-400">
                {point}
              </li>
            ))}
          </ul>

          <p className="mt-4 border-t border-white/5 pt-3 text-[0.68rem] leading-relaxed text-slate-500">
            Computed in pure TypeScript from decision rules written down in advance. No model
            involved — it is here to give Claude's recommendation something independent to be
            measured against.
          </p>
        </GlassPanel>
      </div>

      {/* Agreement / divergence */}
      <AnimatePresence>
        {agreement && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5"
          >
            {agreement === 'agree' ? (
              <Callout tone="verdant" title="The two verdicts agree">
                Claude and the decision rules both return{' '}
                <strong>{decisionLabel(ruleVerdict.decision)}</strong>. Agreement is reassuring but
                not proof: the rules encode my judgement about where the thresholds sit, so a shared
                answer can equally mean a shared blind spot. What Claude adds here is the reasoning
                the rules cannot express — the conditions and the reversal triggers above.
              </Callout>
            ) : (
              <Callout tone="amber" title="The two verdicts disagree — and that is the useful case">
                Claude returns <strong>{decisionLabel(verdict.data!.decision)}</strong> where the
                rules return <strong>{decisionLabel(ruleVerdict.decision)}</strong>. The rules are
                mechanical: they classify a base-case NPV inside their marginal band as
                inconclusive, and stop there. Claude can see what the rules cannot — that a
                better-scaled alternative for the same demand is already on the table, which turns
                an inconclusive appraisal into a decision. My own judgement follows Claude on this
                one, for that reason. Where I would not follow it is on any point of arithmetic,
                which is why it is never asked to do any.
              </Callout>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Risk register */}
      <div className="mt-5">
        <GlassPanel tone="plasma" className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Risk register — financial and non-financial</p>
            <div className="flex items-center gap-2">
              {risks.source && <SourceBadge source={risks.source} />}
              <Pill tone="plasma">Part B · 9</Pill>
            </div>
          </div>

          {risks.status === 'idle' && (
            <RunPrompt label="Ask Claude to build the risk register" onRun={() => risks.run(facts)} />
          )}
          {risks.status === 'loading' && <Loading label="Identifying risks…" />}

          {risks.data && (
            <>
              <p className="mb-4 text-[0.82rem] leading-relaxed text-slate-300">
                {risks.data.summary}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {risks.data.risks.map((risk) => (
                  <div key={risk.title} className="rounded-xl bg-black/25 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[0.82rem] leading-snug text-slate-100">{risk.title}</p>
                      <RiskChip severity={risk.severity} likelihood={risk.likelihood} />
                    </div>
                    <p className="mt-1 text-[0.66rem] uppercase tracking-[0.12em] text-slate-500">
                      {risk.category}
                      {risk.driver !== 'none' && ` · ${risk.driver}`}
                    </p>
                    <p className="mt-2.5 text-[0.74rem] leading-relaxed text-slate-400">
                      {risk.rationale}
                    </p>
                    <p className="mt-2 border-t border-white/5 pt-2 text-[0.72rem] leading-relaxed text-slate-500">
                      <span style={{ color: TONE_HEX.verdant }}>Mitigation · </span>
                      {risk.mitigation}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </GlassPanel>
      </div>

      {/* Comparator + explainer */}
      {/* items-start, so a short panel stops at its content instead of being
          stretched to match a much taller neighbour and trailing dead space. */}
      <div id="advisory-analysis" className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <GlassPanel tone="verdant" className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Comparison of alternatives</p>
            <div className="flex items-center gap-2">
              {comparison.source && <SourceBadge source={comparison.source} />}
              <Pill tone="verdant">Part B · 7</Pill>
            </div>
          </div>

          {comparison.status === 'idle' && (
            <RunPrompt
              label="Ask Claude to compare the alternatives"
              onRun={() => comparison.run(facts)}
            />
          )}
          {comparison.status === 'loading' && <Loading label="Comparing the alternatives…" />}

          {comparison.data && (
            <div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-lg" style={{ color: TONE_HEX.verdant }}>
                  Alternative {comparison.data.recommendedAlternativeId}
                </span>
              </div>
              <p className="mt-2 text-[0.84rem] leading-relaxed text-slate-200">
                {comparison.data.headline}
              </p>

              <ul className="mt-3.5 space-y-2">
                {comparison.data.rationale.map((r) => (
                  <li key={r} className="flex gap-2.5 text-[0.76rem] leading-relaxed text-slate-400">
                    <span style={{ color: TONE_HEX.verdant }}>·</span>
                    {r}
                  </li>
                ))}
              </ul>

              {comparison.data.rankingConflict.present && (
                <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/6 p-3">
                  <p className="eyebrow mb-1.5" style={{ color: TONE_HEX.amber }}>
                    Ranking conflict
                  </p>
                  <p className="text-[0.74rem] leading-relaxed text-slate-400">
                    {comparison.data.rankingConflict.explanation}
                  </p>
                </div>
              )}

              {comparison.data.unequalLives.present && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3">
                  <p className="eyebrow mb-1.5">Unequal lives</p>
                  <p className="text-[0.74rem] leading-relaxed text-slate-400">
                    {comparison.data.unequalLives.explanation}
                  </p>
                </div>
              )}

              <div className="mt-4 border-t border-white/8 pt-3">
                <p className="eyebrow mb-2">Caveats</p>
                <ul className="space-y-1.5">
                  {comparison.data.caveats.map((c) => (
                    <li key={c} className="text-[0.72rem] leading-relaxed text-slate-500">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </GlassPanel>

        <GlassPanel tone="iris" className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Explain it to me plainly</p>
            {explainer.source && <SourceBadge source={explainer.source} />}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {EXPLAINER_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTopic(t);
                  explainer.ask({ ...facts, metricInFocus: t, question: questionFor(t) }, t);
                }}
                className="rounded-full px-3 py-1.5 text-[0.72rem] transition-all"
                style={{
                  background: topic === t ? `rgb(${TONE_RGB.iris} / 0.14)` : 'rgb(255 255 255 / 0.03)',
                  border: `1px solid ${topic === t ? `rgb(${TONE_RGB.iris} / 0.4)` : 'rgb(255 255 255 / 0.07)'}`,
                  color: topic === t ? TONE_HEX.iris : '#8a93a6',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {explainer.status === 'idle' && (
            <p className="text-[0.78rem] leading-relaxed text-slate-500">
              Pick a measure above and Claude will explain what it means for this decision, in
              plain language, using only the figures the engine computed.
            </p>
          )}
          {explainer.status === 'loading' && !explainer.text && (
            <Loading label="Writing the explanation…" />
          )}

          {explainer.text && (
            <div className="space-y-3">
              {explainer.text.split('\n\n').map((para, i) => (
                <p key={i} className="text-[0.82rem] leading-relaxed text-slate-300">
                  {para}
                </p>
              ))}
            </div>
          )}

          <p className="mt-5 border-t border-white/5 pt-3 text-[0.68rem] leading-relaxed text-slate-500">
            Current figures for context: NPV{' '}
            <span className="numeric">AED {money(model.npv)}</span>, IRR{' '}
            <span className="numeric">{percent(model.irr.value)}</span>, hurdle{' '}
            <span className="numeric">{percent(inputs.wacc)}</span>. Claude is given these as
            data — it is not asked to work anything out.
          </p>
        </GlassPanel>
      </div>

      <div className="mt-5">
        <Callout tone="iris" title="How the AI layer is constrained">
          Claude receives a facts package built from the verified engine and returns only
          interpretation. The three structured surfaces are schema-constrained and none of those
          schemas contains a numeric field, so the model cannot return a figure even if it computed
          one. Its recommendation is displayed beside a deterministic rule-based verdict, and the
          two are compared explicitly rather than the AI answer being presented alone. Every
          response is labelled with whether it came from the live API or from pre-authored fallback
          text.
        </Callout>
      </div>
    </SectionShell>
  );
}

function questionFor(topic: string): string {
  return `Explain ${topic} for this appraisal: what it measures, what its value is here, and what it implies for the decision.`;
}

function SourceBadge({ source }: { source: Source }) {
  const live = source === 'live';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.62rem]"
      style={{
        background: live ? `rgb(${TONE_RGB.verdant} / 0.11)` : `rgb(${TONE_RGB.amber} / 0.11)`,
        color: live ? TONE_HEX.verdant : TONE_HEX.amber,
        border: `1px solid ${live ? `rgb(${TONE_RGB.verdant} / 0.28)` : `rgb(${TONE_RGB.amber} / 0.28)`}`,
      }}
      title={live ? 'Generated live by the Anthropic API.' : FALLBACK_NOTICE}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: live ? TONE_HEX.verdant : TONE_HEX.amber }}
      />
      {live ? 'Live from Claude' : 'Pre-generated'}
    </span>
  );
}

function RunPrompt({ label, onRun }: { label: string; onRun: () => void }) {
  return (
    <button
      onClick={onRun}
      className="w-full rounded-xl border border-dashed border-white/12 px-4 py-6 text-[0.8rem] text-slate-400 transition-colors hover:border-white/25 hover:text-slate-100"
    >
      {label}
    </button>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-6 text-[0.8rem] text-slate-400">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full" style={{ background: TONE_HEX.iris }} />
      {label}
    </div>
  );
}

function RiskChip({ severity, likelihood }: { severity: string; likelihood: string }) {
  const score = rank(severity) + rank(likelihood);
  const tone: Tone = score >= 5 ? 'plasma' : score >= 4 ? 'amber' : 'photon';
  return (
    <span
      className="numeric shrink-0 rounded-full px-2 py-0.5 text-[0.6rem]"
      style={{
        background: `rgb(${TONE_RGB[tone]} / 0.12)`,
        color: TONE_HEX[tone],
        border: `1px solid rgb(${TONE_RGB[tone]} / 0.25)`,
      }}
      title={`Severity ${severity}, likelihood ${likelihood}`}
    >
      {severity.charAt(0).toUpperCase()}/{likelihood.charAt(0).toUpperCase()}
    </span>
  );
}

function rank(value: string): number {
  return value === 'high' ? 3 : value === 'medium' ? 2 : 1;
}
