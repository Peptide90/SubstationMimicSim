import type { DrawingDocument, ElectricalSymbol, OperationEvent, ScenarioDefinition, ScenarioEvent, ScenarioObjective, ScenarioReplayStep } from '../drawing/model';
import { addFault } from '../faults/faults';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { deriveOperationState } from '../topology/operation';
import { extractTopology } from '../topology/extractTopology';
import { taggedSymbols } from '../safety/isolation';
import { bayBuilt, includesComponents, physicallyConnected } from './buildObjectives';
import { advanceSwitchingSheets, progressFor, sheetComplete } from './switchingSheet';

export interface ScenarioRunResult {
  doc: DrawingDocument;
  scenario: ScenarioDefinition;
  objectives: ScenarioObjective[];
  success: boolean;
  failed: boolean;
  messages: string[];
  activeHint?: string;
}

export function startScenario(doc: DrawingDocument, scenario: ScenarioDefinition, now = Date.now()): ScenarioRunResult {
  const resetDoc = resetScenario(doc, scenario, now);
  const started: ScenarioDefinition = {
    ...scenario,
    startedAt: new Date(now).toISOString(),
    elapsedMs: 0,
    replayLog: [{ id: `replay-${now}`, atMs: 0, action: 'reset' as const, message: 'Scenario started' }],
    events: scenario.events?.map((event) => ({ ...event, fired: false })) ?? [],
    objectives: scenario.objectives.map((objective) => ({ ...objective, completed: false, failed: false })),
    wrongOperationCount: 0,
    currentHintIndex: 0
  };
  return evaluateScenario({ ...resetDoc, activeScenarioId: started.id, scenarios: [started] }, started);
}

export function resetScenario(doc: DrawingDocument, scenario: ScenarioDefinition, now = Date.now()): DrawingDocument {
  const activeFaultTargetIds = new Set((scenario.faults ?? []).filter((fault) => fault.active && fault.targetObjectId).map((fault) => fault.targetObjectId!));
  return migrateDrawingDocument({
    ...doc,
    activeScenarioId: scenario.id,
    activeView: scenario.activeView === 'thermal' || scenario.activeView === 'topology' ? doc.activeView : scenario.activeView ?? doc.activeView,
    faults: scenario.faults,
    relays: scenario.relays,
    protection: scenario.protection ?? doc.protection,
    objects: {
      ...doc.objects,
      symbols: doc.objects.symbols.map((symbol) => ({
        ...symbol,
        simulation: {
          ...symbol.simulation,
          faulted: activeFaultTargetIds.has(symbol.id),
          identified: false,
          arced: false
        },
        powerFlow: scenario.powerFlows?.[symbol.id] ?? symbol.powerFlow,
        operation: {
          ...symbol.operation,
          switchState: scenario.initialSwitchStates[symbol.id] ?? symbol.operation?.switchState,
          sourceOn: scenario.initialSourceStates[symbol.id] ?? symbol.operation?.sourceOn,
          tripped: false,
          lockout: false,
          protectionState: 'idle'
        }
      })),
      conductors: doc.objects.conductors.map((path) => ({ ...path, powerFlow: scenario.powerFlows?.[path.id] ?? path.powerFlow })),
      busbars: doc.objects.busbars.map((path) => ({ ...path, powerFlow: scenario.powerFlows?.[path.id] ?? path.powerFlow }))
    },
    operationEvents: [
      ...doc.operationEvents,
      { id: `event-${now}`, timestamp: new Date(now).toISOString(), message: `Scenario reset: ${scenario.name}` }
    ]
  })!;
}

export function tickScenario(doc: DrawingDocument, scenario: ScenarioDefinition, elapsedMs: number, now = Date.now()): ScenarioRunResult {
  let nextDoc = doc;
  const messages: string[] = [];
  const events = (scenario.events ?? []).map((event) => {
    if (event.fired || event.atMs > elapsedMs) return event;
    const applied = applyScenarioEvent(nextDoc, event, now);
    nextDoc = applied.doc;
    messages.push(applied.message);
    return { ...event, fired: true };
  });
  const nextScenario = appendReplay({ ...scenario, elapsedMs, events }, 'event', messages.join(' / ') || `Tick ${elapsedMs}ms`, elapsedMs);
  return evaluateScenario(nextDoc, nextScenario, messages);
}

