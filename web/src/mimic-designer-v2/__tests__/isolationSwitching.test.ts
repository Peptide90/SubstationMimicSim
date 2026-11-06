import { describe, expect, it } from 'vitest';
import type { DrawingDocument, ScenarioDefinition, SwitchingSheet } from '../drawing/model';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { templateLibrary } from '../templates';
import { extractTopology } from '../topology/extractTopology';
import { deriveOperationState, operateDevice } from '../topology/operation';
import { applyIsolation, canApplyIsolation, removeIsolation } from '../safety/isolation';
import { bayBuilt, includesComponents, physicallyConnected } from '../scenarios/buildObjectives';
import { activeSheet, checkSequence, confirmReadback, progressFor, sheetComplete } from '../scenarios/switchingSheet';
import { evaluateScenario } from '../scenarios/runner';
import { symbol } from '../templates/factory';

const radial = (): DrawingDocument =>
  migrateDrawingDocument(templateLibrary.find((t) => t.id === 'template-simple-radial-feeder')!.create())!;

const operate = (doc: DrawingDocument, id: string) => operateDevice(doc, extractTopology(doc), id);
const sym = (doc: DrawingDocument, id: string) => doc.objects.symbols.find((s) => s.id === id)!;
const isLive = (doc: DrawingDocument, id: string) => {
  const topology = extractTopology(doc);
  const state = deriveOperationState(doc, topology);
  return topology.terminals.filter((t) => t.parentObjectId === id).flatMap((t) => t.connectedNodeIds).some((n) => state.liveNodeIds.has(n));
};

describe('the radial feeder fixture', () => {
  it('starts with the line live', () => {
    expect(isLive(radial(), 'radial-load')).toBe(true);
  });

  it('has ES1 on the source side: closing it arcs, so a line isolation must earth through ES2', () => {
    let doc = radial();
    for (const id of ['radial-cb', 'radial-ds2', 'radial-ds1']) doc = operate(doc, id).doc;
    expect(isLive(doc, 'radial-load')).toBe(false);
    const result = operate(doc, 'radial-es1');
    expect(result.reason).toMatch(/arced/);
  });
});

describe('points of isolation and earthing', () => {
  it('refuses to lock a closed disconnector', () => {
    const check = canApplyIsolation(sym(radial(), 'radial-ds2'), 'point-of-isolation');
    expect(check.ok).toBe(false);
  });

  it('refuses a point of isolation on an earth switch, and a point of earthing on a disconnector', () => {
    const doc = radial();
    expect(canApplyIsolation(sym(doc, 'radial-es2'), 'point-of-isolation').ok).toBe(false);
    expect(canApplyIsolation(sym(doc, 'radial-ds2'), 'point-of-earthing').ok).toBe(false);
  });

  it('locks an open disconnector open until the lock is removed', () => {
    let doc = operate(operate(radial(), 'radial-cb').doc, 'radial-ds2').doc;
    const applied = applyIsolation(doc, 'radial-ds2', 'point-of-isolation');
    expect(applied.ok).toBe(true);
    doc = applied.doc;

    const blocked = operate(doc, 'radial-ds2');
    expect(blocked.refused).toBe(true);
    expect(sym(blocked.doc, 'radial-ds2').operation?.switchState).toBe('open');

    doc = removeIsolation(doc, 'radial-ds2').doc;
    expect(sym(operate(doc, 'radial-ds2').doc, 'radial-ds2').operation?.switchState).toBe('closed');
  });

  it('locks a closed earth closed', () => {
    let doc = radial();
    for (const id of ['radial-cb', 'radial-ds2', 'radial-es2']) doc = operate(doc, id).doc;
    doc = applyIsolation(doc, 'radial-es2', 'point-of-earthing').doc;
    const blocked = operate(doc, 'radial-es2');
    expect(blocked.refused).toBe(true);
    expect(sym(blocked.doc, 'radial-es2').operation?.switchState).toBe('closed');
  });

  it('survives document migration', () => {
    let doc = operate(operate(radial(), 'radial-cb').doc, 'radial-ds2').doc;
    doc = applyIsolation(doc, 'radial-ds2', 'point-of-isolation').doc;
    expect(sym(migrateDrawingDocument(doc)!, 'radial-ds2').operation?.isolation?.kind).toBe('point-of-isolation');
  });
});

describe('build objectives', () => {
  it('treats a correctly built bay as connected even with its breaker open', () => {
    const doc = operate(radial(), 'radial-cb').doc;
    expect(physicallyConnected(extractTopology(doc), 'radial-source', 'radial-load')).toBe(true);
  });

  it('notices a missing conductor', () => {
    const doc = radial();
    const broken = { ...doc, objects: { ...doc.objects, conductors: doc.objects.conductors.filter((c) => c.id !== 'radial-cb-ct') } };
    expect(physicallyConnected(extractTopology(broken), 'radial-source', 'radial-load')).toBe(false);
  });

  it('counts bay equipment within the island, so stray parts elsewhere cannot satisfy it', () => {
    const doc = radial();
    const topology = extractTopology(doc);
    expect(bayBuilt(doc, topology, 'radial-source', 'radial-load', { 'circuit-breaker': 1, disconnector: 2, 'earth-switch': 2 })).toBe(true);
    expect(bayBuilt(doc, topology, 'radial-source', 'radial-load', { 'circuit-breaker': 2 })).toBe(false);

    const withStray = { ...doc, objects: { ...doc.objects, symbols: [...doc.objects.symbols, symbol('stray-cb', 'circuit-breaker', 2000, 2000, 'STRAY')] } };
    expect(includesComponents(withStray, ['circuit-breaker'], 2)).toBe(true);
    expect(bayBuilt(withStray, extractTopology(withStray), 'radial-source', 'radial-load', { 'circuit-breaker': 2 })).toBe(false);
  });
});

