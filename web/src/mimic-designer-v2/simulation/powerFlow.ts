import type {
  DrawingDocument,
  ElectricalSymbol,
  HotJointMetadata,
  Phase,
  PhaseElectricalValues,
  PowerFlowMetadata,
  ProtectionElement,
  ThermalState
} from '../drawing/model';
import type { OperationState } from '../topology/operation';
import { branchAllowsTraversal } from '../topology/operation';
import type { ElectricalBranch, TopologyGraph } from '../topology/types';
import { actsAsPowerLoad, actsAsPowerSource } from './powerRoles';

const phaseOrder = ['A', 'B', 'C'] as Phase[];
const defaultVoltageKv = 132;

export interface DerivedPhaseFlow extends PhaseElectricalValues {
  phase: Phase;
  sourceId?: string;
  direction: PowerFlowMetadata['direction'];
  teachingApproximation: true;
}

export interface BranchSimulationState {
  branchId: string;
  objectId?: string;
  phases: Partial<Record<Phase, DerivedPhaseFlow>>;
}

export interface ObjectSimulationSummary {
  objectId: string;
  aggregate: PhaseElectricalValues;
  phases: Partial<Record<Phase, DerivedPhaseFlow>>;
  imbalance: boolean;
  thermalState: ThermalState;
}

export interface ProtectionSimulationState {
  elementId: string;
  state: ProtectionElement['state'];
  pickedUp: boolean;
  tripped: boolean;
  reason?: string;
}

export interface SimulationDerivedState {
  branchFlows: Map<string, BranchSimulationState>;
  objectSummaries: Map<string, ObjectSimulationSummary>;
  protectionStates: Map<string, ProtectionSimulationState>;
  hotJointTemperatures: Map<string, { phase: Phase; temperatureC: number; state: ThermalState }>;
  approximationLabel: string;
}

export function deriveSimulationState(doc: DrawingDocument, graph: TopologyGraph, operation: OperationState, elapsedMs = 0): SimulationDerivedState {
  const symbolById = new Map(doc.objects.symbols.map((symbol) => [symbol.id, symbol]));
  const sourceSymbols = doc.objects.symbols.filter((symbol) => actsAsPowerSource(symbol) && symbol.operation?.sourceOn !== false && hasPower(symbol.powerFlow));
  const branchFlows = new Map<string, BranchSimulationState>();

  sourceSymbols.forEach((source) => {
    const sourceRoots = rootsForSymbol(graph, source.id);
    const reached = traceFromRoots(graph, symbolById, sourceRoots);
    const loadShare = loadShareForReach(source.id, doc, graph, reached.nodes);
    graph.branches
      .filter((branch) => reached.branches.has(branch.id) && operation.liveBranchIds.has(branch.id))
      .forEach((branch) => {
        const state = branchFlows.get(branch.id) ?? { branchId: branch.id, objectId: branch.objectId, phases: {} };
        branch.phases
          .filter((phase) => phaseOrder.includes(phase))
          .forEach((phase) => {
            state.phases[phase] = calculatePhaseFlow(source, branch, phase, doc, elapsedMs, loadShare);
          });
        branchFlows.set(branch.id, state);
      });
  });

  const objectSummaries = summarizeObjects(branchFlows);
  const hotJointTemperatures = deriveHotJointTemperatures(doc, branchFlows);
  const protectionStates = deriveProtectionStates(doc, objectSummaries, hotJointTemperatures);

  return {
    branchFlows,
    objectSummaries,
    hotJointTemperatures,
    protectionStates,
    approximationLabel: 'Teaching approximation: not an industrial load-flow engine'
  };
}

