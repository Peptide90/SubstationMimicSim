import type { DrawingDocument, ElectricalSymbol, ScenarioDefinition, ScenarioDifficulty, ScenarioEvent, ScenarioObjective } from '../drawing/model';
import { serializeDrawingDocument } from '../schema/documentSchema';

export interface ScenarioPackage {
  id: string;
  title: string;
  description: string;
  difficulty: ScenarioDifficulty;
  tags: string[];
  drawing: DrawingDocument;
  scenario: ScenarioDefinition;
  createdAt: string;
  updatedAt: string;
}

export function createScenarioFromDrawing(doc: DrawingDocument, patch: Partial<ScenarioDefinition> = {}): ScenarioPackage {
  const now = new Date().toISOString();
  const scenario: ScenarioDefinition = {
    id: patch.id ?? `scenario-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    name: patch.name ?? `${doc.name} scenario`,
    description: patch.description ?? doc.description ?? '',
    learningObjectives: patch.learningObjectives ?? ['Operate the schematic safely and satisfy the objectives.'],
    minTier: patch.minTier,
    maxTier: patch.maxTier,
    recommendedTier: patch.recommendedTier ?? 'Apprentice',
    supportedTiers: patch.supportedTiers,
    explanationVariants: patch.explanationVariants ?? {},
    mode: patch.mode ?? 'lesson',
    difficulty: patch.difficulty ?? 'intro',
    tags: patch.tags ?? doc.tags ?? [],
    briefing: patch.briefing ?? {
      expectedOperatorRole: 'Control engineer trainee',
      initialCondition: 'Initial switch states and source states are restored when the scenario starts.',
      restrictions: [],
      warnings: ['Operate circuit breakers before disconnectors under load.', 'Maintain voltage segregation and avoid live-earth conflicts.'],
      winConditions: patch.objectives?.map((objective) => objective.text) ?? ['Complete the listed objectives.'],
      loseConditions: ['Live-earth conflict', 'Wrong switching sequence', 'Voltage mismatch', 'Too many incorrect operations'],
      estimatedMinutes: patch.mode === 'challenge' ? 8 : 5
    },
    restrictions: patch.restrictions ?? (patch.mode === 'challenge' || patch.mode === 'lesson' ? { disableDrawingTools: true, disablePlacement: true, disableDelete: true, disableInspectorEditing: true } : {}),
    teachingSteps: patch.teachingSteps ?? [],
    currentStepIndex: patch.currentStepIndex ?? 0,
    scoring: patch.scoring ?? { stars: 0, score: 0, operationCount: 0, penalties: 0, safetyBonus: 0, noTripBonus: 0, noIncorrectOperationBonus: 0 },
    initialSwitchStates: patch.initialSwitchStates ?? captureSwitchStates(doc),
    initialSourceStates: patch.initialSourceStates ?? captureSourceStates(doc),
    faults: patch.faults ?? doc.faults,
    relays: patch.relays ?? doc.relays,
    protection: patch.protection ?? doc.protection,
    powerFlows: patch.powerFlows ?? capturePowerFlows(doc),
    activeView: patch.activeView ?? doc.activeView,
    objectives: patch.objectives ?? defaultObjectives(doc),
    tierObjectives: patch.tierObjectives ?? {},
    events: patch.events ?? [],
    successRules: patch.successRules ?? { requireNoLiveEarthConflict: true, requireVoltageSegregation: true },
    failureRules: patch.failureRules ?? { requireNoLiveEarthConflict: true, requireVoltageSegregation: true, maxWrongOperations: 3 },
    expectedSolution: patch.expectedSolution ?? [],
    replayLog: [],
    wrongOperationCount: 0,
    currentHintIndex: 0
  };
  return {
    id: scenario.id,
    title: scenario.name,
    description: scenario.description ?? '',
    difficulty: scenario.difficulty ?? 'intro',
    tags: scenario.tags ?? [],
    drawing: serializeDrawingDocument({ ...doc, scenarios: [scenario], activeScenarioId: scenario.id }),
    scenario,
    createdAt: now,
    updatedAt: now
  };
}

export function duplicateScenarioPackage(pkg: ScenarioPackage, name = `${pkg.title} copy`): ScenarioPackage {
  const now = new Date().toISOString();
  const id = `scenario-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const scenario = { ...pkg.scenario, id, name, replayLog: [], startedAt: undefined, elapsedMs: 0 };
  return { ...pkg, id, title: name, scenario, drawing: { ...pkg.drawing, id: `drawing-${id}`, name, scenarios: [scenario], activeScenarioId: id }, createdAt: now, updatedAt: now };
}

export function updateScenarioPackage(pkg: ScenarioPackage, patch: Partial<ScenarioDefinition>): ScenarioPackage {
  const scenario = { ...pkg.scenario, ...patch };
  return {
    ...pkg,
    title: scenario.name,
    description: scenario.description ?? '',
    difficulty: scenario.difficulty ?? 'intro',
    tags: scenario.tags ?? [],
    scenario,
    drawing: { ...pkg.drawing, scenarios: [scenario], activeScenarioId: scenario.id },
    updatedAt: new Date().toISOString()
  };
}

export function makeScenarioEvent(type: ScenarioEvent['type'], atMs: number, patch: Partial<ScenarioEvent> = {}): ScenarioEvent {
  return { id: `event-${Date.now()}-${Math.floor(Math.random() * 9999)}`, type, atMs, ...patch };
}

function captureSwitchStates(doc: DrawingDocument) {
  return Object.fromEntries(doc.objects.symbols
    .filter((symbol) => isSwitchgear(symbol))
    .map((symbol) => [symbol.id, symbol.operation?.switchState ?? 'open']));
}

function captureSourceStates(doc: DrawingDocument) {
  return Object.fromEntries(doc.objects.symbols
    .filter((symbol) => symbol.type === 'source')
    .map((symbol) => [symbol.id, symbol.operation?.sourceOn !== false]));
}

function capturePowerFlows(doc: DrawingDocument) {
  return Object.fromEntries([
    ...doc.objects.symbols,
    ...doc.objects.conductors,
    ...doc.objects.busbars
  ].filter((object) => object.powerFlow).map((object) => [object.id, object.powerFlow!]));
}

function defaultObjectives(doc: DrawingDocument): ScenarioObjective[] {
  const firstBusbar = doc.objects.busbars[0];
  const firstLoad = doc.objects.symbols.find((symbol) => symbol.type === 'load');
  return [
    ...(firstBusbar ? [{ id: 'objective-energise-busbar', text: `Energise ${firstBusbar.id}`, type: 'energise-target-busbar' as const, targetObjectId: firstBusbar.id, targetState: 'live' as const, hint: 'Start with a source and close only the required switchgear.' }] : []),
    ...(firstLoad ? [{ id: 'objective-restore-load', text: `Restore supply to ${firstLoad.label?.text ?? firstLoad.id}`, type: 'restore-supply-to-load' as const, targetObjectId: firstLoad.id, targetState: 'live' as const, hint: 'Trace from the source through the breaker path to the load.' }] : [])
  ];
}

function isSwitchgear(symbol: ElectricalSymbol) {
  return symbol.type === 'circuit-breaker' || symbol.type === 'disconnector' || symbol.type === 'earth-switch';
}
