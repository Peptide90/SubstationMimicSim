import type {
  DrawingDocument,
  ElectricalSymbol,
  LearningTier,
  LineEndColour,
  ScenarioDefinition,
  ScenarioObjective,
  ScenarioTeachingStep,
  SwitchingInstruction,
  SwitchingSheet
} from '../drawing/model';
import { createScenarioFromDrawing, type ScenarioPackage } from '../scenarios/packageScenario';

/**
 * Pure operations for authoring a scenario in the app.
 *
 * Every function takes a scenario and returns a new one, so the editor can
 * undo, the tests can drive it without a browser, and nothing here knows about
 * React. References between parts of a scenario — an objective's `requires`, a
 * step's objective, an objective's sheet — are kept consistent on removal.
 */

type Objective = ScenarioObjective;
type ObjectiveType = NonNullable<Objective['type']>;

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export const objectiveTypeLabels: Record<ObjectiveType, string> = {
  'restore-supply-to-load': 'Energise / keep a load supplied',
  'energise-target-busbar': 'Energise a busbar',
  'operate-switchgear': 'Put a switch in a given state',
  'isolate-target': 'Isolate (and optionally earth) equipment',
  'tag-isolation': 'Apply points of isolation or earthing',
  'complete-switching-sheet': 'Complete a switching sheet',
  'avoid-disconnector-under-load': 'Never switch load with a disconnector',
  'maintain-no-live-earth-conflict': 'Never earth live equipment',
  'isolate-faulted-section': 'Isolate a faulted section',
  'clear-fault-using-breaker': 'Clear a fault with a breaker',
  'identify-faulted-component': 'Identify the faulted component',
  'identify-hot-joint': 'Identify a hot joint',
  'explain-protection-trip': 'Observe a protection trip',
  'connect-between': 'Build: connect two points',
  'include-component': 'Build: include equipment',
  'build-bay': 'Build: a complete bay'
};

/** Which fields an objective type uses, so the editor shows only those. */
export function objectiveFields(type: ObjectiveType) {
  return {
    target: !['include-component', 'complete-switching-sheet', 'avoid-disconnector-under-load', 'maintain-no-live-earth-conflict', 'explain-protection-trip'].includes(type),
    targetRequired: !['include-component', 'complete-switching-sheet', 'tag-isolation', 'avoid-disconnector-under-load', 'maintain-no-live-earth-conflict', 'explain-protection-trip'].includes(type),
    secondary: type === 'connect-between' || type === 'build-bay',
    switchState: type === 'operate-switchgear',
    isolatedState: type === 'isolate-target',
    componentTypes: type === 'include-component' || type === 'tag-isolation',
    requiredCounts: type === 'build-bay' || type === 'include-component',
    sheet: type === 'complete-switching-sheet',
    isolationKind: type === 'tag-isolation'
  };
}

/** A fresh scenario for the drawing on screen, capturing its current switch states. */
export function newScenarioDraft(doc: DrawingDocument, name = `${doc.name} scenario`): ScenarioDefinition {
  return createScenarioFromDrawing(doc, {
    id: uid('scenario'),
    name,
    mode: 'lesson',
    difficulty: 'intro',
    recommendedTier: 'Apprentice',
    learningObjectives: [],
    objectives: [],
    teachingSteps: [],
    switchingSheets: [],
    restrictions: { disableDrawingTools: true, disablePlacement: true, disableDelete: true, disableInspectorEditing: true }
  }).scenario;
}

export function updateScenario(scenario: ScenarioDefinition, patch: Partial<ScenarioDefinition>): ScenarioDefinition {
  return { ...scenario, ...patch };
}

export function setTierExplanation(scenario: ScenarioDefinition, tier: LearningTier, text: string): ScenarioDefinition {
  return { ...scenario, explanationVariants: { ...(scenario.explanationVariants ?? {}), [tier]: text } };
}

// --- Objectives -------------------------------------------------------------