const lineIsolationSheet: SwitchingSheet = {
  id: 'sheet-1',
  title: 'Isolate and earth F1 line',
  lineEndColours: { 'radial-load': ['red', 'yellow', 'blue'] },
  instructions: [
    { id: 'l1', verb: 'open', targetObjectId: 'radial-cb' },
    { id: 'l2', verb: 'open-lock-caution', targetObjectId: 'radial-ds2' },
    { id: 'l3', verb: 'open-lock-caution', targetObjectId: 'radial-ds1' },
    { id: 'l4', verb: 'close-earth-lock', targetObjectId: 'radial-es2' },
    { id: 'l5', verb: 'check-open-lock-caution', targetObjectId: 'radial-ds2', report: { kind: 'line-end-colours', targetObjectId: 'radial-load' } }
  ]
};

const scenarioWithSheet = (): ScenarioDefinition => ({
  id: 'sc', name: 'Isolation', initialSwitchStates: {}, initialSourceStates: {}, faults: [], relays: [],
  switchingSheets: [lineIsolationSheet],
  objectives: [
    { id: 'o1', text: 'Complete the sheet', type: 'complete-switching-sheet', sheetId: 'sheet-1' },
    { id: 'o2', text: 'Line isolated and earthed', type: 'isolate-target', targetObjectId: 'radial-load', targetState: 'isolated' },
    { id: 'o3', text: 'Two points of isolation', type: 'tag-isolation', componentTypes: ['disconnector'], count: 2 }
  ]
});

/** Carry out one line the way a learner would: operate, then lock where the verb asks. */
function carryOut(doc: DrawingDocument, id: string, lock?: 'point-of-isolation' | 'point-of-earthing') {
  let next = operate(doc, id).doc;
  if (lock) next = applyIsolation(next, id, lock).doc;
  return next;
}

describe('switching instruction sheets', () => {
  it('completes action lines in order as the equipment reaches them, then waits for the readback', () => {
    let doc = radial();
    let scenario = scenarioWithSheet();
    doc = carryOut(doc, 'radial-cb');
    doc = carryOut(doc, 'radial-ds2', 'point-of-isolation');
    doc = carryOut(doc, 'radial-ds1', 'point-of-isolation');
    doc = carryOut(doc, 'radial-es2', 'point-of-earthing');
    scenario = evaluateScenario(doc, scenario).scenario;
    expect(progressFor(scenario, 'sheet-1').map((p) => p.instructionId)).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(activeSheet(scenario)?.id).toBe('sheet-1');

    const read = confirmReadback(scenario, doc, 'sheet-1', 'l5', ['red', 'yellow', 'blue']);
    expect(read.ok).toBe(true);
    const result = evaluateScenario(doc, read.scenario);
    expect(sheetComplete(lineIsolationSheet, progressFor(result.scenario, 'sheet-1'))).toBe(true);
    expect(result.objectives.every((o) => o.completed)).toBe(true);
    expect(result.success).toBe(true);
  });

  it('flags an operation on anything but the next line as out of sequence', () => {
    const doc = radial();
    expect(checkSequence(scenarioWithSheet(), doc, 'radial-cb').ok).toBe(true);
    const check = checkSequence(scenarioWithSheet(), doc, 'radial-ds2');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.expected.id).toBe('l1');
  });

  it('does not let a later line complete before an earlier one', () => {
    let doc = radial();
    doc = carryOut(doc, 'radial-cb');
    doc = carryOut(doc, 'radial-ds1', 'point-of-isolation'); // line 3 done before line 2
    const scenario = evaluateScenario(doc, scenarioWithSheet()).scenario;
    expect(progressFor(scenario, 'sheet-1').map((p) => p.instructionId)).toEqual(['l1']);
  });

  it('refuses a false readback', () => {
    let doc = radial();
    let scenario = scenarioWithSheet();
    doc = carryOut(doc, 'radial-cb');
    doc = carryOut(doc, 'radial-ds2', 'point-of-isolation');
    doc = carryOut(doc, 'radial-ds1', 'point-of-isolation');
    doc = carryOut(doc, 'radial-es2', 'point-of-earthing');
    scenario = evaluateScenario(doc, scenario).scenario;
    // Remove the lock behind control's back, then report it as locked.
    const unlocked = removeIsolation(doc, 'radial-ds2').doc;
    const read = confirmReadback(scenario, unlocked, 'sheet-1', 'l5', ['red', 'yellow', 'blue']);
    expect(read.ok).toBe(false);
    expect(read.reason).toMatch(/False readback/);
  });

  it('refuses the wrong line-end colours', () => {
    let doc = radial();
    let scenario = scenarioWithSheet();
    for (const [id, lock] of [['radial-cb'], ['radial-ds2', 'point-of-isolation'], ['radial-ds1', 'point-of-isolation'], ['radial-es2', 'point-of-earthing']] as const) {
      doc = carryOut(doc, id, lock);
    }
    scenario = evaluateScenario(doc, scenario).scenario;
    expect(confirmReadback(scenario, doc, 'sheet-1', 'l5', ['blue', 'yellow', 'red']).ok).toBe(false);
    expect(confirmReadback(scenario, doc, 'sheet-1', 'l5', ['red', 'yellow']).ok).toBe(false);
  });

  it('keeps switching progress through document migration', () => {
    let doc = carryOut(radial(), 'radial-cb');
    const result = evaluateScenario(doc, scenarioWithSheet());
    doc = result.doc;
    expect(progressFor(doc.scenarios[0], 'sheet-1')).toHaveLength(1);
  });
});
