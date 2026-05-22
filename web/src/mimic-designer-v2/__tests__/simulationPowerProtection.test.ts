import { describe, expect, it } from 'vitest';
import type { DrawingDocument, ElectricalSymbol, Phase } from '../drawing/model';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { buildGraph } from '../topology/graph';
import { deriveOperationState } from '../topology/operation';
import { applyProtectionStep, deriveSimulationState, mergePhaseValues } from '../simulation/powerFlow';
import { addFault, createFault } from '../faults/faults';

const phases = ['A', 'B', 'C'] as Phase[];

const symbol = (patch: Partial<ElectricalSymbol> & Pick<ElectricalSymbol, 'id' | 'type' | 'position' | 'terminals'>): ElectricalSymbol => ({
  rotation: 0,
  phaseApplicability: phases,
  phaseMode: 'three-phase',
  renderExpansion: 'per-phase-symbols',
  phaseSpacingPx: 24,
  simulation: {},
  operation: { tripped: false },
  ...patch
});

function feederDoc(cbState: 'open' | 'closed' = 'closed'): DrawingDocument {
  return migrateDrawingDocument({
    id: 'doc-sim',
    version: 2,
    name: 'Simulation test',
    activeView: 'three-phase',
    objects: {
      symbols: [
        symbol({
          id: 'source-1',
          type: 'source',
          position: { x: 0, y: 0 },
          terminals: [{ id: 'out', name: 'out', offset: { x: 40, y: 0 }, phaseApplicability: phases }],
          voltageLevelKv: 132,
          powerFlow: { mw: 30, mvar: 15, voltageKv: 132, direction: 'forward' },
          operation: { sourceOn: true, tripped: false }
        }),
        symbol({
          id: 'cb-1',
          type: 'circuit-breaker',
          position: { x: 70, y: 0 },
          terminals: [
            { id: 'in', name: 'in', offset: { x: -30, y: 0 }, phaseApplicability: phases },
            { id: 'out', name: 'out', offset: { x: 30, y: 0 }, phaseApplicability: phases }
          ],
          operation: { switchState: cbState, tripped: false }
        }),
        symbol({
          id: 'load-1',
          type: 'load',
          position: { x: 220, y: 0 },
          terminals: [{ id: 'in', name: 'in', offset: { x: -40, y: 0 }, phaseApplicability: phases }]
        })
      ],
      busbars: [{
        id: 'bus-1',
        type: 'busbar-segment',
        rotation: 0,
        phaseApplicability: phases,
        vertices: [{ x: 100, y: 0 }, { x: 180, y: 0 }],
        width: 8,
        powerFlow: { resistanceOhms: 0.02, reactanceOhms: 0.04 },
        connectionPoints: [
          { id: 'bus-1-cp-0', position: { x: 100, y: 0 } },
          { id: 'bus-1-cp-1', position: { x: 180, y: 0 } }
        ]
      }],
      conductors: [],
      labels: [],
      annotations: []
    }
  })!;
}

function derive(doc: DrawingDocument) {
  const graph = buildGraph(doc);
  const operation = deriveOperationState(doc, graph);
  return deriveSimulationState(doc, graph, operation);
}

describe('phase-resolved simulation foundation', () => {
  it('derives source power through a closed breaker and downstream busbar', () => {
    const simulation = derive(feederDoc('closed'));
    const bus = simulation.objectSummaries.get('bus-1');
    const cb = simulation.objectSummaries.get('cb-1');

    expect(cb?.phases.A?.mw).toBeCloseTo(10);
    expect(bus?.phases.A?.currentA).toBeGreaterThan(0);
    expect(bus?.aggregate.mw).toBeCloseTo(30);
  });

  it('does not derive downstream busbar flow through an open breaker', () => {
    const simulation = derive(feederDoc('open'));
    expect(simulation.objectSummaries.get('bus-1')).toBeUndefined();
  });

  it('stores phase-specific edits without changing the other phases', () => {
    const flow = mergePhaseValues({ mw: 9, mvar: 3 }, 'B', { resistanceOhms: 0.5, mw: 5 }, false);
    expect(flow.perPhase?.B?.resistanceOhms).toBe(0.5);
    expect(flow.perPhase?.B?.mw).toBe(5);
    expect(flow.perPhase?.A).toBeUndefined();
    expect(flow.mw).toBe(9);
  });

  it('phase-earth faults only mark matching phase branches as faulted', () => {
    const doc = addFault(feederDoc('closed'), { ...createFault('bus-1', 'A-E'), phases: ['A'], targetPhase: 'A' });
    const graph = buildGraph(doc);
    const operation = deriveOperationState(doc, graph);
    const faultedBusBranches = graph.branches.filter((branch) => branch.objectId === 'bus-1' && operation.faultBranchIds.has(branch.id));

    expect(faultedBusBranches.every((branch) => branch.phases.includes('A'))).toBe(true);
  });

  it('hot joints raise only the affected phase thermal estimate', () => {
    const doc = migrateDrawingDocument({
      ...feederDoc('closed'),
      hotJoints: [{
        id: 'hj-1',
        targetObjectId: 'bus-1',
        phase: 'C',
        addedResistanceOhms: 1,
        thermalMassFactor: 1,
        ambientTemperatureC: 20,
        warningTemperatureC: 21,
        dangerTemperatureC: 30,
        intermittent: false,
        active: true
      }]
    })!;
    const simulation = derive(doc);
    const joint = simulation.hotJointTemperatures.get('hj-1');

    expect(joint?.phase).toBe('C');
    expect(joint?.temperatureC).toBeGreaterThan(20);
  });

  it('overcurrent protection picks up and trips its target breaker after delay', () => {
    const doc = migrateDrawingDocument({
      ...feederDoc('closed'),
      protection: [{
        id: 'oc-1',
        type: 'overcurrent',
        enabled: true,
        watchedObjectId: 'bus-1',
        phases,
        pickupCurrentA: 1,
        timeDelayMs: 100,
        tripTargetBreakerIds: ['cb-1'],
        state: 'idle',
        pickedUpAt: new Date(0).toISOString()
      }]
    })!;
    const simulation = derive(doc);
    const tripped = applyProtectionStep(doc, simulation, 200);
    const breaker = tripped.objects.symbols.find((item) => item.id === 'cb-1');

    expect(simulation.protectionStates.get('oc-1')?.pickedUp).toBe(true);
    expect(breaker?.operation?.switchState).toBe('open');
    expect(breaker?.operation?.tripped).toBe(true);
  });
});
