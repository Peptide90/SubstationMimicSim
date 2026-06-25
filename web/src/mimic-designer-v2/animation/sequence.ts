export const ACTION_TYPES = [
  'operate-switchgear',
  'close-circuit-breaker',
  'open-circuit-breaker',
  'close-disconnector',
  'open-disconnector',
  'close-earth-switch',
  'open-earth-switch',
  'toggle-source',
  'apply-fault',
  'clear-fault',
  'energise-path',
  'de-energise-path',
  'show-callout',
  'hide-callout',
  'highlight-object',
  'clear-highlight',
  'wait'
] as const;

export type SequenceActionType = (typeof ACTION_TYPES)[number];

export interface AnimationSequenceSettings {
  defaultEventDuration: number;
  defaultDelayAfter: number;
  showEventCaptions: boolean;
  showCallouts: boolean;
  highlightOperatedLabels: boolean;
  trimLineEnergisation: boolean;
  includeEventLogOverlay: boolean;
  includeGrid: boolean;
  theme: 'current' | 'light' | 'dark';
  trimDirection: 'automatic';
  busbarEnergisationDuration: number;
  conductorEnergisationDuration: number;
  fps: number;
  exportResolution: { mode: 'current-canvas'; width: number | null; height: number | null };
}

export interface AnimationSequenceStep {
  id: string;
  name: string;
  actionType: SequenceActionType;
  targetId: string | null;
  targetTopologyElementId: string | null;
  targetLabel: string;
  eventDurationSeconds: number;
  delayAfterSeconds: number;
  easing: string;
  notes: string;
  enabled: boolean;
}

export interface AnimationSequence {
  id: string;
  name: string;
  steps: AnimationSequenceStep[];
  settings: AnimationSequenceSettings;
}

export const DEFAULT_ANIMATION_SETTINGS: AnimationSequenceSettings = {
  defaultEventDuration: 1,
  defaultDelayAfter: 0.25,
  showEventCaptions: true,
  showCallouts: true,
  highlightOperatedLabels: true,
  trimLineEnergisation: true,
  includeEventLogOverlay: false,
  includeGrid: false,
  theme: 'current',
  trimDirection: 'automatic',
  busbarEnergisationDuration: 1,
  conductorEnergisationDuration: 1,
  fps: 30,
  exportResolution: { mode: 'current-canvas', width: null, height: null }
};

function cryptoId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSequence(name = 'Animated Sequence', settings: Partial<AnimationSequenceSettings> = {}): AnimationSequence {
  return { id: cryptoId('seq'), name, steps: [], settings: { ...DEFAULT_ANIMATION_SETTINGS, ...settings } };
}

export function validateStep(step: AnimationSequenceStep): boolean {
  if (!ACTION_TYPES.includes(step.actionType)) throw new Error(`Unsupported action type: ${step.actionType}`);
  for (const key of ['eventDurationSeconds', 'delayAfterSeconds'] as const) {
    if (typeof step[key] !== 'number' || Number.isNaN(step[key]) || step[key] < 0) {
      throw new Error(`${key} must be a non-negative number`);
    }
  }
  return true;
}

export function createStep(input: Partial<AnimationSequenceStep> = {}, sequenceSettings: AnimationSequenceSettings = DEFAULT_ANIMATION_SETTINGS): AnimationSequenceStep {
  const step: AnimationSequenceStep = {
    id: input.id || cryptoId('step'),
    name: input.name || input.targetLabel || 'New step',
    actionType: input.actionType || 'wait',
    targetId: input.targetId ?? null,
    targetTopologyElementId: input.targetTopologyElementId ?? null,
    targetLabel: input.targetLabel || '',
    eventDurationSeconds: input.eventDurationSeconds ?? sequenceSettings.defaultEventDuration,
    delayAfterSeconds: input.delayAfterSeconds ?? sequenceSettings.defaultDelayAfter,
    easing: input.easing || 'linear',
    notes: input.notes || '',
    enabled: input.enabled ?? true
  };
  validateStep(step);
  return step;
}

export function totalDuration(sequence: AnimationSequence): number {
  return sequence.steps.filter((step) => step.enabled).reduce((sum, step) => sum + step.eventDurationSeconds + step.delayAfterSeconds, 0);
}

export function addStep(sequence: AnimationSequence, input: Partial<AnimationSequenceStep> = {}): AnimationSequence {
  return { ...sequence, steps: [...sequence.steps, createStep(input, sequence.settings)] };
}

export function updateStep(sequence: AnimationSequence, id: string, patch: Partial<AnimationSequenceStep>): AnimationSequence {
  return {
    ...sequence,
    steps: sequence.steps.map((step) => {
      if (step.id !== id) return step;
      const next = { ...step, ...patch };
      validateStep(next);
      return next;
    })
  };
}

export function duplicateStep(sequence: AnimationSequence, id: string): AnimationSequence {
  const index = sequence.steps.findIndex((step) => step.id === id);
  if (index < 0) return sequence;
  const copy = { ...sequence.steps[index], id: cryptoId('step'), name: `${sequence.steps[index].name} copy` };
  const steps = sequence.steps.slice();
  steps.splice(index + 1, 0, copy);
  return { ...sequence, steps };
}

export function deleteStep(sequence: AnimationSequence, id: string): AnimationSequence {
  return { ...sequence, steps: sequence.steps.filter((step) => step.id !== id) };
}

export function moveStep(sequence: AnimationSequence, id: string, direction: -1 | 1): AnimationSequence {
  const steps = sequence.steps.slice();
  const index = steps.findIndex((step) => step.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= steps.length) return sequence;
  [steps[index], steps[next]] = [steps[next], steps[index]];
  return { ...sequence, steps };
}
