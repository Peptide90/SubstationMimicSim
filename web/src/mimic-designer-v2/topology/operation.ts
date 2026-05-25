import type { DrawingDocument, ElectricalSymbol } from '../drawing/model';
import type { TopologyGraph } from './types';

export interface OperationOverride {
  symbolId: string;
  switchState?: 'open' | 'closed';
  sourceOn?: boolean;
  tripped?: boolean;
}

export interface OperationState {
  liveNodeIds: Set<string>;
  liveBranchIds: Set<string>;
  earthedNodeIds: Set<string>;
  earthedBranchIds: Set<string>;
  faultNodeIds: Set<string>;
  faultBranchIds: Set<string>;
  activeFaultIds: Set<string>;
  nodeVoltageKv: Map<string, Set<number>>;
  branchVoltageKv: Map<string, Set<number>>;
  voltageConflictNodeIds: Set<string>;
  voltageConflictBranchIds: Set<string>;
}

export interface OperationResult {
  doc: DrawingDocument;
  state: OperationState;
  reason: string;
}

const isSwitchingDevice = (type: string) => type === 'circuit-breaker' || type === 'disconnector' || type === 'earth-switch';

function symbolsWithOverride(doc: DrawingDocument, override?: OperationOverride): Map<string, ElectricalSymbol> {
  return new Map(doc.objects.symbols.map((symbol) => {
    if (override?.symbolId !== symbol.id) return [symbol.id, symbol] as const;
    return [
      symbol.id,
      {
        ...symbol,
        operation: {
          ...symbol.operation,
          switchState: override.switchState ?? symbol.operation?.switchState,
          sourceOn: override.sourceOn ?? symbol.operation?.sourceOn,
          tripped: override.tripped ?? symbol.operation?.tripped
        }
      }
    ] as const;
  }));
}

export function branchAllowsTraversal(symbolById: Map<string, ElectricalSymbol>, objectId?: string, phase?: string): boolean {
  const symbol = objectId ? symbolById.get(objectId) : undefined;
  if (!symbol) return true;
  const phaseState = phase ? symbol.operation?.perPhaseSwitchState?.[phase as keyof typeof symbol.operation.perPhaseSwitchState] : undefined;
  const switchState = phaseState ?? symbol.operation?.switchState;
  if (symbol.type === 'earth-switch') return switchState === 'closed';
  if (symbol.type === 'circuit-breaker' || symbol.type === 'disconnector') return switchState === 'closed' && !symbol.operation?.tripped;
  return true;
}

