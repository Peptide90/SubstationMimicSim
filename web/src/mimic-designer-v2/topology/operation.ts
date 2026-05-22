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
  const earthed = trace(graph, symbolById, [...earthRoots, ...faultEarthRoots]);
  const faultNodeIds = new Set([...live.nodes].filter((nodeId) => earthed.nodes.has(nodeId)));
  const faultBranchIds = new Set([
    ...[...live.branches].filter((branchId) => earthed.branches.has(branchId)),
    ...doc.faults.filter((fault) => fault.active && fault.targetObjectId).flatMap((fault) => graph.branches.filter((branch) => branch.objectId === fault.targetObjectId && branch.phases.some((phase) => fault.phases.includes(phase))).map((branch) => branch.id))
  ]);
  return {
    liveNodeIds: live.nodes,
    liveBranchIds: live.branches,
    earthedNodeIds: earthed.nodes,
    earthedBranchIds: earthed.branches,
    faultNodeIds,
    faultBranchIds,
    activeFaultIds: new Set(doc.faults.filter((fault) => fault.active).map((fault) => fault.id))
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
      const reason = `Breaker ${symbol.id} tripped: live/earthed conflict`;
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
