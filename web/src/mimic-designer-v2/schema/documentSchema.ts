import type { BusbarSegment, ConductorPath, DrawingDocument, ElectricalSymbol, FaultMetadata, HotJointMetadata, Phase, PowerFlowMetadata, ProtectionElement, ProtectionZone, RelayFunction, RelayInput, RelayOutputAction, RelaySettings, ScenarioDefinition } from '../drawing/model';

export const MIMIC_DESIGNER_V2_SCHEMA_VERSION = 7;

const phasesAll = ['A', 'B', 'C'] as Phase[];
const switchingTypes = new Set<ElectricalSymbol['type']>(['circuit-breaker', 'disconnector', 'earth-switch']);

export type PersistedDrawingDocument = Omit<Partial<DrawingDocument>, 'objects'> & {
  objects?: Partial<DrawingDocument['objects']>;
};

function defaultOperation(type: ElectricalSymbol['type'], existing: ElectricalSymbol['operation'] = {}): ElectricalSymbol['operation'] {
  return {
    sourceOn: type === 'source' ? existing.sourceOn ?? true : existing.sourceOn,
    switchState: switchingTypes.has(type) ? existing.switchState ?? 'open' : existing.switchState,
    perPhaseSwitchState: existing.perPhaseSwitchState ?? {},
    tripped: existing.tripped ?? false,
    protectionState: existing.protectionState ?? 'idle'
  };
}

function defaultEngineering(symbol: ElectricalSymbol): ElectricalSymbol['engineering'] {
  if (symbol.type === 'ct') return { ctPolarity: symbol.engineering?.ctPolarity ?? 'P1-left' };
  if (symbol.type === 'transformer') {
    return {
      transformerPolarity: symbol.engineering?.transformerPolarity ?? 'hv-left',
      hasTertiary: symbol.engineering?.hasTertiary ?? symbol.terminals.some((terminal) => terminal.name === 'tertiary'),
      tertiaryVoltageKv: symbol.engineering?.tertiaryVoltageKv,
      transformerExpansion: symbol.engineering?.transformerExpansion ?? 'single-symbol'
    };
  }
  return symbol.engineering;
}

export function computePowerFlow(input: PowerFlowMetadata | undefined): PowerFlowMetadata | undefined {
  if (!input) return undefined;
  const mw = input.mw;
  const mvar = input.mvar;
  const computedMva = mw !== undefined && mvar !== undefined ? Math.sqrt(mw ** 2 + mvar ** 2) : input.mva;
  const powerFactor = mw !== undefined && computedMva && computedMva > 0 ? Math.abs(mw / computedMva) : input.powerFactor;
  const perPhase = input.perPhase
    ? Object.fromEntries(
      Object.entries(input.perPhase).map(([phase, values]) => {
        const phaseMva = values?.mw !== undefined && values?.mvar !== undefined
          ? Math.sqrt(values.mw ** 2 + values.mvar ** 2)
          : values?.mva;
        return [phase, {
          ...values,
          mva: values?.manualOverride && values.mva !== undefined ? values.mva : phaseMva
        }];
      })
    ) as PowerFlowMetadata['perPhase']
    : undefined;
  return {
    ...input,
    mva: input.manualOverride && input.mva !== undefined ? input.mva : computedMva,
    powerFactor,
    perPhase
  };
}

function migrateSymbol(symbol: ElectricalSymbol): ElectricalSymbol {
  const phaseApplicability = symbol.phaseApplicability?.length ? symbol.phaseApplicability : phasesAll;
  const terminals = (symbol.terminals ?? []).map((terminal) => ({
    ...terminal,
    phaseApplicability: terminal.phaseApplicability?.length ? terminal.phaseApplicability : phaseApplicability
  }));

  return {
    ...symbol,
    rotation: symbol.rotation ?? 0,
    phaseApplicability,
    terminals,
    simulation: symbol.simulation ?? {},
    phaseMode: symbol.phaseMode ?? (hasAllPhases(phaseApplicability) ? 'three-phase' : 'single-phase'),
    renderExpansion: symbol.renderExpansion ?? 'per-phase-symbols',
    phaseSpacingPx: symbol.phaseSpacingPx ?? 24,
    powerFlow: computePowerFlow(symbol.powerFlow),
    operation: defaultOperation(symbol.type, symbol.operation),
    engineering: defaultEngineering({ ...symbol, phaseApplicability, terminals }),
    viewMetadata: symbol.viewMetadata ?? { 'single-line': { visible: true }, 'three-phase': { visible: true } }
  };
}