export function applyProtectionStep(doc: DrawingDocument, derived: SimulationDerivedState, now = Date.now()): DrawingDocument {
  let trippedBreakerIds = new Set<string>();
  const protection = doc.protection.map((element) => {
    const state = derived.protectionStates.get(element.id);
    if (!element.enabled || !state?.pickedUp) {
      return { ...element, state: 'idle' as const, pickedUpAt: undefined, trippedAt: undefined };
    }
    const pickedUpAt = element.pickedUpAt ?? new Date(now).toISOString();
    const pickupAgeMs = now - Date.parse(pickedUpAt);
    if (pickupAgeMs >= (element.timeDelayMs ?? 0)) {
      element.tripTargetBreakerIds.forEach((id) => trippedBreakerIds.add(id));
      return { ...element, state: 'tripped' as const, pickedUpAt, trippedAt: element.trippedAt ?? new Date(now).toISOString() };
    }
    return { ...element, state: 'picked-up' as const, pickedUpAt };
  });

  if (!trippedBreakerIds.size && protection.every((element, index) => element === doc.protection[index])) return doc;

  const messages = [...trippedBreakerIds].map((id) => `Protection trip opened ${id}`);
  return {
    ...doc,
    protection,
    objects: {
      ...doc.objects,
      symbols: doc.objects.symbols.map((symbol) =>
        trippedBreakerIds.has(symbol.id)
          ? { ...symbol, operation: { ...symbol.operation, switchState: 'open', tripped: true, protectionState: 'tripped' } }
          : symbol
      )
    },
    operationEvents: [
      ...doc.operationEvents,
      ...messages.map((message) => ({ id: `event-${now}-${Math.floor(Math.random() * 9999)}`, timestamp: new Date(now).toISOString(), message }))
    ]
  };
}

export function mergePhaseValues(flow: PowerFlowMetadata | undefined, phase: Phase | undefined, patch: PhaseElectricalValues, applyAll = false): PowerFlowMetadata {
  const next: PowerFlowMetadata = { ...(flow ?? {}) };
  if (!phase || applyAll) {
    const phases = applyAll ? phaseOrder : [];
    Object.assign(next, patch);
    if (phases.length) {
      next.perPhase = { ...(next.perPhase ?? {}) };
      phases.forEach((item) => {
        next.perPhase![item] = { ...(next.perPhase?.[item] ?? {}), ...patch, manualOverride: true };
      });
    }
  } else {
    next.perPhase = {
      ...(next.perPhase ?? {}),
      [phase]: { ...(next.perPhase?.[phase] ?? {}), ...patch, manualOverride: true }
    };
  }
  return computePhaseMath(next);
}

export function computePhaseMath(flow: PowerFlowMetadata): PowerFlowMetadata {
  const mva = flow.mw !== undefined && flow.mvar !== undefined ? Math.sqrt(flow.mw ** 2 + flow.mvar ** 2) : flow.mva;
  const perPhase = flow.perPhase
    ? Object.fromEntries(Object.entries(flow.perPhase).map(([phase, values]) => {
      const phaseMva = values?.mw !== undefined && values?.mvar !== undefined ? Math.sqrt(values.mw ** 2 + values.mvar ** 2) : values?.mva;
      return [phase, { ...values, mva: values?.manualOverride && values.mva !== undefined ? values.mva : phaseMva }];
    })) as PowerFlowMetadata['perPhase']
    : flow.perPhase;
  return {
    ...flow,
    mva: flow.manualOverride && flow.mva !== undefined ? flow.mva : mva,
    powerFactor: flow.mw !== undefined && mva && mva > 0 ? Math.abs(flow.mw / mva) : flow.powerFactor,
    perPhase
  };
}