const objectiveDefaults = (type: ObjectiveType): Partial<Objective> => {
  switch (type) {
    case 'restore-supply-to-load':
    case 'energise-target-busbar':
      return { targetState: 'live' };
    case 'operate-switchgear':
      return { targetState: 'open' };
    case 'isolate-target':
      return { targetState: 'isolated' };
    case 'tag-isolation':
      return { isolationKind: 'point-of-isolation', componentTypes: ['disconnector'], count: 1 };
    case 'include-component':
      return { componentTypes: ['circuit-breaker'], count: 1 };
    case 'build-bay':
      return { requiredCounts: { 'circuit-breaker': 1, disconnector: 2 } };
    default:
      return {};
  }
};

export function addObjective(scenario: ScenarioDefinition, type: ObjectiveType = 'restore-supply-to-load', targetObjectId?: string): ScenarioDefinition {
  const objective: Objective = { id: uid('objective'), text: objectiveTypeLabels[type], type, targetObjectId, ...objectiveDefaults(type) };
  return { ...scenario, objectives: [...scenario.objectives, objective] };
}

export function updateObjective(scenario: ScenarioDefinition, id: string, patch: Partial<Objective>): ScenarioDefinition {
  return {
    ...scenario,
    objectives: scenario.objectives.map((objective) => {
      if (objective.id !== id) return objective;
      // Changing type resets the type-specific fields, keeping what the author wrote.
      if (patch.type && patch.type !== objective.type) {
        return { id, text: objective.text, hint: objective.hint, tierText: objective.tierText, tierHints: objective.tierHints, targetObjectId: objective.targetObjectId, ...objectiveDefaults(patch.type), ...patch };
      }
      return { ...objective, ...patch };
    })
  };
}

export function removeObjective(scenario: ScenarioDefinition, id: string): ScenarioDefinition {
  return {
    ...scenario,
    objectives: scenario.objectives
      .filter((objective) => objective.id !== id)
      .map((objective) => (objective.requires?.includes(id) ? { ...objective, requires: objective.requires.filter((item) => item !== id) } : objective)),
    teachingSteps: (scenario.teachingSteps ?? []).map((step) => (step.objectiveId === id ? { ...step, objectiveId: undefined, waitFor: 'manual' as const } : step))
  };
}

function move<T extends { id: string }>(items: T[], id: string, direction: -1 | 1): T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Reorder objectives. A move that would put an objective before one it
 * requires is refused, since requirements must point at earlier objectives.
 */
export function moveObjective(scenario: ScenarioDefinition, id: string, direction: -1 | 1): ScenarioDefinition {
  const objectives = move(scenario.objectives, id, direction);
  const position = new Map(objectives.map((objective, index) => [objective.id, index]));
  const broken = objectives.some((objective) => (objective.requires ?? []).some((required) => (position.get(required) ?? -1) > (position.get(objective.id) ?? -1)));
  return broken ? scenario : { ...scenario, objectives };
}

// --- Teaching steps ---------------------------------------------------------

export function addTeachingStep(scenario: ScenarioDefinition, objectiveId?: string): ScenarioDefinition {
  const step: ScenarioTeachingStep = objectiveId
    ? { id: uid('step'), title: 'New step', body: '', waitFor: 'objective-complete', objectiveId }
    : { id: uid('step'), title: 'New step', body: '', waitFor: 'manual' };
  return { ...scenario, teachingSteps: [...(scenario.teachingSteps ?? []), step] };
}

export function updateTeachingStep(scenario: ScenarioDefinition, id: string, patch: Partial<ScenarioTeachingStep>): ScenarioDefinition {
  return { ...scenario, teachingSteps: (scenario.teachingSteps ?? []).map((step) => (step.id === id ? { ...step, ...patch } : step)) };
}

export function removeTeachingStep(scenario: ScenarioDefinition, id: string): ScenarioDefinition {
  return { ...scenario, teachingSteps: (scenario.teachingSteps ?? []).filter((step) => step.id !== id) };
}

