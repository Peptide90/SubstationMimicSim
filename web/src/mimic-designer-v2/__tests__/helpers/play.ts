import { expect } from 'vitest';
import type { DrawingDocument, IsolationKind, LineEndColour, ScenarioDefinition } from '../../drawing/model';
import { migrateDrawingDocument } from '../../schema/documentSchema';
import { applyIsolation } from '../../safety/isolation';
import { evaluateScenario, recordScenarioOperation, startScenario, type ScenarioRunResult } from '../../scenarios/runner';
import { confirmReadback } from '../../scenarios/switchingSheet';
import type { ScenarioPackage } from '../../scenarios/packageScenario';
import { extractTopology } from '../../topology/extractTopology';
import { deriveOperationState, disconnectorSwitchesLoad, operateDevice } from '../../topology/operation';

/** Drives a scenario exactly as the designer UI does. */
export class Play {
  doc: DrawingDocument;
  scenario: ScenarioDefinition;
  result: ScenarioRunResult;

  constructor(pkg: ScenarioPackage) {
    this.result = startScenario(pkg.drawing, pkg.scenario);
    this.doc = this.result.doc;
    this.scenario = this.result.scenario;
  }

  /** The learner builds the solved drawing; fixtures are untouched. */
  build(solved: DrawingDocument) {
    this.doc = { ...this.doc, objects: solved.objects };
    return this.evaluate();
  }

  operate(id: string) {
    const topology = extractTopology(this.doc);
    const onLoad = disconnectorSwitchesLoad(this.doc, topology, id);
    const result = operateDevice(this.doc, topology, id);
    this.doc = migrateDrawingDocument(result.doc)!;
    const event = this.doc.operationEvents[this.doc.operationEvents.length - 1];
    this.scenario = recordScenarioOperation(this.scenario, event, onLoad || event.message.toLowerCase().includes('arced'));
    return this.evaluate();
  }

  operateAll(...ids: string[]) {
    ids.forEach((id) => this.operate(id));
    return this;
  }

  lock(id: string, kind: IsolationKind = 'point-of-isolation') {
    const applied = applyIsolation(this.doc, id, kind);
    expect(applied.ok, applied.reason).toBe(true);
    this.doc = applied.doc;
    return this.evaluate();
  }

  readback(sheetId: string, instructionId: string, colours?: LineEndColour[]) {
    const read = confirmReadback(this.scenario, this.doc, sheetId, instructionId, colours);
    expect(read.ok, read.reason).toBe(true);
    this.scenario = read.scenario;
    return this.evaluate();
  }

  evaluate() {
    this.result = evaluateScenario(this.doc, this.scenario);
    this.doc = this.result.doc;
    this.scenario = this.result.scenario;
    return this;
  }

  completed(id: string) {
    return Boolean(this.result.objectives.find((objective) => objective.id === id)?.completed);
  }

  live(id: string) {
    const topology = extractTopology(this.doc);
    const state = deriveOperationState(this.doc, topology);
    const viaBranch = topology.branches.some((branch) => branch.objectId === id && state.liveBranchIds.has(branch.id));
    const viaTerminal = topology.terminals.filter((t) => t.parentObjectId === id).flatMap((t) => t.connectedNodeIds).some((n) => state.liveNodeIds.has(n));
    return viaBranch || viaTerminal;
  }
}