function calculatePhaseFlow(source: ElectricalSymbol, branch: ElectricalBranch, phase: Phase, doc: DrawingDocument, elapsedMs: number, loadShare = 1): DerivedPhaseFlow {
  const sourceValue = scalePhaseValue(valueForPhase(source.powerFlow, phase, source.voltageLevelKv), loadShare);
  const branchObject = findObjectPowerFlow(doc, branch.objectId);
  const branchValue = valueForPhase(branchObject, phase);
  const impedance = impedanceForPhase(branchObject, phase) + hotJointResistance(doc.hotJoints, branch, phase);
  const voltageKv = sourceValue.voltageKv ?? source.voltageLevelKv ?? defaultVoltageKv;
  const mva = sourceValue.mva ?? (sourceValue.mw !== undefined && sourceValue.mvar !== undefined ? Math.sqrt(sourceValue.mw ** 2 + sourceValue.mvar ** 2) : undefined) ?? 0;
  const currentA = sourceValue.currentA ?? (voltageKv > 0 ? (mva * 1000) / (voltageKv / Math.sqrt(3)) : 0);
  const voltageDropKv = (currentA * impedance) / 1000;
  const deliveredVoltageKv = Math.max(0, voltageKv - voltageDropKv);
  const voltageFactor = voltageKv > 0 ? Math.max(0, deliveredVoltageKv / voltageKv) : 1;
  const deliveredMw = sourceValue.mw !== undefined ? sourceValue.mw * voltageFactor : sourceValue.mw;
  const deliveredMvar = sourceValue.mvar !== undefined ? sourceValue.mvar * voltageFactor : sourceValue.mvar;
  const deliveredMva = mva * voltageFactor;
  const baseLoadingPercent = Math.min(999, Math.round((currentA / 1000) * 100));
  const ratingPercent = branchValue.loadingPercent;
  const currentLimitA = branchValue.currentA;
  const loadingPercent = currentLimitA && currentLimitA > 0
    ? Math.min(999, Math.round((currentA / currentLimitA) * 100))
    : ratingPercent && ratingPercent > 0
      ? Math.min(999, Math.round((baseLoadingPercent / ratingPercent) * 100))
      : sourceValue.loadingPercent ?? baseLoadingPercent;
  const temperatureC = estimateTemperature(currentA, impedance, elapsedMs, sourceValue.temperatureC);
  return {
    ...sourceValue,
    phase,
    mw: deliveredMw,
    mvar: deliveredMvar,
    mva: deliveredMva,
    currentA,
    voltageKv: deliveredVoltageKv,
    voltageDropKv,
    impedanceOhms: impedance,
    loadingPercent,
    temperatureC,
    thermalState: thermalStateForTemperature(temperatureC),
    direction: source.powerFlow?.direction ?? 'forward',
    sourceId: source.id,
    teachingApproximation: true
  };
}

function loadShareForReach(sourceId: string, doc: DrawingDocument, graph: TopologyGraph, liveNodeIds: Set<string>): number {
  const reachableLoads = doc.objects.symbols.filter((symbol) => {
    if (symbol.id === sourceId || !actsAsPowerLoad(symbol)) return false;
    const terminalIds = graph.devices.find((device) => device.symbolId === symbol.id)?.terminalIds ?? [];
    return terminalIds.some((terminalId) => {
      const terminal = graph.terminals.find((item) => item.id === terminalId);
      return terminal ? terminal.connectedNodeIds.some((nodeId) => liveNodeIds.has(nodeId)) : false;
    });
  });
  return reachableLoads.length > 1 ? 1 / reachableLoads.length : 1;
}

function scalePhaseValue(value: PhaseElectricalValues, factor: number): PhaseElectricalValues {
  if (factor === 1) return value;
  return {
    ...value,
    mw: value.mw !== undefined ? value.mw * factor : value.mw,
    mvar: value.mvar !== undefined ? value.mvar * factor : value.mvar,
    mva: value.mva !== undefined ? value.mva * factor : value.mva,
    currentA: value.currentA !== undefined ? value.currentA * factor : value.currentA
  };
}

function valueForPhase(flow: PowerFlowMetadata | undefined, phase: Phase, fallbackVoltageKv?: number): PhaseElectricalValues {
  const phaseValue = flow?.perPhase?.[phase];
  const aggregateMva = flow?.mva ?? (flow?.mw !== undefined && flow?.mvar !== undefined ? Math.sqrt(flow.mw ** 2 + flow.mvar ** 2) : undefined);
  return {
    voltageKv: phaseValue?.voltageKv ?? flow?.voltageKv ?? fallbackVoltageKv ?? defaultVoltageKv,
    mw: phaseValue?.mw ?? (flow?.mw !== undefined ? flow.mw / 3 : undefined),
    mvar: phaseValue?.mvar ?? (flow?.mvar !== undefined ? flow.mvar / 3 : undefined),
    mva: phaseValue?.mva ?? (aggregateMva !== undefined ? aggregateMva / 3 : undefined),
    currentA: phaseValue?.currentA ?? flow?.currentA,
    resistanceOhms: phaseValue?.resistanceOhms ?? flow?.resistanceOhms,
    reactanceOhms: phaseValue?.reactanceOhms ?? flow?.reactanceOhms,
    impedanceOhms: phaseValue?.impedanceOhms ?? flow?.impedanceOhms,
    loadingPercent: phaseValue?.loadingPercent ?? flow?.loadingPercent,
    temperatureC: phaseValue?.temperatureC ?? flow?.temperatureC
  };
}