export function evaluateScenario(doc: DrawingDocument, inputScenario: ScenarioDefinition, priorMessages: string[] = []): ScenarioRunResult {
  const topology = extractTopology(doc);
  const operation = deriveOperationState(doc, topology);
  const scenario = advanceSwitchingSheets(inputScenario, doc);
  const objectives = applyLatchesAndRequirements(
    scenario.objectives,
    scenario.objectives.map((objective) => evaluateObjective(objective, doc, operation, topology, scenario))
  );
  const liveEarthConflict = operation.faultNodeIds.size > 0 || operation.faultBranchIds.size > 0;
  const damaged = doc.objects.symbols.some((symbol) => symbol.simulation?.damaged);
  const wrongOperations = scenario.wrongOperationCount ?? 0;
  const failureRules = scenario.failureRules ?? {};
  const successRules = scenario.successRules ?? {};
  const failed =
    Boolean(failureRules.requireNoLiveEarthConflict && liveEarthConflict) ||
    Boolean(failureRules.requireVoltageSegregation && (operation.voltageConflictNodeIds.size > 0 || operation.voltageConflictBranchIds.size > 0)) ||
    Boolean(failureRules.requireNoDamagedEquipment && damaged) ||
    (failureRules.maxWrongOperations !== undefined && wrongOperations > failureRules.maxWrongOperations) ||
    Boolean(failureRules.timeLimitMs && (scenario.elapsedMs ?? 0) > failureRules.timeLimitMs);
  const success =
    !failed &&
    objectives.length > 0 &&
    objectives.every((objective) => objective.completed) &&
    (!successRules.requireNoLiveEarthConflict || !liveEarthConflict) &&
    (!successRules.requireVoltageSegregation || (operation.voltageConflictNodeIds.size === 0 && operation.voltageConflictBranchIds.size === 0));
  const stepped = progressTeachingSteps({ ...scenario, objectives }, doc, operation, topology);
  const triggered = fireCurrentStepEvent(doc, stepped);
  doc = triggered.doc;
  const progressedScenario = triggered.scenario;
  if (triggered.message) priorMessages = [...priorMessages, triggered.message];
  const scoring = scoreScenario(progressedScenario, success, failed);
  const activeHint = progressedScenario.teachingSteps?.[progressedScenario.currentStepIndex ?? 0]?.body ?? objectives.find((objective) => !objective.completed && !objective.failed)?.hint;
  return {
    doc: migrateDrawingDocument({ ...doc, scenarios: [{ ...progressedScenario, scoring }], activeScenarioId: scenario.id })!,
    scenario: { ...progressedScenario, scoring },
    objectives,
    success,
    failed,
    activeHint,
    messages: [...priorMessages, success ? 'Scenario objectives complete.' : failed ? 'Scenario failed.' : 'Scenario running.']
  };
}

export function recordScenarioOperation(scenario: ScenarioDefinition, event: OperationEvent, wrong = false): ScenarioDefinition {
  return appendReplay({
    ...scenario,
    wrongOperationCount: (scenario.wrongOperationCount ?? 0) + (wrong ? 1 : 0)
  }, 'operate', event.message, scenario.elapsedMs ?? 0, event.targetObjectId);
}

export function nextScenarioHint(scenario: ScenarioDefinition): { scenario: ScenarioDefinition; hint?: string } {
  const hints = scenario.objectives.map((objective) => objective.hint).filter(Boolean) as string[];
  if (!hints.length) return { scenario };
  const index = scenario.currentHintIndex ?? 0;
  const hint = hints[index % hints.length];
  return { scenario: appendReplay({ ...scenario, currentHintIndex: index + 1 }, 'hint', hint, scenario.elapsedMs ?? 0), hint };
}

