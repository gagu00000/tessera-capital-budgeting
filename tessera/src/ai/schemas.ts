/**
 * Output schemas for the Claude advisory layer.
 *
 * Every structured surface is schema-constrained rather than parsed out of free
 * text. This is not only for reliability: a schema is a contract about what the
 * model is allowed to say. None of these schemas contain a numeric field that
 * the model computes — the numbers are supplied to it and the model returns
 * interpretation, so there is no path by which an AI-invented figure can reach
 * the interface.
 */

import { z } from 'zod';

export const SEVERITY = ['low', 'medium', 'high'] as const;

export const riskRegisterSchema = z.object({
  risks: z.array(
    z.object({
      title: z.string().describe('Short name for the risk, under about eight words.'),
      category: z
        .enum(['financial', 'market', 'operational', 'technology', 'regulatory', 'strategic'])
        .describe('Which kind of risk this is. Non-financial categories matter as much as financial ones.'),
      severity: z.enum(SEVERITY).describe('How damaging this would be if it happened.'),
      likelihood: z.enum(SEVERITY).describe('How likely this is over the project life.'),
      driver: z
        .string()
        .describe(
          'The model driver this maps to, using the exact driver label supplied in the data, or "none" if it is a non-financial risk with no modelled driver.',
        ),
      rationale: z
        .string()
        .describe('Why this is a risk for this specific project, citing the supplied figures.'),
      mitigation: z.string().describe('One concrete action that would reduce this risk.'),
    }),
  ),
  summary: z.string().describe('Two sentences on the overall risk profile.'),
});

export const comparisonSchema = z.object({
  recommendedAlternativeId: z
    .string()
    .describe('The id of the alternative you would recommend: A, B, or C.'),
  headline: z.string().describe('One sentence stating the recommendation and why.'),
  rationale: z
    .array(z.string())
    .describe('Three to five points supporting the recommendation, each citing supplied figures.'),
  rankingConflict: z.object({
    present: z.boolean(),
    explanation: z
      .string()
      .describe(
        'Whether the alternatives rank differently on NPV than on other measures, and which measure should govern here and why.',
      ),
  }),
  unequalLives: z.object({
    present: z.boolean(),
    explanation: z
      .string()
      .describe(
        'Whether the alternatives have different lives, and what that does to the comparison.',
      ),
  }),
  caveats: z
    .array(z.string())
    .describe('Two or three things that would weaken this recommendation.'),
});

export const verdictSchema = z.object({
  decision: z
    .enum(['ACCEPT', 'REJECT', 'DELAY', 'REVIEW_FURTHER'])
    .describe('The recommendation on the alternative under appraisal.'),
  confidence: z.enum(SEVERITY).describe('How confident you are in this recommendation.'),
  headline: z.string().describe('One sentence stating the decision and the single reason for it.'),
  reasoning: z
    .array(z.string())
    .describe('Three to five points, each citing a supplied figure by name and value.'),
  conditions: z
    .array(z.string())
    .describe('Conditions that should attach to the decision, or an empty list if none.'),
  flipTriggers: z
    .array(z.string())
    .describe('Specific, observable changes that would reverse this recommendation.'),
  keyRisk: z.string().describe('The single risk that most threatens this decision.'),
});

export type RiskRegister = z.infer<typeof riskRegisterSchema>;
export type Comparison = z.infer<typeof comparisonSchema>;
export type Verdict = z.infer<typeof verdictSchema>;

export type AdvisorTask = 'explain' | 'risks' | 'compare' | 'verdict';
