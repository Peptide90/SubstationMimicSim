import { describe, expect, it } from 'vitest';
import type { DrawingDocument, ElectricalSymbol } from '../drawing/model';
import { buildGraph } from '../topology/graph';
import { deriveOperationState, operateDevice } from '../topology/operation';
import { migrateDrawingDocument } from '../schema/documentSchema';

const symbol = (patch: Partial<ElectricalSymbol> & Pick<ElectricalSymbol, 'id' | 'type' | 'position' | 'terminals'>): ElectricalSymbol => ({
  rotation: 0,
  phaseApplicability: ['A', 'B', 'C'],
  simulation: {},
  operation: { tripped: false },
  ...patch
});

const baseDoc = (symbols: ElectricalSymbol[]): DrawingDocument => migrateDrawingDocument({
  id: 'doc',
  version: 2,
  name: 'Topology test',
  activeView: 'single-line',
  objects: { symbols, conductors: [], busbars: [], labels: [], annotations: [] }
})!;

const source = symbol({
  id: 'source-1',
  type: 'source',
  position: { x: 0, y: 0 },
  terminals: [{ id: 'out', name: 'out', offset: { x: 40, y: 0 }, phaseApplicability: ['A', 'B', 'C'] }],
  operation: { sourceOn: true, tripped: false }
});

const breaker = (state: 'open' | 'closed' = 'open') => symbol({
  id: 'cb-1',
  type: 'circuit-breaker',
  position: { x: 70, y: 0 },
  terminals: [
    { id: 'in', name: 'in', offset: { x: -30, y: 0 }, phaseApplicability: ['A', 'B', 'C'] },
    { id: 'out', name: 'out', offset: { x: 30, y: 0 }, phaseApplicability: ['A', 'B', 'C'] }
  ],
  operation: { switchState: state, tripped: false }
});

const load = symbol({
  id: 'load-1',
  type: 'load',
  position: { x: 140, y: 0 },
  terminals: [{ id: 'in', name: 'in', offset: { x: -40, y: 0 }, phaseApplicability: ['A', 'B', 'C'] }]
});

const earthSwitch = (state: 'open' | 'closed' = 'open') => symbol({
  id: 'es-1',
  type: 'earth-switch',
  position: { x: 130, y: 0 },
  terminals: [
    { id: 'in', name: 'in', offset: { x: -30, y: 0 }, phaseApplicability: ['A', 'B', 'C'] },
    { id: 'earth', name: 'earth', offset: { x: 0, y: 25 }, phaseApplicability: ['A', 'B', 'C'] }
  ],
  operation: { switchState: state, tripped: false }
});

describe('Mimic Designer V2 topology and operation', () => {
  it('propagates through a closed breaker connected by busbar tee points', () => {
    const doc = baseDoc([source, breaker('closed'), load]);
    doc.objects.busbars.push({
      id: 'bus-1',
      type: 'busbar-segment',
      rotation: 0,
      phaseApplicability: ['A', 'B', 'C'],
      width: 8,
      vertices: [{ x: 40, y: 0 }, { x: 100, y: 0 }, { x: 180, y: 0 }],
      connectionPoints: [
        { id: 'bus-1-cp-0', position: { x: 40, y: 0 } },
        { id: 'bus-1-cp-1', position: { x: 100, y: 0 } },
        { id: 'bus-1-cp-2', position: { x: 180, y: 0 } }
      ]
    });
    const graph = buildGraph(doc);
    const state = deriveOperationState(doc, graph);
    const loadNodeId = graph.terminals.find((terminal) => terminal.id === 'load-1:in')?.connectedNodeIds[0];

    expect(loadNodeId).toBeTruthy();
    expect(state.liveNodeIds.has(loadNodeId!)).toBe(true);
  });

  it('adds explicit busbar topology nodes for cable tee points on existing busbar spans', () => {
    const doc = baseDoc([]);
    doc.objects.busbars.push({
      id: 'bus-1',
      type: 'busbar-segment',
      rotation: 0,
      phaseApplicability: ['A', 'B', 'C'],
      width: 8,
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      connectionPoints: [
        { id: 'bus-1-cp-0', position: { x: 0, y: 0 } },
        { id: 'bus-1-cp-1', position: { x: 100, y: 0 } }
      ]
    });
    doc.objects.conductors.push({
      id: 'cable-1',
      type: 'conductor-path',
      rotation: 0,
      phaseApplicability: ['A', 'B', 'C'],
      orthogonal: true,
      vertices: [{ x: 50, y: 0 }, { x: 50, y: 60 }],
      connectionPoints: [
        { id: 'cable-1-cp-0', position: { x: 50, y: 0 } },
        { id: 'cable-1-cp-1', position: { x: 50, y: 60 } }
      ]
    });

    const graph = buildGraph(doc);
    const teeNode = graph.nodes.find((node) => node.position.x === 50 && node.position.y === 0);
    const busbarBranchesAtTee = graph.branches.filter((branch) => branch.kind === 'busbar' && (branch.fromNodeId === teeNode?.id || branch.toNodeId === teeNode?.id));

    expect(teeNode?.connectionPointRefs).toContain('cable-1-cp-0');
    expect(teeNode?.connectionPointRefs.some((ref) => ref.startsWith('bus-1:tee:'))).toBe(true);
    expect(busbarBranchesAtTee).toHaveLength(2);
  });

  it('creates phase-specific device internal branches between explicit terminals', () => {
    const doc = baseDoc([breaker('closed')]);
    const graph = buildGraph(doc);
    const internalBranches = graph.branches.filter((branch) => branch.kind === 'device-internal');

    expect(internalBranches).toHaveLength(3);
    expect(internalBranches.map((branch) => branch.phase)).toEqual(['A', 'B', 'C']);
    expect(internalBranches.every((branch) => branch.fromTerminalId?.endsWith(':in'))).toBe(true);
    expect(internalBranches.every((branch) => branch.toTerminalId?.endsWith(':out'))).toBe(true);
  });

  it('keeps single-phase measurement terminals phase-specific', () => {
    const vt = symbol({
      id: 'vt-b',
      type: 'vt',
      position: { x: 200, y: 100 },
      phaseApplicability: ['B'],
      terminals: [{ id: 'tap', name: 'tap', offset: { x: 0, y: 20 }, phaseApplicability: ['B'] }]
    });
    const graph = buildGraph(baseDoc([vt]));
    expect(graph.terminals.find((terminal) => terminal.id === 'vt-b:tap')?.allowedPhases).toEqual(['B']);
  });

  it('blocks traversal through open breakers and allows it when closed', () => {
    const openGraph = buildGraph(baseDoc([source, breaker('open'), load]));
    const openState = deriveOperationState(baseDoc([source, breaker('open'), load]), openGraph);
    const closedDoc = baseDoc([source, breaker('closed'), load]);
    const closedState = deriveOperationState(closedDoc, buildGraph(closedDoc));

    expect(openState.liveNodeIds.size).toBe(1);
    expect(closedState.liveNodeIds.size).toBeGreaterThan(openState.liveNodeIds.size);
  });

  it('trips a breaker closed into a live/earthed conflict', () => {
    const doc = baseDoc([source, breaker('open'), earthSwitch('closed')]);
    const graph = buildGraph(doc);
    const result = operateDevice(doc, graph, 'cb-1');
    const cb = result.doc.objects.symbols.find((item) => item.id === 'cb-1');

    expect(cb?.operation?.switchState).toBe('open');
    expect(cb?.operation?.tripped).toBe(true);
    expect(result.reason).toContain('tripped');
  });
});