function applyScenarioEvent(doc: DrawingDocument, event: ScenarioEvent, now: number): { doc: DrawingDocument; message: string } {
  if ((event.type === 'scheduled-fault' || event.type === 'transient-fault') && event.fault) {
    const faulted = addFault(doc, { ...event.fault, active: true, persistent: event.type !== 'transient-fault' });
    return {
      doc: event.fault.targetObjectId
        ? updateSymbol(faulted, event.fault.targetObjectId, (symbol) => ({ ...symbol, simulation: { ...symbol.simulation, faulted: true } }), now, event.message ?? `Fault applied: ${event.fault.type}`)
        : faulted,
      message: event.message ?? `Fault applied: ${event.fault.type}`
    };
  }
  if (event.type === 'source-trip' && event.targetObjectId) {
    return {
      doc: updateSymbol(doc, event.targetObjectId, (symbol) => ({ ...symbol, operation: { ...symbol.operation, sourceOn: false } }), now, event.message ?? 'Source tripped'),
      message: event.message ?? 'Source tripped'
    };
  }
  if (event.type === 'breaker-fail' && event.targetObjectId) {
    return {
      doc: updateSymbol(doc, event.targetObjectId, (symbol) => ({ ...symbol, simulation: { ...symbol.simulation, damaged: true } }), now, event.message ?? 'Breaker fail armed'),
      message: event.message ?? 'Breaker fail armed'
    };
  }
  if (event.type === 'load-increase' && event.targetObjectId) {
    return {
      doc: updateSymbol(doc, event.targetObjectId, (symbol) => ({ ...symbol, powerFlow: { ...symbol.powerFlow, mw: event.loadMw ?? symbol.powerFlow?.mw ?? 10 } }), now, event.message ?? 'Load increased'),
      message: event.message ?? 'Load increased'
    };
  }
  if (event.type === 'relay-pickup-trip') {
    return {
      doc: addLog({ ...doc, relays: doc.relays.map((relay) => ({ ...relay, state: 'tripped' as const, trippedAt: new Date(now).toISOString() })) }, event.message ?? 'Relay pickup/trip event', now),
      message: event.message ?? 'Relay pickup/trip event'
    };
  }
  return { doc: addLog(doc, event.message ?? event.hint ?? event.type, now), message: event.message ?? event.hint ?? event.type };
}

function updateSymbol(doc: DrawingDocument, symbolId: string, patcher: (symbol: DrawingDocument['objects']['symbols'][number]) => DrawingDocument['objects']['symbols'][number], now: number, message: string) {
  return addLog({ ...doc, objects: { ...doc.objects, symbols: doc.objects.symbols.map((symbol) => symbol.id === symbolId ? patcher(symbol) : symbol) } }, message, now);
}

function addLog(doc: DrawingDocument, message: string, now: number) {
  return { ...doc, operationEvents: [...doc.operationEvents, { id: `event-${now}-${Math.floor(Math.random() * 9999)}`, timestamp: new Date(now).toISOString(), message }] };
}

function isLive(targetId: string, operation: ReturnType<typeof deriveOperationState>, topology: ReturnType<typeof extractTopology>): boolean {
  const branchLive = topology.branches.some((branch) => branch.objectId === targetId && operation.liveBranchIds.has(branch.id));
  const terminalLive = topology.terminals
    .filter((terminal) => terminal.parentObjectId === targetId)
    .flatMap((terminal) => terminal.connectedNodeIds)
    .some((nodeId) => operation.liveNodeIds.has(nodeId));
  return branchLive || terminalLive;
}

function isEarthed(targetId: string, operation: ReturnType<typeof deriveOperationState>, topology: ReturnType<typeof extractTopology>): boolean {
  const branchEarthed = topology.branches.some((branch) => branch.objectId === targetId && operation.earthedBranchIds.has(branch.id));
  const terminalEarthed = topology.terminals
    .filter((terminal) => terminal.parentObjectId === targetId)
    .flatMap((terminal) => terminal.connectedNodeIds)
    .some((nodeId) => operation.earthedNodeIds.has(nodeId));
  return branchEarthed || terminalEarthed;
}

