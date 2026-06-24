export const ACTION_TYPES = [
  'operate-switchgear','close-circuit-breaker','open-circuit-breaker','close-disconnector','open-disconnector','close-earth-switch','open-earth-switch','toggle-source','apply-fault','clear-fault','energise-path','de-energise-path','show-callout','hide-callout','highlight-object','clear-highlight','wait'
];

export const DEFAULT_ANIMATION_SETTINGS = Object.freeze({
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
});

export const DEFAULT_VISUAL_SETTINGS = Object.freeze({
  busbarThickness: 8,
  cableStrokeWidth: 3,
  textSize: 14,
  componentSymbolSize: 32,
  labelSize: 13,
  phaseSpacing: 12,
  theme: 'light'
});

export function createSequence(name = 'Animated Sequence', settings = {}) {
  return { id: cryptoId('seq'), name, steps: [], settings: { ...DEFAULT_ANIMATION_SETTINGS, ...settings } };
}

export function createStep(input = {}, sequenceSettings = DEFAULT_ANIMATION_SETTINGS) {
  const step = {
    id: input.id || cryptoId('step'),
    name: input.name || input.label || 'New step',
    actionType: input.actionType || 'wait',
    targetId: input.targetId || null,
    targetTopologyElementId: input.targetTopologyElementId || null,
    targetLabel: input.targetLabel || '',
    eventDurationSeconds: input.eventDurationSeconds ?? sequenceSettings.defaultEventDuration ?? 1,
    delayAfterSeconds: input.delayAfterSeconds ?? sequenceSettings.defaultDelayAfter ?? 0.25,
    easing: input.easing || 'linear',
    notes: input.notes || '',
    enabled: input.enabled ?? true
  };
  validateStep(step);
  return step;
}

export function validateStep(step) {
  if (!ACTION_TYPES.includes(step.actionType)) throw new Error(`Unsupported action type: ${step.actionType}`);
  for (const key of ['eventDurationSeconds','delayAfterSeconds']) {
    if (typeof step[key] !== 'number' || Number.isNaN(step[key]) || step[key] < 0) throw new Error(`${key} must be a non-negative number`);
  }
  return true;
}

export function totalDuration(sequence) {
  return sequence.steps.filter(s => s.enabled).reduce((sum, s) => sum + s.eventDurationSeconds + s.delayAfterSeconds, 0);
}

export function addStep(sequence, input) {
  return { ...sequence, steps: [...sequence.steps, createStep(input, sequence.settings)] };
}

export function updateStep(sequence, id, patch) {
  return { ...sequence, steps: sequence.steps.map(s => s.id === id ? checked({ ...s, ...patch }) : s) };
}
export function duplicateStep(sequence, id) {
  const idx = sequence.steps.findIndex(s => s.id === id); if (idx < 0) return sequence;
  const copy = { ...sequence.steps[idx], id: cryptoId('step'), name: `${sequence.steps[idx].name} copy` };
  const steps = sequence.steps.slice(); steps.splice(idx + 1, 0, copy); return { ...sequence, steps };
}
export function deleteStep(sequence, id) { return { ...sequence, steps: sequence.steps.filter(s => s.id !== id) }; }
export function moveStep(sequence, id, direction) {
  const steps = sequence.steps.slice(); const idx = steps.findIndex(s => s.id === id); const next = idx + direction;
  if (idx < 0 || next < 0 || next >= steps.length) return sequence;
  [steps[idx], steps[next]] = [steps[next], steps[idx]]; return { ...sequence, steps };
}

export function findTargets(drawing, query = '') {
  const q = query.toLowerCase();
  return (drawing.objects || []).filter(o => [o.id, o.label, o.type].some(v => String(v || '').toLowerCase().includes(q)))
    .map(o => ({ id: o.id, label: o.label || o.id, type: o.type }));
}

export function playSequence(sequence, drawing, opts = {}) {
  const initialState = structuredClone(drawing.state || {});
  const state = structuredClone(initialState);
  const log = [];
  for (const step of sequence.steps.filter(s => s.enabled)) {
    applyStep(step, state);
    log.push({ stepId: step.id, actionType: step.actionType, targetId: step.targetId, atSeconds: log.reduce((t, e) => t + e.duration, 0), duration: step.eventDurationSeconds + step.delayAfterSeconds });
  }
  return { initialState, finalState: state, log, drawingState: opts.applyFinalState ? state : initialState };
}

function applyStep(step, state) {
  const id = step.targetId || step.targetTopologyElementId;
  if (!id && step.actionType !== 'wait') return;
  state.objects ||= {};
  state.objects[id] ||= {};
  if (step.actionType.startsWith('close') || step.actionType === 'energise-path') state.objects[id].energised = true;
  if (step.actionType.startsWith('open') || step.actionType === 'de-energise-path') state.objects[id].energised = false;
  if (step.actionType === 'toggle-source') state.objects[id].sourceOn = !state.objects[id].sourceOn;
  if (step.actionType === 'apply-fault') state.objects[id].faulted = true;
  if (step.actionType === 'clear-fault') state.objects[id].faulted = false;
  if (step.actionType === 'highlight-object') state.objects[id].highlighted = true;
  if (step.actionType === 'clear-highlight') state.objects[id].highlighted = false;
}
function checked(step){ validateStep(step); return step; }
function cryptoId(prefix){ return `${prefix}-${Math.random().toString(36).slice(2,10)}`; }