export function migrateDrawingDocument(input: PersistedDrawingDocument | null | undefined): DrawingDocument | null {
  if (!input) return null;
  const objects = (input.objects ?? {}) as Partial<DrawingDocument['objects']>;
  const now = new Date().toISOString();
  const doc: DrawingDocument = {
    id: input.id ?? `doc-${Date.now()}`,
    version: 2,
    schemaVersion: MIMIC_DESIGNER_V2_SCHEMA_VERSION,
    name: input.name ?? 'Untitled Mimic Drawing',
    description: input.description ?? '',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    drawingType: input.drawingType ?? 'user',
    tags: input.tags ?? [],
    voltageLevels: input.voltageLevels ?? inferVoltageLevels(objects),
    thumbnail: input.thumbnail,
    lastOpenedAt: input.lastOpenedAt,
    templateNotes: input.templateNotes,
    activeView: input.activeView ?? 'single-line',
    objects: {
      symbols: ((objects.symbols ?? []) as ElectricalSymbol[]).map(migrateSymbol),
      conductors: objects.conductors ?? [],
      busbars: objects.busbars ?? [],
      labels: objects.labels ?? [],
      annotations: objects.annotations ?? []
    },
    faults: (input.faults ?? []).map(migrateFault),
    hotJoints: ((input.hotJoints ?? []) as HotJointMetadata[]).map(migrateHotJoint),
    protectionZones: ((input.protectionZones ?? []) as ProtectionZone[]).map(migrateZone),
    relays: ((input.relays ?? []) as RelaySettings[]).map(migrateRelay),
    protection: ((input.protection ?? []) as ProtectionElement[]).map(migrateProtection),
    scenarios: ((input.scenarios ?? []) as ScenarioDefinition[]).map(migrateScenario),
    activeScenarioId: input.activeScenarioId,
    operationEvents: input.operationEvents ?? [],
    simulationState: input.simulationState ?? { running: false, speed: 1, overlay: 'none' },
    uiState: {
      gridSize: input.uiState?.gridSize ?? 20,
      snapToGrid: input.uiState?.snapToGrid ?? true,
      snapToTerminals: input.uiState?.snapToTerminals ?? true,
      snapToIntersections: input.uiState?.snapToIntersections ?? true
    },
    history: { undoStack: [], redoStack: [] }
  };

  doc.objects.conductors = doc.objects.conductors.map((conductor: ConductorPath) => ({
    ...conductor,
    rotation: conductor.rotation ?? 0,
    phaseApplicability: conductor.phaseApplicability?.length ? conductor.phaseApplicability : phasesAll,
    phaseMode: conductor.phaseMode ?? (hasAllPhases(conductor.phaseApplicability ?? phasesAll) ? 'three-phase' : 'single-phase'),
    renderExpansion: conductor.renderExpansion ?? 'per-phase-symbols',
    phaseSpacingPx: conductor.phaseSpacingPx ?? 24,
    powerFlow: computePowerFlow(conductor.powerFlow),
    connectionPoints: conductor.connectionPoints?.length
      ? conductor.connectionPoints
      : conductor.vertices.map((position, index) => ({ id: `${conductor.id}-cp-${index}`, position }))
  }));

  doc.objects.busbars = doc.objects.busbars.map((busbar: BusbarSegment) => ({
    ...busbar,
    rotation: busbar.rotation ?? 0,
    phaseApplicability: busbar.phaseApplicability?.length ? busbar.phaseApplicability : phasesAll,
    phaseMode: busbar.phaseMode ?? (hasAllPhases(busbar.phaseApplicability ?? phasesAll) ? 'three-phase' : 'single-phase'),
    renderExpansion: busbar.renderExpansion ?? 'per-phase-symbols',
    phaseSpacingPx: busbar.phaseSpacingPx ?? 24,
    powerFlow: computePowerFlow(busbar.powerFlow),
    width: busbar.width ?? 8,
    connectionPoints: busbar.connectionPoints?.length
      ? busbar.connectionPoints
      : busbar.vertices.map((position, index) => ({ id: `${busbar.id}-cp-${index}`, position }))
  }));

  return doc;
}

function migrateZone(zone: ProtectionZone): ProtectionZone {
  return {
    ...zone,
    name: zone.name ?? zone.id,
    vertices: zone.vertices ?? [],
    assignedObjectIds: zone.assignedObjectIds ?? [],
    ctInputIds: zone.ctInputIds ?? [],
    vtInputIds: zone.vtInputIds ?? [],
    color: zone.color ?? '#22c55e',
    visible: zone.visible ?? true
  };
}