function evaluateObjective(objective: ScenarioObjective, doc: DrawingDocument, operation: ReturnType<typeof deriveOperationState>, topology: ReturnType<typeof extractTopology>, scenario: ScenarioDefinition): ScenarioObjective {
  // Objectives that grade the whole network, the drawing or a sheet, rather than one target.
  if (objective.type === 'include-component') {
    // Fixtures the exercise supplied do not count towards what the learner built.
    const fixtures = new Set(scenario.restrictions?.lockedObjectIds ?? []);
    const built = { ...doc, objects: { ...doc.objects, symbols: doc.objects.symbols.filter((symbol) => !fixtures.has(symbol.id)) } };
    const byType = !objective.componentTypes?.length || includesComponents(built, objective.componentTypes, objective.count ?? 1);
    const byCount = Object.entries(objective.requiredCounts ?? {}).every(([type, required]) => includesComponents(built, [type as ElectricalSymbol['type']], required ?? 0));
    return { ...objective, completed: byType && byCount && Boolean(objective.componentTypes?.length || objective.requiredCounts) };
  }
  if (objective.type === 'complete-switching-sheet') {
    const sheet = (scenario.switchingSheets ?? []).find((item) => item.id === objective.sheetId);
    return { ...objective, completed: Boolean(sheet && sheetComplete(sheet, progressFor(scenario, sheet.id))) };
  }
  if (objective.type === 'tag-isolation') {
    const kind = objective.isolationKind ?? 'point-of-isolation';
    if (objective.targetObjectId) {
      const symbol = doc.objects.symbols.find((item) => item.id === objective.targetObjectId);
      return { ...objective, completed: symbol?.operation?.isolation?.kind === kind };
    }
    const tagged = taggedSymbols(doc, kind).filter((symbol) => !objective.componentTypes?.length || objective.componentTypes.includes(symbol.type));
    return { ...objective, completed: tagged.length >= (objective.count ?? 1) };
  }

  if (objective.type === 'maintain-no-live-earth-conflict') {
    return { ...objective, completed: operation.faultNodeIds.size === 0 && operation.faultBranchIds.size === 0, failed: operation.faultNodeIds.size > 0 || operation.faultBranchIds.size > 0 };
  }
  if (objective.type === 'avoid-disconnector-under-load') {
    return { ...objective, completed: (scenario.wrongOperationCount ?? 0) === 0, failed: (scenario.wrongOperationCount ?? 0) > 0 };
  }
  if (objective.type === 'explain-protection-trip') return { ...objective, completed: doc.relays.some((relay) => relay.state === 'tripped') };
  const targetId = objective.targetObjectId;
  if (!targetId) return objective;
  if (objective.type === 'connect-between') {
    return { ...objective, completed: Boolean(objective.secondaryObjectId && physicallyConnected(topology, targetId, objective.secondaryObjectId)) };
  }
  if (objective.type === 'build-bay') {
    return { ...objective, completed: Boolean(objective.secondaryObjectId && bayBuilt(doc, topology, targetId, objective.secondaryObjectId, objective.requiredCounts)) };
  }
  if (objective.type === 'isolate-target') {
    const exists = [...doc.objects.symbols, ...doc.objects.conductors, ...doc.objects.busbars].some((item) => item.id === targetId);
    const dead = exists && !isLive(targetId, operation, topology);
    const earthedIfRequired = objective.targetState !== 'isolated' || isEarthed(targetId, operation, topology);
    return { ...objective, completed: dead && earthedIfRequired };
  }
  if (objective.type === 'operate-switchgear') {
    const symbol = doc.objects.symbols.find((item) => item.id === targetId);
    return { ...objective, completed: Boolean(symbol && symbol.operation?.switchState === objective.targetState) };
  }
  if (objective.type === 'energise-target-busbar' || objective.type === 'restore-supply-to-load') {
    return { ...objective, completed: isLive(targetId, operation, topology) };
  }
  if (objective.type === 'isolate-faulted-section' || objective.type === 'clear-fault-using-breaker') {
    return { ...objective, completed: !doc.faults.some((fault) => fault.active && fault.targetObjectId === targetId) };
  }
  if (objective.type === 'identify-faulted-component') {
    const symbol = doc.objects.symbols.find((item) => item.id === targetId);
    return { ...objective, completed: Boolean(symbol?.simulation?.identified && symbol.simulation.faulted) };
  }
  if (objective.type === 'identify-hot-joint') {
    const targetIds = [targetId, ...(objective.targetTopologyBranchId ? [objective.targetTopologyBranchId] : [])].filter(Boolean) as string[];
    const hot = doc.hotJoints.some((joint) => targetIds.includes(joint.targetObjectId ?? '') && joint.active);
    const marked = doc.operationEvents.some((event) => targetIds.includes(event.targetObjectId ?? '') && event.message.toLowerCase().includes('marked') && event.message.toLowerCase().includes('fault'));
    return { ...objective, completed: hot && marked };
  }
  return objective;
}

/** Latched objectives stay complete; objectives with unmet requirements cannot complete. */
function applyLatchesAndRequirements(previous: ScenarioObjective[], evaluated: ScenarioObjective[]): ScenarioObjective[] {
  const done = new Map<string, boolean>();
  return evaluated.map((objective) => {
    const before = previous.find((item) => item.id === objective.id);
    const blocked = (objective.requires ?? []).some((id) => !done.get(id));
    const completed = blocked ? false : Boolean(objective.completed || (objective.latch && before?.completed));
    done.set(objective.id, completed);
    return { ...objective, completed };
  });
}

