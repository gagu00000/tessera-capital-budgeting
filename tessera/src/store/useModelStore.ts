/**
 * Application state.
 *
 * There is exactly one piece of authoritative state — the current ProjectInputs.
 * Everything else the interface displays is a pure derivation of it. The model
 * is recomputed inside the setter rather than in a component effect so that no
 * render can ever observe inputs and results that disagree with each other.
 */

import { create } from 'zustand';
import type { ProjectInputs, ModelResult } from '../engine/types';
import { computeModel } from '../engine/model';
import { ALT_A, ALT_B, ALT_C, ALTERNATIVES } from '../data/scenario';

export type AlternativeId = 'A' | 'B' | 'C';

const PRISTINE: Record<AlternativeId, ProjectInputs> = {
  A: ALT_A,
  B: ALT_B,
  C: ALT_C,
};

/** Comparison across the three options always uses the untouched definitions. */
export const PRISTINE_MODELS: Record<AlternativeId, ModelResult> = {
  A: computeModel(ALT_A),
  B: computeModel(ALT_B),
  C: computeModel(ALT_C),
};

export const PRISTINE_MODEL_LIST = ALTERNATIVES.map((a) =>
  PRISTINE_MODELS[a.id as AlternativeId],
);

interface ModelState {
  activeId: AlternativeId;
  inputs: ProjectInputs;
  model: ModelResult;
  /** True once the user has changed anything away from the published assumptions. */
  isDirty: boolean;

  selectAlternative: (id: AlternativeId) => void;
  patchInputs: (patch: Partial<ProjectInputs>) => void;
  setUtilisation: (yearIndex: number, value: number) => void;
  resetToBaseCase: () => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  activeId: 'A',
  inputs: ALT_A,
  model: PRISTINE_MODELS.A,
  isDirty: false,

  selectAlternative: (id) =>
    set({
      activeId: id,
      inputs: PRISTINE[id],
      model: PRISTINE_MODELS[id],
      isDirty: false,
    }),

  patchInputs: (patch) => {
    const inputs = { ...get().inputs, ...patch };
    set({ inputs, model: computeModel(inputs), isDirty: true });
  },

  setUtilisation: (yearIndex, value) => {
    const current = get().inputs;
    const utilisationByYear = current.utilisationByYear.map((u, i) =>
      i === yearIndex ? value : u,
    );
    const inputs = { ...current, utilisationByYear };
    set({ inputs, model: computeModel(inputs), isDirty: true });
  },

  resetToBaseCase: () => {
    const id = get().activeId;
    set({ inputs: PRISTINE[id], model: PRISTINE_MODELS[id], isDirty: false });
  },
}));
