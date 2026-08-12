/**
 * Decides whether the WebGL scene should run at all.
 *
 * Two reasons to decline: the device cannot give us a WebGL context, or the
 * user has asked their operating system for reduced motion. In both cases the
 * calling component renders a static DOM fallback instead — the die carries
 * information, so it needs a substitute rather than simply being dropped.
 */

import { useEffect, useState } from 'react';

export interface SceneCapability {
  webgl: boolean;
  reducedMotion: boolean;
  /** True when the animated 3D scene should be rendered. */
  enabled: boolean;
  /** False until the check has run, so nothing flashes on first paint. */
  resolved: boolean;
}

function detectWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

export function useSceneCapability(): SceneCapability {
  const [state, setState] = useState<SceneCapability>({
    webgl: false,
    reducedMotion: false,
    enabled: false,
    resolved: false,
  });

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const webgl = detectWebgl();

    const apply = () => {
      const reducedMotion = query.matches;
      setState({
        webgl,
        reducedMotion,
        enabled: webgl && !reducedMotion,
        resolved: true,
      });
    };

    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return state;
}
