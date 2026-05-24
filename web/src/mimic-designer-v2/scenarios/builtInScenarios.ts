import type { FaultMetadata, ScenarioDefinition } from '../drawing/model';
import { builtInExamples, builtInTemplates } from '../templates';
import { createScenarioFromDrawing, makeScenarioEvent, type ScenarioPackage } from './packageScenario';

const now = () => new Date().toISOString();

export const builtInScenarioPackages: ScenarioPackage[] = [
  scenarioFromExample('template-simple-radial-feeder', {
    name: 'Junior: switch on a simple circuit',
    description: 'A friendly first lesson about electricity flowing through a safe closed path.',
    mode: 'lesson',
    difficulty: 'intro',
    tags: ['junior', 'power-flow', 'safety'],
    minTier: 'Junior',
    maxTier: 'Junior',
    recommendedTier: 'Junior',
    learningObjectives: ['See electricity flow when a safe switch path is closed.', 'Use a breaker to stop the flow.'],
    explanationVariants: {
      Junior: 'Electricity flows when there is a complete safe path from the supply to the load.'
    },
    objectives: [{ id: 'junior-flow', text: 'Make electricity flow safely to the load', type: 'restore-supply-to-load', targetObjectId: 'radial-load', targetState: 'live', hint: 'Try closing the breaker so the electricity has a safe path.' }]
  }),
  scenarioFromExample('example-normal-energisation', {
    name: 'Basic feeder energisation',
    description: 'Close the normal feeder path and energise the target busbar.',
    difficulty: 'intro',
    tags: ['energisation', 'basic'],
    minTier: 'Student',
    recommendedTier: 'Student',
    supportedTiers: ['Student', 'Apprentice', 'Engineer', 'Commissioning Engineer'],
    objectives: [{ id: 'energise-bus', text: 'Energise the feeder busbar', type: 'energise-target-busbar', targetObjectId: 'ex-normal-bus', targetState: 'live', hint: 'Confirm the source is on and close the breaker path.' }]
  }),
  scenarioFromExample('template-simple-radial-feeder', {
    name: 'Do not open disconnector on load',
    description: 'Teach that load current should be interrupted by a breaker, not a disconnector.',
    mode: 'challenge',
    difficulty: 'standard',
    tags: ['switching', 'disconnector'],
    minTier: 'Apprentice',
    recommendedTier: 'Apprentice',
    objectives: [
      { id: 'open-cb', text: 'Open the circuit breaker before operating disconnectors', type: 'operate-switchgear', targetObjectId: 'radial-cb', targetState: 'open', hint: 'Use the CB to interrupt load current first.' },
      { id: 'avoid-ds-load', text: 'Avoid operating a disconnector under load', type: 'avoid-disconnector-under-load', targetObjectId: 'radial-ds1', hint: 'Disconnector operation under load counts as a wrong operation.' }
    ],
    failureRules: { maxWrongOperations: 0, requireNoLiveEarthConflict: true }
  }),
  scenarioFromExample('template-simple-radial-feeder', {
    name: 'Earth switch interlock lesson',
    description: 'Isolate before closing an earth switch.',
    difficulty: 'standard',
    tags: ['earthing', 'interlock'],
    minTier: 'Apprentice',
    recommendedTier: 'Apprentice',
    objectives: [
      { id: 'open-cb', text: 'Open the circuit breaker', type: 'operate-switchgear', targetObjectId: 'radial-cb', targetState: 'open' },
      { id: 'no-live-earth', text: 'Maintain no live-earth conflict', type: 'maintain-no-live-earth-conflict', targetObjectId: 'radial-es2', hint: 'Do not close the earth switch onto a live busbar.' }
    ],
    successRules: { requireNoLiveEarthConflict: true }
  }),
  scenarioFromExample('example-phase-specific-vt-ct', {
    name: 'Single-phase VT fault',
    description: 'Inspect the phase-specific VT and identify the affected phase.',
    difficulty: 'intro',
    tags: ['vt', 'phase-specific'],
    minTier: 'Student',
    recommendedTier: 'Student',
    events: [makeScenarioEvent('scheduled-fault', 1000, { fault: fault('scenario-vt-fault', 'ex-phase-vt-b', 'B-E'), message: 'Phase B VT fault applied.' })],
    objectives: [{ id: 'inspect-vt', text: 'Identify the phase-specific VT fault', type: 'clear-fault-using-breaker', targetObjectId: 'ex-phase-vt-b', hint: 'The VT is marked as phase B only.' }]
  }),
  scenarioFromExample('example-phase-earth-fault', {
    name: 'Phase-to-earth fault trip',
    description: 'Use the correct breaker/protection path to clear a phase-earth fault.',
    mode: 'challenge',
    difficulty: 'standard',
    tags: ['fault', 'earth-fault'],
    minTier: 'Apprentice',
    recommendedTier: 'Engineer',
    objectives: [{ id: 'clear-pe-fault', text: 'Clear the phase-earth fault', type: 'clear-fault-using-breaker', targetObjectId: 'ex-a-e-bus', hint: 'Open the feeder breaker protecting the faulted section.' }]
  }),
  scenarioFromExample('example-hot-joint-thermal', {
    name: 'Hot joint thermal diagnosis',
    description: 'Use thermal view and inspection to identify a hot joint.',
    difficulty: 'intro',
    tags: ['thermal', 'hot-joint'],
    minTier: 'Apprentice',
    recommendedTier: 'Apprentice',
    objectives: [{ id: 'identify-hot', text: 'Identify the hot joint', type: 'identify-hot-joint', targetObjectId: 'ex-hot-bus', targetState: 'identified', hint: 'Switch to thermal overlay and inspect phase B.' }],
    activeView: 'thermal'
  }),
  scenarioFromExample('example-breaker-fail-backup', {
    name: 'Breaker fail with backup trip',
    description: 'Demonstrate backup trip metadata and breaker fail event sequencing.',
    mode: 'challenge',
    difficulty: 'advanced',
    tags: ['breaker-fail', 'backup-trip'],
    minTier: 'Engineer',
    recommendedTier: 'Commissioning Engineer',
    events: [makeScenarioEvent('breaker-fail', 1000, { targetObjectId: 'ex-bf-cb', message: 'Primary breaker fail condition armed.' }), makeScenarioEvent('relay-pickup-trip', 1800, { message: 'Backup trip expected.' })],
    objectives: [{ id: 'explain-bf', text: 'Explain/inspect protection trip', type: 'explain-protection-trip', targetObjectId: 'ex-bf-cb', hint: 'Inspect relay state and backup trip target.' }]
  }),
  scenarioFromExample('example-bus-coupler-operation', {
    name: 'Bus coupler restoration',
    description: 'Restore supply across the coupler after a source event.',
    mode: 'challenge',
    difficulty: 'standard',
    tags: ['bus-coupler', 'restoration'],
    minTier: 'Engineer',
    recommendedTier: 'Engineer',
    events: [makeScenarioEvent('source-trip', 1000, { targetObjectId: 'ex-bc-src', message: 'Incomer source tripped.' }), makeScenarioEvent('operator-prompt', 1300, { message: 'Restore through the bus coupler path.' })],
    objectives: [{ id: 'restore-coupler', text: 'Restore supply through bus coupler', type: 'energise-target-busbar', targetObjectId: 'ex-bc-reserve', targetState: 'live', hint: 'Use the closed coupler path to re-energise the reserve busbar.' }]
  })
].filter(Boolean) as ScenarioPackage[];

function scenarioFromExample(exampleId: string, patch: Partial<ScenarioDefinition>): ScenarioPackage {
  const template = [...builtInExamples, ...builtInTemplates].find((item) => item.id === exampleId) ?? builtInExamples[0];
  const doc = template.create();
  return createScenarioFromDrawing(doc, {
    id: `built-in-${patch.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    ...patch,
    expectedSolution: patch.expectedSolution ?? [{ id: `solution-${Date.now()}`, atMs: 0, action: 'hint', message: patch.objectives?.[0]?.hint ?? 'Follow the objective hints.' }]
  });
}

function fault(id: string, targetObjectId: string, type: FaultMetadata['type']): FaultMetadata {
  return { id, targetObjectId, type, phases: type === 'B-E' ? ['B'] : ['A'], targetPhase: type === 'B-E' ? 'B' : 'A', persistent: true, active: false, createdAt: now(), label: type };
}