function trace(graph: TopologyGraph, symbolById: Map<string, ElectricalSymbol>, roots: string[]) {
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

function traceLiveVoltages(doc: DrawingDocument, graph: TopologyGraph, symbolById: Map<string, ElectricalSymbol>) {
  const nodeVoltageKv = new Map<string, Set<number>>();
  const branchVoltageKv = new Map<string, Set<number>>();
  const voltageConflictNodeIds = new Set<string>();
  const voltageConflictBranchIds = new Set<string>();
  const sourceRoots = graph.devices
    .map((device) => ({ device, symbol: symbolById.get(device.symbolId) }))
    .filter((item) => item.symbol?.type === 'source' && item.symbol.operation?.sourceOn !== false)
    .flatMap((item) => item.device.terminalIds.flatMap((terminalId) => graph.terminals.find((terminal) => terminal.id === terminalId)?.connectedNodeIds.map((nodeId) => ({ nodeId, voltageKv: item.symbol!.voltageLevelKv ?? 0 })) ?? []))
    .filter((item) => item.voltageKv > 0);
  const queue = [...sourceRoots];
  const visited = new Set<string>();
  const objectVoltageById = new Map<string, number | undefined>([
    ...doc.objects.symbols.map((object) => [object.id, object.voltageLevelKv] as const),
    ...doc.objects.conductors.map((object) => [object.id, object.voltageLevelKv] as const),
    ...doc.objects.busbars.map((object) => [object.id, object.voltageLevelKv] as const)
  ]);
  const addVoltage = (map: Map<string, Set<number>>, id: string, voltageKv: number) => {
    const set = map.get(id) ?? new Set<number>();
    set.add(voltageKv);
    map.set(id, set);
    return set;
  };

  while (queue.length) {
    const current = queue.shift()!;
    const visitKey = `${current.nodeId}:${current.voltageKv}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    const nodeSet = addVoltage(nodeVoltageKv, current.nodeId, current.voltageKv);
    if (nodeSet.size > 1) voltageConflictNodeIds.add(current.nodeId);

    graph.branches.forEach((branch) => {
      if (branch.fromNodeId !== current.nodeId && branch.toNodeId !== current.nodeId) return;
      if (!branchAllowsTraversal(symbolById, branch.objectId, branch.phase)) return;
      const symbol = branch.objectId ? symbolById.get(branch.objectId) : undefined;
      const objectVoltage = branch.objectId ? objectVoltageById.get(branch.objectId) : undefined;
      if (objectVoltage && objectVoltage !== current.voltageKv && symbol?.type !== 'transformer') {
        voltageConflictBranchIds.add(branch.id);
      }
      const branchSet = addVoltage(branchVoltageKv, branch.id, current.voltageKv);
      if (branchSet.size > 1 && symbol?.type !== 'transformer') voltageConflictBranchIds.add(branch.id);
      const nextVoltage = symbol?.type === 'transformer' ? transformerSideVoltage(symbol, branch, current.voltageKv) : current.voltageKv;
      const other = branch.fromNodeId === current.nodeId ? branch.toNodeId : branch.fromNodeId;
      queue.push({ nodeId: other, voltageKv: nextVoltage });
    });
  }

  return { nodeVoltageKv, branchVoltageKv, voltageConflictNodeIds, voltageConflictBranchIds };
}

function transformerSideVoltage(symbol: ElectricalSymbol, branch: TopologyGraph['branches'][number], incomingVoltageKv: number) {
  const fromTerminal = branch.fromTerminalId?.split(':').at(-1);
  const toTerminal = branch.toTerminalId?.split(':').at(-1);
  const nextTerminal = incomingVoltageKv === symbol.voltageLevelKv ? toTerminal : fromTerminal;
  if (nextTerminal === 'tertiary') return symbol.engineering?.tertiaryVoltageKv ?? incomingVoltageKv;
  if (nextTerminal === 'lv') return inferTransformerLvVoltage(symbol);
  if (nextTerminal === 'hv') return symbol.voltageLevelKv ?? incomingVoltageKv;
  return incomingVoltageKv;
}

function inferTransformerLvVoltage(symbol: ElectricalSymbol) {
  if (symbol.engineering?.tertiaryVoltageKv && symbol.engineering.tertiaryVoltageKv < (symbol.voltageLevelKv ?? Infinity)) return symbol.engineering.tertiaryVoltageKv;
  if ((symbol.voltageLevelKv ?? 0) >= 275) return 132;
  if ((symbol.voltageLevelKv ?? 0) >= 132) return 33;
  return symbol.voltageLevelKv ?? 33;
}

function rootsForDevices(graph: TopologyGraph, symbolById: Map<string, ElectricalSymbol>, predicate: (symbol: ElectricalSymbol) => boolean) {
  return graph.devices
    .filter((device) => {
      const symbol = symbolById.get(device.symbolId);
      return Boolean(symbol && predicate(symbol));
    })
    .flatMap((device) => device.terminalIds)
    .flatMap((terminalId) => graph.terminals.find((terminal) => terminal.id === terminalId)?.connectedNodeIds ?? []);
}

export function deriveOperationState(doc: DrawingDocument, graph: TopologyGraph, override?: OperationOverride): OperationState {
  const symbolById = symbolsWithOverride(doc, override);
  const sourceRoots = rootsForDevices(graph, symbolById, (symbol) => symbol.type === 'source' && symbol.operation?.sourceOn !== false);
  const earthRoots = rootsForDevices(graph, symbolById, (symbol) => symbol.type === 'earth-switch' && symbol.operation?.switchState === 'closed');
  const earthFaultTypes = new Set(['phase-to-earth', 'three-phase', 'persistent', 'transient', 'high-impedance', 'A-E', 'B-E', 'C-E', 'A-B-C-E']);
  const faultEarthRoots = doc.faults
    .filter((fault) => fault.active && earthFaultTypes.has(fault.type))
    .flatMap((fault) => {
      if (fault.targetTopologyNodeId) return [fault.targetTopologyNodeId];
      if (fault.targetTopologyBranchId) {
        const branch = graph.branches.find((item) => item.id === fault.targetTopologyBranchId);
        return branch && branch.phases.some((phase) => fault.phases.includes(phase)) ? [branch.fromNodeId, branch.toNodeId] : [];
      }
      if (fault.targetObjectId) {
        return graph.branches
          .filter((branch) => branch.objectId === fault.targetObjectId && branch.phases.some((phase) => fault.phases.includes(phase)))
          .flatMap((branch) => [branch.fromNodeId, branch.toNodeId]);
      }
      return [];
    });
  const live = trace(graph, symbolById, sourceRoots);
  const voltage = traceLiveVoltages(doc, graph, symbolById);
  const earthed = trace(graph, symbolById, [...earthRoots, ...faultEarthRoots]);
  const faultNodeIds = new Set([...live.nodes].filter((nodeId) => earthed.nodes.has(nodeId)));
  const faultBranchIds = new Set([
    ...[...live.branches].filter((branchId) => earthed.branches.has(branchId)),
    ...voltage.voltageConflictBranchIds,
    ...doc.faults.filter((fault) => fault.active && fault.targetObjectId).flatMap((fault) => graph.branches.filter((branch) => branch.objectId === fault.targetObjectId && branch.phases.some((phase) => fault.phases.includes(phase))).map((branch) => branch.id))
  ]);
  voltage.voltageConflictNodeIds.forEach((nodeId) => faultNodeIds.add(nodeId));
  return {
    liveNodeIds: live.nodes,
    liveBranchIds: live.branches,
    earthedNodeIds: earthed.nodes,
    earthedBranchIds: earthed.branches,
    faultNodeIds,
    faultBranchIds,
    activeFaultIds: new Set(doc.faults.filter((fault) => fault.active).map((fault) => fault.id)),
    ...voltage
  };
}

export function operateDevice(doc: DrawingDocument, graph: TopologyGraph, symbolId: string): OperationResult {
  const symbol = doc.objects.symbols.find((item) => item.id === symbolId);
  if (!symbol) return { doc, state: deriveOperationState(doc, graph), reason: `No device ${symbolId}` };
  if (symbol.type === 'source') {
    const nextDoc = updateOperation(doc, symbol.id, { sourceOn: symbol.operation?.sourceOn === false });
    return { doc: addOperationEvent(nextDoc, `Source ${symbol.id} toggled`, symbol.id), state: deriveOperationState(nextDoc, graph), reason: `Source ${symbol.id} toggled` };
  }
  if (!isSwitchingDevice(symbol.type)) return { doc, state: deriveOperationState(doc, graph), reason: `${symbol.type} has no operate action` };

  const nextState = symbol.operation?.switchState === 'closed' ? 'open' : 'closed';
  if (symbol.type === 'circuit-breaker' && nextState === 'closed') {
    const trial = deriveOperationState(doc, graph, { symbolId: symbol.id, switchState: 'closed', tripped: false });
    if (trial.faultNodeIds.size > 0) {
      const nextDoc = updateOperation(doc, symbol.id, { switchState: 'open', tripped: true });
      const reason = trial.voltageConflictNodeIds.size || trial.voltageConflictBranchIds.size ? `Breaker ${symbol.id} tripped: voltage mismatch` : `Breaker ${symbol.id} tripped: live/earthed conflict`;
      return { doc: addOperationEvent(nextDoc, reason, symbol.id, reason), state: deriveOperationState(nextDoc, graph), reason };
    }
  }

  const nextDoc = updateOperation(doc, symbol.id, { switchState: nextState, tripped: false });
  const reason = `${symbol.type} ${symbol.id} ${nextState}`;
  return { doc: addOperationEvent(nextDoc, reason, symbol.id), state: deriveOperationState(nextDoc, graph), reason };
}

function updateOperation(doc: DrawingDocument, symbolId: string, patch: ElectricalSymbol['operation']): DrawingDocument {
  return {
    ...doc,
    objects: {
      ...doc.objects,
      symbols: doc.objects.symbols.map((symbol) =>
        symbol.id === symbolId ? { ...symbol, operation: { ...symbol.operation, ...patch } } : symbol
      )
    }
  };
}

function addOperationEvent(doc: DrawingDocument, message: string, targetObjectId?: string, reason?: string): DrawingDocument {
  return {
    ...doc,
    operationEvents: [
      ...doc.operationEvents,
      { id: `event-${Date.now()}-${Math.floor(Math.random() * 9999)}`, timestamp: new Date().toISOString(), message, targetObjectId, reason }
    ]
  };
}