function rootsForSymbol(graph: TopologyGraph, symbolId: string): string[] {
  const terminalIds = graph.devices.find((device) => device.symbolId === symbolId)?.terminalIds ?? [];
  return terminalIds.flatMap((terminalId) => graph.terminals.find((terminal) => terminal.id === terminalId)?.connectedNodeIds ?? []);
}

function traceFromRoots(graph: TopologyGraph, symbolById: Map<string, ElectricalSymbol>, roots: string[]) {
  const nodes = new Set<string>();
  const branches = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const current = queue.shift()!;
    if (nodes.has(current)) continue;
    nodes.add(current);
    graph.branches.forEach((branch) => {
      if (!branchAllowsTraversal(symbolById, branch.objectId, branch.phase)) return;
      if (branch.fromNodeId !== current && branch.toNodeId !== current) return;
      branches.add(branch.id);
      const other = branch.fromNodeId === current ? branch.toNodeId : branch.fromNodeId;
      if (!nodes.has(other)) queue.push(other);
    });
  }
  return { nodes, branches };
}

function findObjectPowerFlow(doc: DrawingDocument, objectId?: string): PowerFlowMetadata | undefined {
  if (!objectId) return undefined;
  return doc.objects.conductors.find((item) => item.id === objectId)?.powerFlow
    ?? doc.objects.busbars.find((item) => item.id === objectId)?.powerFlow
    ?? doc.objects.symbols.find((item) => item.id === objectId)?.powerFlow;
}

function impedanceForPhase(flow: PowerFlowMetadata | undefined, phase: Phase): number {
  const values = valueForPhase(flow, phase);
  if (values.impedanceOhms !== undefined) return values.impedanceOhms;
  if (values.resistanceOhms !== undefined || values.reactanceOhms !== undefined) {
    return Math.hypot(values.resistanceOhms ?? 0, values.reactanceOhms ?? 0);
  }
  return 0.01;
}

function hotJointResistance(hotJoints: HotJointMetadata[], branch: ElectricalBranch, phase: Phase): number {
  return hotJoints
    .filter((joint) => joint.active && joint.phase === phase && (joint.targetTopologyBranchId === branch.id || joint.targetObjectId === branch.objectId))
    .reduce((sum, joint) => sum + joint.addedResistanceOhms, 0);
}

function estimateTemperature(currentA: number, resistanceOhms: number, elapsedMs: number, existing?: number): number {
  const ambient = 20;
  const heating = (currentA ** 2) * resistanceOhms * 0.00002 * Math.max(1, elapsedMs || 1000) / 1000;
  const cooled = existing !== undefined ? Math.max(ambient, existing - 0.5) : ambient;
  return Math.round((cooled + heating) * 10) / 10;
}

function thermalStateForTemperature(temperatureC = 20): ThermalState {
  if (temperatureC >= 100) return 'critical';
  if (temperatureC >= 80) return 'hot';
  if (temperatureC >= 60) return 'warm';
  return 'normal';
}

