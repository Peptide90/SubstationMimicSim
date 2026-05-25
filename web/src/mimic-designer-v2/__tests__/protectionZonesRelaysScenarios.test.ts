import { describe, expect, it } from 'vitest';
import type { DrawingDocument, ElectricalSymbol, Phase, RelaySettings } from '../drawing/model';
import { addFault, createFault } from '../faults/faults';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { deriveSimulationState } from '../simulation/powerFlow';
import { applyRelayProtectionStep, deriveRelayRuntime, loadScenario } from '../simulation/protection';
import { buildGraph } from '../topology/graph';
import { deriveOperationState } from '../topology/operation';

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

function relay(patch: Partial<RelaySettings> = {}): RelaySettings {
  return {
    id: 'relay-1',
    name: 'OC/EF feeder relay',
    zoneId: 'zone-1',
    type: 'overcurrent',
    enabled: true,
    phases,
    pickupCurrentA: 1,
    timeDelayMs: 100,
    directional: false,
    tripTargetBreakerIds: ['cb-1'],
    backupTripTargetBreakerIds: ['cb-backup'],
    breakerFailEnabled: true,
    breakerFailDelayMs: 100,
    state: 'idle',
    ...patch
  };
}

function doc(extra: Partial<DrawingDocument> = {}): DrawingDocument {
  return migrateDrawingDocument({
    id: 'doc-protection',
    version: 2,
    name: 'Protection test',
    activeView: 'single-line',
    objects: {
      symbols: [
        symbol({
          id: 'source-1',
          type: 'source',
          position: { x: 0, y: 0 },
          terminals: [{ id: 'out', name: 'out', offset: { x: 40, y: 0 }, phaseApplicability: phases }],
          voltageLevelKv: 132,
          powerFlow: { mw: 30, mvar: 15, voltageKv: 132 },
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
          operation: { switchState: 'closed', tripped: false }
        }),
        symbol({
          id: 'cb-backup',
          type: 'circuit-breaker',
          position: { x: 190, y: 0 },
          terminals: [
            { id: 'in', name: 'in', offset: { x: -30, y: 0 }, phaseApplicability: phases },
            { id: 'out', name: 'out', offset: { x: 30, y: 0 }, phaseApplicability: phases }
          ],
          operation: { switchState: 'closed', tripped: false }
        }),
        symbol({
          id: 'ct-1',
          type: 'ct',
          position: { x: 110, y: 0 },
          terminals: [
            { id: 'in', name: 'in', offset: { x: -20, y: 0 }, phaseApplicability: phases },
            { id: 'out', name: 'out', offset: { x: 20, y: 0 }, phaseApplicability: phases }
          ]
        }),
        symbol({
          id: 'vt-1',
          type: 'vt',
          position: { x: 130, y: 30 },
          terminals: [{ id: 'tap', name: 'tap', offset: { x: 0, y: -30 }, phaseApplicability: phases }]
        })
      ],
      busbars: [{
        id: 'feeder-1',
        type: 'busbar-segment',
        rotation: 0,
        phaseApplicability: phases,
        vertices: [{ x: 40, y: 0 }, { x: 100, y: 0 }, { x: 130, y: 0 }, { x: 160, y: 0 }, { x: 220, y: 0 }],
        width: 8,
        connectionPoints: [
          { id: 'p0', position: { x: 40, y: 0 } },
          { id: 'p1', position: { x: 100, y: 0 } },
          { id: 'p2', position: { x: 130, y: 0 } },
          { id: 'p3', position: { x: 160, y: 0 } },
          { id: 'p4', position: { x: 220, y: 0 } }
        ]
      }],
      conductors: [],
      labels: [],
      annotations: []
    },
    protectionZones: [{
      id: 'zone-1',
      name: 'Feeder zone',
      vertices: [{ x: 30, y: -50 }, { x: 230, y: -50 }, { x: 230, y: 50 }, { x: 30, y: 50 }],
      assignedObjectIds: ['feeder-1', 'ct-1', 'vt-1', 'cb-1'],
      ctInputIds: ['ct-1'],
      vtInputIds: ['vt-1'],
      color: '#22c55e',
      visible: true
    }],
    relays: [relay()],
    ...extra
  })!;
}

function derive(doc: DrawingDocument) {
  const graph = buildGraph(doc);
  const operation = deriveOperationState(doc, graph);
  return deriveSimulationState(doc, graph, operation);
}