export function moveTeachingStep(scenario: ScenarioDefinition, id: string, direction: -1 | 1): ScenarioDefinition {
  return { ...scenario, teachingSteps: move(scenario.teachingSteps ?? [], id, direction) };
}

/** One step per objective, in order, each waiting for its objective. A quick start an author can then edit. */
export function stepsFromObjectives(scenario: ScenarioDefinition): ScenarioDefinition {
  return {
    ...scenario,
    teachingSteps: scenario.objectives.map((objective) => ({
      id: uid('step'),
      title: objective.text,
      body: objective.hint ?? '',
      waitFor: 'objective-complete' as const,
      objectiveId: objective.id,
      targetObjectId: objective.targetObjectId
    }))
  };
}

// --- Switching sheets -------------------------------------------------------

export function addSwitchingSheet(scenario: ScenarioDefinition, title = 'Switching programme'): ScenarioDefinition {
  const sheet: SwitchingSheet = { id: uid('sheet'), title, instructions: [], lineEndColours: {} };
  return { ...scenario, switchingSheets: [...(scenario.switchingSheets ?? []), sheet] };
}

const mapSheet = (scenario: ScenarioDefinition, sheetId: string, fn: (sheet: SwitchingSheet) => SwitchingSheet): ScenarioDefinition => ({
  ...scenario,
  switchingSheets: (scenario.switchingSheets ?? []).map((sheet) => (sheet.id === sheetId ? fn(sheet) : sheet))
});

export function updateSwitchingSheet(scenario: ScenarioDefinition, sheetId: string, patch: Partial<SwitchingSheet>): ScenarioDefinition {
  return mapSheet(scenario, sheetId, (sheet) => ({ ...sheet, ...patch }));
}

export function removeSwitchingSheet(scenario: ScenarioDefinition, sheetId: string): ScenarioDefinition {
  return {
    ...scenario,
    switchingSheets: (scenario.switchingSheets ?? []).filter((sheet) => sheet.id !== sheetId),
    objectives: scenario.objectives.filter((objective) => !(objective.type === 'complete-switching-sheet' && objective.sheetId === sheetId))
  };
}

/** A sensible verb for the device, so a new line is usually right first time. */
export function defaultVerbFor(symbol?: ElectricalSymbol): SwitchingInstruction['verb'] {
  if (symbol?.type === 'earth-switch') return symbol.operation?.switchState === 'closed' ? 'open-earth' : 'close-earth';
  if (symbol?.type === 'disconnector') return symbol.operation?.switchState === 'closed' ? 'open-lock-caution' : 'close';
  return symbol?.operation?.switchState === 'closed' ? 'open' : 'close';
}

export function addInstruction(scenario: ScenarioDefinition, sheetId: string, target?: ElectricalSymbol): ScenarioDefinition {
  const instruction: SwitchingInstruction = { id: uid('line'), verb: defaultVerbFor(target), targetObjectId: target?.id ?? '' };
  return mapSheet(scenario, sheetId, (sheet) => ({ ...sheet, instructions: [...sheet.instructions, instruction] }));
}

export function updateInstruction(scenario: ScenarioDefinition, sheetId: string, instructionId: string, patch: Partial<SwitchingInstruction>): ScenarioDefinition {
  return mapSheet(scenario, sheetId, (sheet) => ({
    ...sheet,
    instructions: sheet.instructions.map((line) => (line.id === instructionId ? { ...line, ...patch } : line))
  }));
}

export function removeInstruction(scenario: ScenarioDefinition, sheetId: string, instructionId: string): ScenarioDefinition {
  return mapSheet(scenario, sheetId, (sheet) => ({ ...sheet, instructions: sheet.instructions.filter((line) => line.id !== instructionId) }));
}

export function moveInstruction(scenario: ScenarioDefinition, sheetId: string, instructionId: string, direction: -1 | 1): ScenarioDefinition {
  return mapSheet(scenario, sheetId, (sheet) => ({ ...sheet, instructions: move(sheet.instructions, instructionId, direction) }));
}

