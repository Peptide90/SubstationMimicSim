import { describe, expect, it } from 'vitest';
import type { DrawingDocument, ScenarioDefinition } from '../drawing/model';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { templateLibrary } from '../templates';
import {
  addInstruction,
  addObjective,
  addSwitchingSheet,
  addTeachingStep,
  captureStartingState,
  exportLessonPack,
  importLessonPack,
  moveObjective,
  newScenarioDraft,
  packageDraft,
  removeObjective,
  setBuildExercise,
  setLineEndColours,
  setTierExplanation,
  stepsFromObjectives,
  toggleAllowedComponent,
  toggleFixture,
  updateInstruction,
  updateObjective,
  updateScenario,
  useScenarioAuthoring,
  validateScenario
} from '../authoring';
import { portedExercises } from '../scenarios/portedChallenges';
import { Play } from './helpers/play';

const radial = (): DrawingDocument => migrateDrawingDocument(templateLibrary.find((t) => t.id === 'template-simple-radial-feeder')!.create())!;
const symbolOf = (doc: DrawingDocument, id: string) => doc.objects.symbols.find((s) => s.id === id)!;
const errors = (scenario: ScenarioDefinition, doc: DrawingDocument) => validateScenario(scenario, doc).filter((issue) => issue.severity === 'error');

/** An author builds the isolate-then-earth lesson using only the editor's operations. */
function authorIsolationLesson(doc: DrawingDocument): ScenarioDefinition {
  let s = newScenarioDraft(doc, 'My isolation lesson');
  s = updateScenario(s, { minTier: 'Apprentice', maxTier: 'Engineer', description: 'Isolate and earth the F1 line.' });
  s = setTierExplanation(s, 'Apprentice', 'Isolate, then earth.');
  s = setTierExplanation(s, 'Engineer', 'Secure the isolation boundary before earthing.');
  s = addSwitchingSheet(s, 'F1 isolation');
  const sheetId = s.switchingSheets![0].id;
  for (const id of ['radial-cb', 'radial-ds2', 'radial-ds1', 'radial-es2']) s = addInstruction(s, sheetId, symbolOf(doc, id));
  const lines = s.switchingSheets![0].instructions;
  s = updateInstruction(s, sheetId, lines[3].id, { verb: 'close-earth-lock' });
  s = addInstruction(s, sheetId, symbolOf(doc, 'radial-ds2'));
  const readback = s.switchingSheets![0].instructions[4];
  s = updateInstruction(s, sheetId, readback.id, { verb: 'check-open-lock-caution', report: { kind: 'line-end-colours', targetObjectId: 'radial-load' } });
  s = setLineEndColours(s, sheetId, 'radial-load', ['blue', 'blue', 'red']);
  s = addObjective(s, 'tag-isolation');
  s = updateObjective(s, s.objectives[0].id, { count: 2 });
  s = addObjective(s, 'isolate-target', 'radial-load');
  s = addObjective(s, 'complete-switching-sheet');
  s = updateObjective(s, s.objectives[2].id, { sheetId });
  return stepsFromObjectives(s);
}