function migrateRelay(relay: RelaySettings): RelaySettings {
  const phases = relay.phases?.length ? relay.phases : phasesAll;
  const functions = (relay.functions?.length ? relay.functions : legacyFunctionsForRelay(relay, phases)).map(migrateRelayFunction);
  const outputActions = (relay.outputActions?.length ? relay.outputActions : legacyOutputsForRelay(relay)).map(migrateRelayOutput);
  return {
    ...relay,
    name: relay.name ?? relay.id,
    role: relay.role ?? (relay.type === 'earth-fault' ? 'backup' : 'first-main'),
    type: relay.type ?? 'overcurrent',
    enabled: relay.enabled ?? true,
    phases,
    pickupCurrentA: relay.pickupCurrentA ?? 500,
    timeDelayMs: relay.timeDelayMs ?? 500,
    directional: relay.directional ?? false,
    tripTargetBreakerIds: relay.tripTargetBreakerIds ?? [],
    backupTripTargetBreakerIds: relay.backupTripTargetBreakerIds ?? [],
    breakerFailEnabled: relay.breakerFailEnabled ?? false,
    breakerFailDelayMs: relay.breakerFailDelayMs ?? 500,
    state: relay.enabled === false ? 'disabled' : relay.state ?? 'idle',
    inputs: (relay.inputs ?? []).map(migrateRelayInput),
    functions,
    outputActions,
    eventHistory: relay.eventHistory ?? []
  };
}

function migrateRelayInput(input: RelayInput): RelayInput {
  return {
    ...input,
    id: input.id ?? `input-${Date.now()}`,
    sourceType: input.sourceType ?? 'ct',
    phases: input.phases?.length ? input.phases : phasesAll,
    quantity: input.quantity ?? 'current',
    polarity: input.polarity ?? 'none'
  };
}

function migrateRelayFunction(fn: RelayFunction): RelayFunction {
  return {
    ...fn,
    id: fn.id ?? `fn-${Date.now()}`,
    type: fn.type ?? 'overcurrent',
    enabled: fn.enabled ?? true,
    timeDelayMs: fn.timeDelayMs ?? 500,
    instantaneous: fn.instantaneous ?? false,
    phases: fn.phases?.length ? fn.phases : phasesAll,
    logic: fn.logic ?? (fn.type === 'earth-fault' ? 'residual-earth' : 'any-phase'),
    state: fn.state ?? 'inactive'
  };
}

function migrateRelayOutput(output: RelayOutputAction): RelayOutputAction {
  return {
    ...output,
    id: output.id ?? `output-${Date.now()}`,
    targetType: output.targetType ?? 'circuit-breaker',
    action: output.action ?? 'trip-open-breaker'
  };
}

function legacyFunctionsForRelay(relay: RelaySettings, phases: Phase[]): RelayFunction[] {
  return [{
    id: `${relay.id}-fn-${relay.type ?? 'overcurrent'}`,
    type: relay.type ?? 'overcurrent',
    enabled: relay.enabled ?? true,
    pickupThreshold: relay.type === 'earth-fault' ? relay.earthFaultPickupA ?? relay.pickupCurrentA ?? 50 : relay.pickupCurrentA ?? 500,
    timeDelayMs: relay.timeDelayMs ?? 500,
    instantaneous: false,
    phases,
    requiredInputType: relay.type === 'earth-fault' ? 'earth-residual-current' : 'current',
    logic: relay.type === 'earth-fault' ? 'residual-earth' : 'any-phase',
    state: relay.state === 'picked-up' ? 'picked-up' : relay.state === 'tripped' ? 'tripped' : 'inactive',
    pickedUpAt: relay.pickedUpAt,
    trippedAt: relay.trippedAt
  }];
}

function legacyOutputsForRelay(relay: RelaySettings): RelayOutputAction[] {
  return [
    ...(relay.tripTargetBreakerIds ?? []).map((targetObjectId) => ({
      id: `${relay.id}-trip-${targetObjectId}`,
      targetType: 'circuit-breaker' as const,
      targetObjectId,
      action: 'trip-open-breaker' as const
    })),
    ...(relay.backupTripTargetBreakerIds ?? []).map((targetObjectId) => ({
      id: `${relay.id}-backup-${targetObjectId}`,
      targetType: 'circuit-breaker' as const,
      targetObjectId,
      action: 'trip-open-breaker' as const,
      delayMs: relay.breakerFailDelayMs
    }))
  ];
}