export function setLineEndColours(scenario: ScenarioDefinition, sheetId: string, objectId: string, colours: LineEndColour[]): ScenarioDefinition {
  return mapSheet(scenario, sheetId, (sheet) => ({ ...sheet, lineEndColours: { ...(sheet.lineEndColours ?? {}), [objectId]: colours } }));
}

// --- Starting conditions and rules -----------------------------------------

/** Make the drawing's present switch and source states the scenario's starting point. */
export function captureStartingState(scenario: ScenarioDefinition, doc: DrawingDocument): ScenarioDefinition {
  const switches: Record<string, 'open' | 'closed'> = {};
  const sources: Record<string, boolean> = {};
  for (const symbol of doc.objects.symbols) {
    if (symbol.operation?.switchState) switches[symbol.id] = symbol.operation.switchState;
    if (symbol.type === 'source' || symbol.type === 'grid-connection') sources[symbol.id] = symbol.operation?.sourceOn !== false;
  }
  return { ...scenario, initialSwitchStates: switches, initialSourceStates: sources };
}

/**
 * Switch between an operating exercise (the drawing is fixed) and a build
 * exercise (the learner places and wires equipment around fixtures).
 */
export function setBuildExercise(scenario: ScenarioDefinition, build: boolean): ScenarioDefinition {
  const tags = (scenario.tags ?? []).filter((tag) => tag !== 'build');
  const restrictions = scenario.restrictions ?? {};
  return {
    ...scenario,
    tags: build ? [...tags, 'build'] : tags,
    restrictions: build
      ? { ...restrictions, disableDrawingTools: false, disablePlacement: false, disableDelete: false, disableInspectorEditing: true }
      : { ...restrictions, disableDrawingTools: true, disablePlacement: true, disableDelete: true, disableInspectorEditing: true, lockedObjectIds: undefined, allowedComponentTypes: undefined }
  };
}

export const isBuildExercise = (scenario: ScenarioDefinition) => Boolean(scenario.tags?.includes('build'));

export function toggleFixture(scenario: ScenarioDefinition, objectId: string): ScenarioDefinition {
  const current = scenario.restrictions?.lockedObjectIds ?? [];
  const lockedObjectIds = current.includes(objectId) ? current.filter((id) => id !== objectId) : [...current, objectId];
  return { ...scenario, restrictions: { ...(scenario.restrictions ?? {}), lockedObjectIds } };
}

export function toggleAllowedComponent(scenario: ScenarioDefinition, type: ElectricalSymbol['type']): ScenarioDefinition {
  const current = scenario.restrictions?.allowedComponentTypes ?? [];
  const allowedComponentTypes = current.includes(type) ? current.filter((item) => item !== type) : [...current, type];
  return { ...scenario, restrictions: { ...(scenario.restrictions ?? {}), allowedComponentTypes } };
}

/**
 * Package the scenario with the drawing as it stands. For a build exercise the
 * learner starts from the fixtures alone; anything else on the canvas is the
 * author's worked solution and is not shipped.
 */
export function packageDraft(scenario: ScenarioDefinition, doc: DrawingDocument): ScenarioPackage {
  const fixtures = new Set(scenario.restrictions?.lockedObjectIds ?? []);
  const startingDrawing = isBuildExercise(scenario)
    ? {
        ...doc,
        objects: {
          ...doc.objects,
          symbols: doc.objects.symbols.filter((symbol) => fixtures.has(symbol.id)),
          conductors: doc.objects.conductors.filter((path) => fixtures.has(path.id)),
          busbars: doc.objects.busbars.filter((path) => fixtures.has(path.id))
        }
      }
    : doc;
  return createScenarioFromDrawing({ ...startingDrawing, name: scenario.name }, { ...scenario, scoring: undefined, replayLog: [], wrongOperationCount: 0, switchingProgress: {} });
}
