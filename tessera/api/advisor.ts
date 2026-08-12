/**
 * The one server-side component in TESSERA.
 *
 * It exists for exactly one reason: the Anthropic API key must never reach the
 * browser. It performs no financial calculation — the facts package it forwards
 * has already been computed and verified client-side — so if this function is
 * unavailable the application still produces every number, and only the
 * commentary degrades.
 *
 * Deploy with ANTHROPIC_API_KEY set as a server-side environment variable.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
/**
 * These two carry explicit `.js` extensions and the type-only imports below do
 * not, which looks inconsistent but is not.
 *
 * This file is transpiled rather than bundled, and then run by Node's ESM
 * loader, which does not guess extensions the way a bundler does — an
 * extensionless specifier resolves fine under Vite and under `tsc`, and then
 * throws ERR_MODULE_NOT_FOUND at runtime in production. Type-only imports are
 * erased before Node ever sees them, so they are unaffected.
 */
import { SHARED_SYSTEM, TASK_PROMPTS } from '../src/ai/prompts.js';
import { riskRegisterSchema, comparisonSchema, verdictSchema } from '../src/ai/schemas.js';
import type { AdvisorTask } from '../src/ai/schemas';

/**
 * Opus 5 for every surface, with `effort` doing the tuning rather than a model
 * downgrade. The explainer answers a narrow question about figures it has been
 * handed, so it runs low; the three analytical surfaces run high.
 */
const MODEL = 'claude-opus-5';

const EFFORT: Record<AdvisorTask, 'low' | 'medium' | 'high'> = {
  explain: 'low',
  risks: 'high',
  compare: 'high',
  verdict: 'high',
};

const MAX_TOKENS = 8_000;

/** Rejects payloads far larger than a legitimate facts package. */
const MAX_BODY_BYTES = 256 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * Exported as a named HTTP method rather than as a default export.
 *
 * Vercel reads a default export as the legacy `(req, res) => void` signature
 * and discards anything it returns, so a handler written against the Web API
 * never answers and the request hangs until the function times out — a 504
 * rather than an error, which is the more confusing failure. A named method
 * export is unambiguously the fetch-style signature, and it also means the
 * platform rejects anything that is not a POST before this code runs.
 */
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Signals the client to fall back to its pre-generated commentary rather
    // than showing an error. The appraisal itself is unaffected.
    return json({ error: 'no_api_key', fallback: true }, 503);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }

  let task: AdvisorTask;
  let facts: unknown;
  try {
    const parsed = JSON.parse(raw) as { task?: AdvisorTask; facts?: unknown };
    if (!parsed.task || !(parsed.task in TASK_PROMPTS) || !parsed.facts) {
      return json({ error: 'bad_request' }, 400);
    }
    task = parsed.task;
    facts = parsed.facts;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const client = new Anthropic({ apiKey });

  /**
   * The stable preamble carries the cache breakpoint; the per-task instruction
   * follows it. Render order is tools, then system, then messages, so putting
   * the volatile facts package in the user turn leaves the cached prefix intact
   * across every request for the whole session.
   */
  const system = [
    { type: 'text' as const, text: SHARED_SYSTEM, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: TASK_PROMPTS[task] },
  ];

  const userContent = `Here is the verified facts package for this appraisal. Every number you cite must come from it.\n\n${JSON.stringify(facts, null, 2)}`;

  try {
    if (task === 'explain') {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        output_config: { effort: EFFORT[task] },
        messages: [{ role: 'user', content: userContent }],
      });

      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of stream) {
              if (
                event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta'
              ) {
                controller.enqueue(encoder.encode(event.delta.text));
              }
            }
            // Opus 5 runs safety classifiers; a declined request returns 200
            // with an empty or partial body, so the stop reason has to be
            // checked rather than assumed.
            const final = await stream.finalMessage();
            if (final.stop_reason === 'refusal') {
              controller.enqueue(
                encoder.encode(
                  '\n\n[This request was declined by the model’s safety classifiers. The appraisal figures are unaffected.]',
                ),
              );
            }
          } catch (error) {
            controller.enqueue(
              encoder.encode(`\n\n[The explanation stream failed: ${describe(error)}]`),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(body, {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    const schema =
      task === 'risks' ? riskRegisterSchema : task === 'compare' ? comparisonSchema : verdictSchema;

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      output_config: { effort: EFFORT[task], format: zodOutputFormat(schema) },
      messages: [{ role: 'user', content: userContent }],
    });

    if (response.stop_reason === 'refusal') {
      return json({ error: 'refusal', detail: response.stop_details ?? null }, 200);
    }
    if (!response.parsed_output) {
      return json({ error: 'unparsed_output' }, 502);
    }

    return json({ result: response.parsed_output, model: response.model });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'rate_limited', fallback: true }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return json({ error: 'auth_failed', fallback: true }, 401);
    }
    if (error instanceof Anthropic.APIError) {
      return json({ error: 'api_error', status: error.status, fallback: true }, 502);
    }
    return json({ error: 'unexpected', detail: describe(error), fallback: true }, 500);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
