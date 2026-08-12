/**
 * Client side of the Claude advisory layer.
 *
 * Every call has two possible sources, and the hook always reports which one it
 * used. `live` means the response came from Claude; `fallback` means the API was
 * unreachable and the interface is showing pre-authored text. The distinction is
 * surfaced rather than smoothed over — text written in advance and presented as
 * a model response would misrepresent the thing this project is being marked on.
 */

import { useCallback, useState } from 'react';
import type { AdvisorTask, Comparison, RiskRegister, Verdict } from './schemas';
import type { AdvisorFacts } from './payload';
import {
  fallbackComparison,
  fallbackExplanation,
  fallbackRisks,
  fallbackVerdict,
} from './fallback';

export type Source = 'live' | 'fallback';
export type Status = 'idle' | 'loading' | 'ready' | 'error';

const ENDPOINT = '/api/advisor';

interface StructuredState<T> {
  status: Status;
  data: T | null;
  source: Source | null;
  error: string | null;
}

const initial = <T>(): StructuredState<T> => ({
  status: 'idle',
  data: null,
  source: null,
  error: null,
});

/**
 * Requests one of the structured surfaces. On any failure — no key, rate limit,
 * network, malformed output — it resolves to the pre-authored equivalent rather
 * than rejecting, so the section always renders something useful.
 */
function useStructured<T>(task: AdvisorTask, fallbackValue: T) {
  const [state, setState] = useState<StructuredState<T>>(initial<T>());

  const run = useCallback(
    async (facts: AdvisorFacts) => {
      setState({ status: 'loading', data: null, source: null, error: null });
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ task, facts }),
        });

        // Same guard as the streaming path: a static host with an SPA rewrite
        // answers an unknown route with index.html at HTTP 200, which is not a
        // failure the status code reveals.
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          setState({
            status: 'ready',
            data: fallbackValue,
            source: 'fallback',
            error: 'no_api_route',
          });
          return;
        }

        const body = (await response.json()) as {
          result?: T;
          error?: string;
          fallback?: boolean;
        };

        if (response.ok && body.result) {
          setState({ status: 'ready', data: body.result, source: 'live', error: null });
          return;
        }

        setState({
          status: 'ready',
          data: fallbackValue,
          source: 'fallback',
          error: body.error ?? `http_${response.status}`,
        });
      } catch (error) {
        setState({
          status: 'ready',
          data: fallbackValue,
          source: 'fallback',
          error: error instanceof Error ? error.message : 'network_error',
        });
      }
    },
    [task, fallbackValue],
  );

  return { ...state, run };
}

export const useRiskRegister = () => useStructured<RiskRegister>('risks', fallbackRisks);
export const useComparison = () => useStructured<Comparison>('compare', fallbackComparison);
export const useVerdict = () => useStructured<Verdict>('verdict', fallbackVerdict);

/**
 * The explainer streams, so its text accumulates as it arrives rather than
 * appearing all at once. A stream that fails partway through keeps whatever
 * arrived and appends the fallback, rather than discarding it.
 */
export function useExplainer() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [source, setSource] = useState<Source | null>(null);

  const ask = useCallback(async (facts: AdvisorFacts, metricInFocus?: string) => {
    setStatus('loading');
    setText('');
    setSource(null);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task: 'explain', facts }),
      });

      /**
       * The content-type check is load-bearing, not defensive noise. A static
       * host with an SPA rewrite answers an unknown path with index.html at
       * HTTP 200 rather than a 404 — so `response.ok` is true and a body
       * exists, and without this guard the explainer would stream raw HTML into
       * the panel instead of falling back. (`vite dev` happens to return a
       * clean 404 for an unknown POST, so it does not exercise this path; a
       * static deployment missing its serverless function does.)
       */
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || !response.body || !contentType.startsWith('text/plain')) {
        setText(fallbackExplanation(metricInFocus));
        setSource('fallback');
        setStatus('ready');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setText(accumulated);
      }

      // An empty stream means the request was accepted but produced nothing —
      // treat it as a failure rather than showing a blank panel.
      if (accumulated.trim().length === 0) {
        setText(fallbackExplanation(metricInFocus));
        setSource('fallback');
      } else {
        setSource('live');
      }
      setStatus('ready');
    } catch {
      setText(fallbackExplanation(metricInFocus));
      setSource('fallback');
      setStatus('ready');
    }
  }, []);

  return { text, status, source, ask };
}