describe('protection zones, relays, trip sequencing, and scenarios', () => {
  it('preserves zone CT/VT input assignment through migration', () => {
    const migrated = doc();
    expect(migrated.protectionZones[0].ctInputIds).toEqual(['ct-1']);
    expect(migrated.protectionZones[0].vtInputIds).toEqual(['vt-1']);
  });

  it('migrates relay manager inputs, functions, and output actions', () => {
    const migrated = doc({
      relays: [relay({
        role: 'backup',
        inputs: [
          { id: 'input-ct', sourceType: 'ct', sourceObjectId: 'ct-1', sourceLabel: 'CT1', phases, quantity: 'current', ctRatio: '800/1' },
          { id: 'input-vt', sourceType: 'vt', sourceObjectId: 'vt-1', sourceLabel: 'VT1', phases, quantity: 'voltage', vtRatio: '132000/110' }
        ],
        functions: [
          { id: 'fn-oc', type: 'overcurrent', enabled: true, pickupThreshold: 1, timeDelayMs: 100, instantaneous: false, phases, requiredInputType: 'current', logic: 'any-phase', state: 'inactive' },
          { id: 'fn-diff', type: 'differential', enabled: true, pickupThreshold: 1, timeDelayMs: 100, instantaneous: false, phases, requiredInputType: 'differential-current', logic: 'differential-between-inputs', state: 'inactive' }
        ],
        outputActions: [{ id: 'out-trip', targetType: 'circuit-breaker', targetObjectId: 'cb-1', action: 'trip-open-breaker' }]
      })]
    });

    expect(migrated.relays[0].role).toBe('backup');
    expect(migrated.relays[0].inputs?.map((input) => input.quantity)).toEqual(['current', 'voltage']);
    expect(migrated.relays[0].functions?.map((fn) => fn.type)).toEqual(['overcurrent', 'differential']);
    expect(migrated.relays[0].outputActions?.[0].targetObjectId).toBe('cb-1');
  });

  it('picks up and trips the target breaker for overcurrent after delay', () => {
    const base = doc({ relays: [relay({ pickedUpAt: new Date(0).toISOString() })] });
    const simulation = derive(base);
    const runtime = deriveRelayRuntime(base, simulation, 200);
    const stepped = applyRelayProtectionStep(base, simulation, 200).doc;
    const breaker = stepped.objects.symbols.find((item) => item.id === 'cb-1');

    expect(runtime.get('relay-1')?.pickedUp).toBe(true);
    expect(breaker?.operation?.switchState).toBe('open');
    expect(stepped.operationEvents.some((event) => event.message.includes('Relay trip opened cb-1'))).toBe(true);
  });

  it('earth fault relay picks up for a fault inside its zone', () => {
    const faulted = addFault(doc({ relays: [relay({ type: 'earth-fault', pickupCurrentA: 9999 })] }), createFault('feeder-1', 'A-E'));
    const runtime = deriveRelayRuntime(faulted, derive(faulted), 0);

    expect(runtime.get('relay-1')?.pickedUp).toBe(true);
    expect(runtime.get('relay-1')?.reason).toContain('pickup');
  });

  it('detects breaker fail and sends a backup trip after the breaker fail delay', () => {
    const failed = doc({
      relays: [relay({ pickedUpAt: new Date(0).toISOString() })],
      objects: {
        ...doc().objects,
        symbols: doc().objects.symbols.map((item) => item.id === 'cb-1' ? { ...item, simulation: { ...item.simulation, damaged: true } } : item)
      }
    });
    const stepped = applyRelayProtectionStep(failed, derive(failed), 250).doc;
    const primary = stepped.objects.symbols.find((item) => item.id === 'cb-1');
    const backup = stepped.objects.symbols.find((item) => item.id === 'cb-backup');

    expect(primary?.operation?.switchState).toBe('closed');
    expect(backup?.operation?.switchState).toBe('open');
    expect(stepped.operationEvents.some((event) => event.message.includes('Breaker fail detected'))).toBe(true);
    expect(stepped.operationEvents.some((event) => event.message.includes('Backup trip opened cb-backup'))).toBe(true);
  });

  it('loads a scenario with initial states, faults, relays, and objectives', () => {
    const base = doc({
      scenarios: [{
        id: 'scenario-1',
        name: 'Feeder EF trip',
        initialSwitchStates: { 'cb-1': 'closed' },
        initialSourceStates: { 'source-1': true },
        faults: [createFault('feeder-1', 'A-E')],
        relays: [relay({ type: 'earth-fault' })],
        objectives: [{ id: 'obj-1', text: 'Trip CB1' }]
      }],
      relays: []
    });
    const loaded = loadScenario(base, 'scenario-1', 1000);

    expect(loaded.activeScenarioId).toBe('scenario-1');
    expect(loaded.faults[0].type).toBe('A-E');
    expect(loaded.relays[0].type).toBe('earth-fault');
    expect(loaded.objects.symbols.find((item) => item.id === 'cb-1')?.operation?.switchState).toBe('closed');
    expect(loaded.operationEvents.at(-1)?.message).toContain('Scenario loaded');
  });
});