function migrateScenario(scenario: ScenarioDefinition): ScenarioDefinition {
  return {
    ...scenario,
    name: scenario.name ?? scenario.id,
    learningObjectives: scenario.learningObjectives ?? scenario.objectives?.map((objective) => objective.text) ?? [],
    difficulty: scenario.difficulty ?? 'intro',
    tags: scenario.tags ?? [],
    initialSwitchStates: scenario.initialSwitchStates ?? {},
    initialSourceStates: scenario.initialSourceStates ?? {},
    faults: (scenario.faults ?? []).map(migrateFault),
    relays: (scenario.relays ?? []).map(migrateRelay),
    protection: (scenario.protection ?? []).map(migrateProtection),
    powerFlows: scenario.powerFlows ?? {},
    activeView: scenario.activeView ?? 'single-line',
    objectives: (scenario.objectives ?? []).map((objective) => ({ type: 'operate-switchgear', ...objective })),
    events: (scenario.events ?? []).map((event) => ({ ...event, fired: event.fired ?? false, fault: event.fault ? migrateFault(event.fault) : undefined })),
    successRules: scenario.successRules ?? {},
    failureRules: scenario.failureRules ?? {},
    expectedSolution: scenario.expectedSolution ?? [],
    replayLog: scenario.replayLog ?? [],
    wrongOperationCount: scenario.wrongOperationCount ?? 0,
    currentHintIndex: scenario.currentHintIndex ?? 0
  };
}

function migrateFault(fault: FaultMetadata): FaultMetadata {
  return {
    ...fault,
    phases: fault.phases?.length ? fault.phases : phasesForFaultType(fault.type),
    targetPhase: fault.targetPhase ?? (fault.phases?.length === 1 ? fault.phases[0] : undefined),
    active: fault.active ?? true,
    persistent: fault.persistent ?? fault.type === 'persistent',
    createdAt: fault.createdAt ?? new Date().toISOString()
  };
}

function migrateHotJoint(hotJoint: HotJointMetadata): HotJointMetadata {
  return {
    ...hotJoint,
    phase: hotJoint.phase ?? 'A',
    addedResistanceOhms: hotJoint.addedResistanceOhms ?? 0.05,
    thermalMassFactor: hotJoint.thermalMassFactor ?? 1,
    ambientTemperatureC: hotJoint.ambientTemperatureC ?? 20,
    warningTemperatureC: hotJoint.warningTemperatureC ?? 70,
    dangerTemperatureC: hotJoint.dangerTemperatureC ?? 100,
    intermittent: hotJoint.intermittent ?? false,
    active: hotJoint.active ?? true
  };
}

function migrateProtection(element: ProtectionElement): ProtectionElement {
  return {
    ...element,
    enabled: element.enabled ?? true,
    phases: element.phases?.length ? element.phases : phasesAll,
    timeDelayMs: element.timeDelayMs ?? 500,
    tripTargetBreakerIds: element.tripTargetBreakerIds ?? [],
    state: element.state ?? 'idle'
  };
}

function phasesForFaultType(type: FaultMetadata['type']): Phase[] {
  if (type === 'A-E') return ['A'];
  if (type === 'B-E') return ['B'];
  if (type === 'C-E') return ['C'];
  if (type === 'A-B') return ['A', 'B'];
  if (type === 'B-C') return ['B', 'C'];
  if (type === 'C-A') return ['C', 'A'];
  if (type === 'phase-to-phase') return ['A', 'B'];
  return phasesAll;
}

function hasAllPhases(phases: Phase[]) {
  return ['A', 'B', 'C'].every((phase) => phases.includes(phase as Phase));
}

export function serializeDrawingDocument(doc: DrawingDocument): DrawingDocument {
  return migrateDrawingDocument({ ...doc, schemaVersion: MIMIC_DESIGNER_V2_SCHEMA_VERSION })!;
}

function inferVoltageLevels(objects: Partial<DrawingDocument['objects']>): number[] {
  const values = new Set<number>();
  (objects.symbols ?? []).forEach((symbol) => {
    if (symbol.voltageLevelKv) values.add(symbol.voltageLevelKv);
    if (symbol.engineering?.tertiaryVoltageKv) values.add(symbol.engineering.tertiaryVoltageKv);
  });
  (objects.conductors ?? []).forEach((path) => { if (path.voltageLevelKv) values.add(path.voltageLevelKv); });
  (objects.busbars ?? []).forEach((path) => { if (path.voltageLevelKv) values.add(path.voltageLevelKv); });
  return [...values].sort((a, b) => b - a);
}