/** Advance through every teaching step already satisfied, not just one per evaluation. */
function progressTeachingSteps(scenario: ScenarioDefinition, doc: DrawingDocument, operation: ReturnType<typeof deriveOperationState>, topology: ReturnType<typeof extractTopology>): ScenarioDefinition {
  let current = scenario;
  for (let guard = 0; guard < (scenario.teachingSteps?.length ?? 0); guard += 1) {
    const next = progressTeachingStep(current, doc, operation, topology);
    if (next.currentStepIndex === current.currentStepIndex) break;
    current = next;
  }
  return current;
}

/** A teaching step can fire a scenario event when it becomes current — a fault that appears as the lesson reaches it. */
function fireCurrentStepEvent(doc: DrawingDocument, scenario: ScenarioDefinition, now = Date.now()): { doc: DrawingDocument; scenario: ScenarioDefinition; message?: string } {
  const step = scenario.teachingSteps?.[scenario.currentStepIndex ?? 0];
  const event = step?.eventIdToTrigger ? scenario.events?.find((item) => item.id === step.eventIdToTrigger) : undefined;
  if (!event || event.fired) return { doc, scenario };
  const applied = applyScenarioEvent(doc, event, now);
  return {
    doc: applied.doc,
    scenario: { ...scenario, events: (scenario.events ?? []).map((item) => item.id === event.id ? { ...item, fired: true } : item) },
    message: applied.message
  };
}

function progressTeachingStep(scenario: ScenarioDefinition, doc: DrawingDocument, operation: ReturnType<typeof deriveOperationState>, topology: ReturnType<typeof extractTopology>): ScenarioDefinition {
  const steps = scenario.teachingSteps ?? [];
  const index = scenario.currentStepIndex ?? 0;
  const step = steps[index];
  if (!step || step.waitFor === 'manual') return scenario;
  const targetId = step.expectedObjectId ?? step.targetObjectId;
  const satisfied = (() => {
    if (!step.waitFor) return false;
    if (step.waitFor === 'operation') return Boolean(targetId && (scenario.replayLog ?? []).some((entry) => entry.action === 'operate' && entry.targetObjectId === targetId));
    if (step.waitFor === 'correct-state') {
      const symbol = doc.objects.symbols.find((item) => item.id === targetId);
      return Boolean(symbol && step.expectedState && symbol.operation?.switchState === step.expectedState);
    }
    if (step.waitFor === 'objective-complete') return Boolean(scenario.objectives.find((objective) => objective.id === step.objectiveId)?.completed);
    if (step.waitFor === 'fault-clearance') return !doc.faults.some((fault) => fault.active && (!targetId || fault.targetObjectId === targetId));
    if (step.waitFor === 'target-energised') {
      const branchLive = topology.branches.some((branch) => branch.objectId === targetId && operation.liveBranchIds.has(branch.id));
      const terminalLive = topology.terminals
        .filter((terminal) => terminal.parentObjectId === targetId)
        .flatMap((terminal) => terminal.connectedNodeIds)
        .some((nodeId) => operation.liveNodeIds.has(nodeId));
      return branchLive || terminalLive;
    }
    return false;
  })();
  return satisfied ? { ...scenario, currentStepIndex: Math.min(index + 1, steps.length - 1) } : scenario;
}

function scoreScenario(scenario: ScenarioDefinition, success: boolean, failed: boolean) {
  const operationCount = (scenario.replayLog ?? []).filter((step) => step.action === 'operate').length;
  const penalties = (scenario.wrongOperationCount ?? 0) + (failed ? 2 : 0);
  const noIncorrectOperationBonus = penalties === 0 ? 50 : 0;
  const noTripBonus = failed ? 0 : 25;
  const safetyBonus = penalties === 0 && success ? 100 : Math.max(0, 40 - penalties * 10);
  const speedBonus = scenario.elapsedMs ? Math.max(0, 60 - Math.floor(scenario.elapsedMs / 1000)) : 0;
  const score = Math.max(0, (success ? 500 : 0) + safetyBonus + speedBonus + noTripBonus + noIncorrectOperationBonus - penalties * 50);
  const stars = success ? penalties === 0 ? 3 : penalties <= 2 ? 2 : 1 : 0;
  return { ...(scenario.scoring ?? {}), stars, score, operationCount, penalties, speedBonus, safetyBonus, noTripBonus, noIncorrectOperationBonus };
}

function appendReplay(scenario: ScenarioDefinition, action: ScenarioReplayStep['action'], message: string, atMs: number, targetObjectId?: string): ScenarioDefinition {
  return {
    ...scenario,
    replayLog: [...(scenario.replayLog ?? []), { id: `replay-${Date.now()}-${Math.floor(Math.random() * 9999)}`, atMs, action, targetObjectId, message }]
  };
}
