import { create } from 'zustand';

/** State of a single agent step during full-campaign generation. */
export type AgentStepState = 'pending' | 'running' | 'done' | 'failed';

/** Keys map to the real async tasks in generateFullCampaign. */
export type AgentStepKey = 'script' | 'instagram' | 'x' | 'facebook' | 'linkedin';

export const STEP_KEYS: AgentStepKey[] = ['script', 'instagram', 'x', 'facebook', 'linkedin'];

type Steps = Record<AgentStepKey, AgentStepState>;

const allWith = (state: AgentStepState): Steps => ({
  script: state,
  instagram: state,
  x: state,
  facebook: state,
  linkedin: state,
});

interface GenerationState {
  /** The campaign currently being generated, or null when idle. */
  campaignId: string | null;
  steps: Steps;
  /** Marks generation as started: every parallel task is running. */
  start: (campaignId: string) => void;
  /** Updates a single task as it resolves or rejects. */
  setStep: (key: AgentStepKey, state: AgentStepState) => void;
  /** Clears progress once generation settles. */
  finish: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  campaignId: null,
  steps: allWith('pending'),
  start: (campaignId) => set({ campaignId, steps: allWith('running') }),
  setStep: (key, state) =>
    set((s) => ({ steps: { ...s.steps, [key]: state } })),
  finish: () => set({ campaignId: null, steps: allWith('pending') }),
}));