describe('authoring a lesson in the app', () => {
  it('gives sensible default verbs from each device, so lines are right first time', () => {
    const lines = authorIsolationLesson(radial()).switchingSheets![0].instructions.map((line) => line.verb);
    expect(lines.slice(0, 3)).toEqual(['open', 'open-lock-caution', 'open-lock-caution']);
  });

  it('produces a lesson that validates cleanly and can be played to success', () => {
    const doc = radial();
    const scenario = authorIsolationLesson(doc);
    expect(errors(scenario, doc)).toEqual([]);

    const game = new Play(packageDraft(scenario, doc));
    game.operate('radial-cb');
    game.operate('radial-ds2').lock('radial-ds2');
    game.operate('radial-ds1').lock('radial-ds1');
    game.operate('radial-es2').lock('radial-es2', 'point-of-earthing');
    const sheetId = scenario.switchingSheets![0].id;
    game.readback(sheetId, scenario.switchingSheets![0].instructions[4].id, ['blue', 'blue', 'red']);
    expect(game.result.success).toBe(true);
    expect(game.scenario.wrongOperationCount).toBe(0);
  });

  it('starts the lesson from the switch states the author captured', () => {
    const doc = radial();
    const opened = { ...doc, objects: { ...doc.objects, symbols: doc.objects.symbols.map((s) => (s.id === 'radial-cb' ? { ...s, operation: { ...s.operation, switchState: 'open' as const } } : s)) } };
    const scenario = captureStartingState(newScenarioDraft(doc), opened);
    expect(scenario.initialSwitchStates['radial-cb']).toBe('open');
  });

  it('authors a build exercise that ships only its fixtures and can be built to success', () => {
    const exercise = portedExercises.find((item) => item.legacyId === 'tutorial-1')!;
    const solved = exercise.solvedDrawing!();
    let s = setBuildExercise(newScenarioDraft(solved, 'My build'), true);
    s = toggleFixture(toggleFixture(s, 'cl-source'), 'cl-load');
    s = toggleAllowedComponent(toggleAllowedComponent(s, 'disconnector'), 'circuit-breaker');
    s = addObjective(s, 'connect-between', 'cl-source');
    s = updateObjective(s, s.objectives[0].id, { secondaryObjectId: 'cl-load' });
    expect(errors(s, solved)).toEqual([]);

    const pkg = packageDraft(s, solved);
    expect(pkg.drawing.objects.symbols.map((symbol) => symbol.id).sort()).toEqual(['cl-load', 'cl-source']);
    const game = new Play(pkg).build(solved);
    expect(game.result.success).toBe(true);
  });
});

describe('keeping references consistent', () => {
  it('removing an objective clears requirements and steps that pointed at it', () => {
    let s = addObjective(addObjective(newScenarioDraft(radial())), 'operate-switchgear', 'radial-cb');
    const [first, second] = s.objectives;
    s = updateObjective(s, second.id, { requires: [first.id] });
    s = addTeachingStep(s, first.id);
    s = removeObjective(s, first.id);
    expect(s.objectives[0].requires).toEqual([]);
    expect(s.teachingSteps![0].objectiveId).toBeUndefined();
  });

  it('refuses to move an objective above one it requires', () => {
    let s = addObjective(addObjective(newScenarioDraft(radial())), 'operate-switchgear', 'radial-cb');
    const [first, second] = s.objectives;
    s = updateObjective(s, second.id, { requires: [first.id] });
    expect(moveObjective(s, second.id, -1)).toBe(s);
  });

  it('resets type-specific fields when an objective changes type, keeping the text', () => {
    let s = addObjective(newScenarioDraft(radial()), 'tag-isolation');
    const id = s.objectives[0].id;
    s = updateObjective(s, id, { text: 'Lock both' });
    s = updateObjective(s, id, { type: 'restore-supply-to-load' });
    expect(s.objectives[0]).toMatchObject({ text: 'Lock both', type: 'restore-supply-to-load', targetState: 'live' });
    expect(s.objectives[0].componentTypes).toBeUndefined();
  });
});