function summarizeObjects(branchFlows: Map<string, BranchSimulationState>): Map<string, ObjectSimulationSummary> {
  const grouped = new Map<string, BranchSimulationState[]>();
  branchFlows.forEach((state) => {
    if (!state.objectId) return;
    grouped.set(state.objectId, [...(grouped.get(state.objectId) ?? []), state]);
  });
  return new Map([...grouped.entries()].map(([objectId, states]) => {
    const phases: Partial<Record<Phase, DerivedPhaseFlow>> = {};
    phaseOrder.forEach((phase) => {
      const values = states.map((state) => state.phases[phase]).filter(Boolean) as DerivedPhaseFlow[];
      if (!values.length) return;
      phases[phase] = values[0];
    });
    const phaseValues = Object.values(phases).filter(Boolean) as DerivedPhaseFlow[];
    const aggregate = phaseValues.reduce<PhaseElectricalValues>((sum, value) => ({
      mw: (sum.mw ?? 0) + (value.mw ?? 0),
      mvar: (sum.mvar ?? 0) + (value.mvar ?? 0),
      mva: (sum.mva ?? 0) + (value.mva ?? 0),
      currentA: (sum.currentA ?? 0) + (value.currentA ?? 0),
      voltageDropKv: Math.max(sum.voltageDropKv ?? 0, value.voltageDropKv ?? 0),
      voltageKv: Math.max(sum.voltageKv ?? 0, value.voltageKv ?? 0),
      loadingPercent: Math.max(sum.loadingPercent ?? 0, value.loadingPercent ?? 0),
      temperatureC: Math.max(sum.temperatureC ?? 20, value.temperatureC ?? 20)
    }), {});
    const mwValues = phaseValues.map((value) => value.mw ?? 0);
    const maxMw = Math.max(...mwValues, 0);
    const minMw = Math.min(...mwValues, 0);
    return [objectId, {
      objectId,
      aggregate,
      phases,
      imbalance: maxMw - minMw > Math.max(0.1, maxMw * 0.1),
      thermalState: thermalStateForTemperature(aggregate.temperatureC)
    }];
  }));
}

function deriveHotJointTemperatures(doc: DrawingDocument, branchFlows: Map<string, BranchSimulationState>) {
  const result = new Map<string, { phase: Phase; temperatureC: number; state: ThermalState }>();
  doc.hotJoints.filter((joint) => joint.active).forEach((joint) => {
    const matching = [...branchFlows.values()].filter((state) => state.branchId === joint.targetTopologyBranchId || state.objectId === joint.targetObjectId);
    const current = Math.max(...matching.map((state) => state.phases[joint.phase]?.currentA ?? 0), 0);
    const rise = current ** 2 * joint.addedResistanceOhms * 0.00002 / Math.max(0.1, joint.thermalMassFactor);
    const temperatureC = Math.round((joint.ambientTemperatureC + rise) * 10) / 10;
    const state: ThermalState = temperatureC >= joint.dangerTemperatureC ? 'critical' : temperatureC >= joint.warningTemperatureC ? 'hot' : thermalStateForTemperature(temperatureC);
    result.set(joint.id, { phase: joint.phase, temperatureC, state });
  });
  return result;
}

function deriveProtectionStates(doc: DrawingDocument, summaries: Map<string, ObjectSimulationSummary>, hotJoints: Map<string, { state: ThermalState }>) {
  const result = new Map<string, ProtectionSimulationState>();
  doc.protection.forEach((element) => {
    if (!element.enabled) {
      result.set(element.id, { elementId: element.id, state: 'idle', pickedUp: false, tripped: false });
      return;
    }
    const summary = element.watchedObjectId ? summaries.get(element.watchedObjectId) : undefined;
    const maxCurrent = Math.max(...element.phases.map((phase) => summary?.phases[phase]?.currentA ?? 0), 0);
    const earthFaultActive = element.type === 'earth-fault' && doc.faults.some((fault) => fault.active && fault.phases.some((phase) => element.phases.includes(phase)) && ['phase-to-earth', 'A-E', 'B-E', 'C-E', 'A-B-C-E', 'persistent', 'transient'].includes(fault.type));
    const thermalCritical = element.type === 'thermal-overload' && [...hotJoints.values()].some((joint) => joint.state === 'critical');
    const overcurrent = element.type === 'overcurrent' && element.pickupCurrentA !== undefined && maxCurrent >= element.pickupCurrentA;
    const pickedUp = overcurrent || earthFaultActive || thermalCritical;
    result.set(element.id, {
      elementId: element.id,
      state: pickedUp ? 'picked-up' : 'idle',
      pickedUp,
      tripped: false,
      reason: pickedUp ? `${element.type} pickup` : undefined
    });
  });
  return result;
}

function hasPower(flow: PowerFlowMetadata | undefined) {
  return flow?.mw !== undefined || flow?.mvar !== undefined || Object.values(flow?.perPhase ?? {}).some((value) => value?.mw !== undefined || value?.mvar !== undefined);
}
