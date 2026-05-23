import { beforeEach, describe, expect, it } from 'vitest';
import { builtInScenarioPackages } from '../scenarios/builtInScenarios';
import { createScenarioFromDrawing } from '../scenarios/packageScenario';
import { duplicateScenario, listScenarioPackages, loadScenarioPackage, saveScenarioPackage } from '../scenarios/scenarioStore';
import { evaluateScenario, nextScenarioHint, recordScenarioOperation, startScenario, tickScenario } from '../scenarios/runner';
import { builtInTemplates, createDrawingFromTemplate } from '../templates';
import type { OperationEvent } from '../drawing/model';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
});

describe('Mimic Designer V2 scenario packaging', () => {
  it('saves and loads scenario packages separately from drawings', () => {
    const doc = createDrawingFromTemplate(builtInTemplates[0], 'Scenario feeder');
    const pkg = saveScenarioPackage(createScenarioFromDrawing(doc, { name: 'Feeder lesson' }));

    expect(listScenarioPackages()).toHaveLength(1);
    expect(loadScenarioPackage(pkg.id)?.title).toBe('Feeder lesson');
  });

  it('duplicates a scenario as an editable copy', () => {
    const saved = saveScenarioPackage(createScenarioFromDrawing(createDrawingFromTemplate(builtInTemplates[0]), { name: 'Original scenario' }));
    const copy = duplicateScenario(saved.id, 'Editable copy');

    expect(copy?.id).not.toBe(saved.id);
    expect(copy?.title).toBe('Editable copy');
  });

  it('resets initial switch, source, fault, relay, protection, power, and active state', () => {
    const doc = createDrawingFromTemplate(builtInTemplates[0]);
    const pkg = createScenarioFromDrawing(doc, {
      initialSwitchStates: { 'radial-cb': 'open' },
      initialSourceStates: { 'radial-source': false },
      activeView: 'three-phase'
    });
    const result = startScenario(doc, pkg.scenario);
    const cb = result.doc.objects.symbols.find((symbol) => symbol.id === 'radial-cb');
    const source = result.doc.objects.symbols.find((symbol) => symbol.id === 'radial-source');

    expect(cb?.operation?.switchState).toBe('open');
    expect(source?.operation?.sourceOn).toBe(false);
    expect(result.doc.activeScenarioId).toBe(pkg.scenario.id);
  });

  it('fires scheduled faults on the event timeline', () => {
    const doc = createDrawingFromTemplate(builtInTemplates[0]);
    const pkg = createScenarioFromDrawing(doc, {
      events: [{ id: 'event-fault', type: 'scheduled-fault', atMs: 1000, fault: { id: 'fault-1', targetObjectId: 'radial-bus', type: 'A-E', phases: ['A'], targetPhase: 'A', persistent: true, active: false, createdAt: new Date(0).toISOString() } }]
    });
    const result = tickScenario(doc, pkg.scenario, 1000);

    expect(result.doc.faults.some((fault) => fault.id === 'fault-1' && fault.active)).toBe(true);
    expect(result.scenario.events?.[0].fired).toBe(true);
  });

  it('marks objective success when the target busbar is energised', () => {
    const doc = createDrawingFromTemplate(builtInTemplates[0]);
    const pkg = createScenarioFromDrawing(doc, {
      objectives: [{ id: 'obj-live', text: 'Energise bus', type: 'energise-target-busbar', targetObjectId: 'radial-bus', targetState: 'live' }]
    });
    const result = evaluateScenario(doc, pkg.scenario);

    expect(result.objectives[0].completed).toBe(true);
    expect(result.success).toBe(true);
  });

  it('fails maintain-no-live-earth-conflict when live and earth conflict', () => {
    const doc = createDrawingFromTemplate(builtInTemplates[0]);
    const conflictDoc = {
      ...doc,
      objects: {
        ...doc.objects,
        symbols: doc.objects.symbols.map((symbol) => symbol.id === 'radial-es' ? { ...symbol, operation: { ...symbol.operation, switchState: 'closed' as const } } : symbol)
      }
    };
    const pkg = createScenarioFromDrawing(conflictDoc, {
      objectives: [{ id: 'obj-no-conflict', text: 'No live-earth conflict', type: 'maintain-no-live-earth-conflict', targetObjectId: 'radial-es' }],
      failureRules: { requireNoLiveEarthConflict: true }
    });
    const result = evaluateScenario(conflictDoc, pkg.scenario);

    expect(result.failed).toBe(true);
    expect(result.objectives[0].failed).toBe(true);
  });

  it('displays hints and records replay operations', () => {
    const pkg = createScenarioFromDrawing(createDrawingFromTemplate(builtInTemplates[0]), {
      objectives: [{ id: 'obj-hint', text: 'Use hint', type: 'operate-switchgear', targetObjectId: 'radial-cb', targetState: 'open', hint: 'Open the CB first.' }]
    });
    const hint = nextScenarioHint(pkg.scenario);
    const event: OperationEvent = { id: 'op-1', timestamp: new Date(0).toISOString(), message: 'CB operated', targetObjectId: 'radial-cb' };
    const replayed = recordScenarioOperation(hint.scenario, event);

    expect(hint.hint).toBe('Open the CB first.');
    expect(replayed.replayLog?.some((step) => step.message === 'CB operated')).toBe(true);
  });

  it('loads built-in scenario packages', () => {
    expect(builtInScenarioPackages.map((pkg) => pkg.title)).toEqual(expect.arrayContaining([
      'Basic feeder energisation',
      'Breaker fail with backup trip',
      'Bus coupler restoration'
    ]));
  });
});