describe('validation catches authoring mistakes', () => {
  const doc = radial();
  const messages = (scenario: ScenarioDefinition) => validateScenario(scenario, doc).map((issue) => `${issue.severity}: ${issue.message}`);

  it('a scenario with no objectives', () => {
    expect(messages(newScenarioDraft(doc))).toContainEqual(expect.stringMatching(/^error: Add at least one objective/));
  });

  it('an objective with no target, or one that is not on the drawing', () => {
    let s = addObjective(newScenarioDraft(doc), 'restore-supply-to-load');
    expect(messages(s)).toContainEqual(expect.stringMatching(/needs a target/));
    s = updateObjective(s, s.objectives[0].id, { targetObjectId: 'gone' });
    expect(messages(s)).toContainEqual(expect.stringMatching(/not on the drawing/));
  });

  it('switching something that cannot be switched', () => {
    const s = addObjective(newScenarioDraft(doc), 'operate-switchgear', 'radial-load');
    expect(messages(s)).toContainEqual(expect.stringMatching(/cannot be switched/));
  });

  it('a requirement that comes after the objective', () => {
    let s = addObjective(addObjective(newScenarioDraft(doc), 'operate-switchgear', 'radial-cb'), 'operate-switchgear', 'radial-ds1');
    s = updateObjective(s, s.objectives[0].id, { requires: [s.objectives[1].id] });
    expect(messages(s)).toContainEqual(expect.stringMatching(/comes after it/));
  });

  it('a teaching step waiting for nothing, or for a missing objective', () => {
    let s = addObjective(newScenarioDraft(doc), 'operate-switchgear', 'radial-cb');
    s = addTeachingStep(addTeachingStep(s));
    expect(messages(s)).toContainEqual(expect.stringMatching(/^warning: Step 1 .* waits for nothing/));
    s = addTeachingStep(s, 'missing');
    expect(messages(s)).toContainEqual(expect.stringMatching(/waits for an objective that does not exist/));
  });

  it('a sheet line whose verb does not fit the device, and a readback with no colours painted', () => {
    let s = addSwitchingSheet(addObjective(newScenarioDraft(doc), 'operate-switchgear', 'radial-cb'));
    const sheetId = s.switchingSheets![0].id;
    s = addInstruction(s, sheetId, symbolOf(doc, 'radial-ds1'));
    s = updateInstruction(s, sheetId, s.switchingSheets![0].instructions[0].id, { verb: 'close-earth', report: { kind: 'line-end-colours', targetObjectId: 'radial-load' } });
    const found = messages(s);
    expect(found).toContainEqual(expect.stringMatching(/cannot be done to F1 DS1/));
    expect(found).toContainEqual(expect.stringMatching(/none are painted there/));
    expect(found).toContainEqual(expect.stringMatching(/^warning: .*is not graded/));
  });

  it('a tier range no learner can see, and gaps in tier explanations', () => {
    let s = addObjective(newScenarioDraft(doc), 'operate-switchgear', 'radial-cb');
    s = updateScenario(s, { minTier: 'Engineer', maxTier: 'Student' });
    expect(messages(s)).toContainEqual(expect.stringMatching(/no learner can see it/));
    s = setTierExplanation(updateScenario(s, { minTier: 'Student', maxTier: 'Engineer' }), 'Student', 'Simple words.');
    expect(messages(s)).toContainEqual(expect.stringMatching(/No explanation written for Apprentice, Engineer/));
  });
});

describe('lesson packs', () => {
  it('round-trip a lesson through a file', () => {
    const doc = radial();
    const pkg = packageDraft(authorIsolationLesson(doc), doc);
    const imported = importLessonPack(exportLessonPack(pkg));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.pkg.scenario.switchingSheets![0].instructions).toHaveLength(5);
    expect(imported.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('refuse files that are not lesson packs, or come from a newer app', () => {
    expect(importLessonPack('not json').ok).toBe(false);
    expect(importLessonPack('{"format":"something-else"}').ok).toBe(false);
    expect(importLessonPack(JSON.stringify({ format: 'substation-sim-lesson-pack', version: 99, package: {} })).ok).toBe(false);
  });
});

describe('authoring store', () => {
  it('applies changes and undoes them', () => {
    const store = useScenarioAuthoring.getState();
    store.open(newScenarioDraft(radial()));
    useScenarioAuthoring.getState().apply((s) => addObjective(s, 'operate-switchgear', 'radial-cb'));
    expect(useScenarioAuthoring.getState().draft!.objectives).toHaveLength(1);
    expect(useScenarioAuthoring.getState().dirty).toBe(true);
    useScenarioAuthoring.getState().undo();
    expect(useScenarioAuthoring.getState().draft!.objectives).toHaveLength(0);
    useScenarioAuthoring.getState().close();
    expect(useScenarioAuthoring.getState().draft).toBeNull();
  });
});
