import { describe, expect, it } from 'vitest';
import type { DrawingDocument, ElectricalSymbol } from '../drawing/model';
import { addFault, clearFault, createFault, expireTransientFaults } from '../faults/faults';
import { computePowerFlow, migrateDrawingDocument } from '../schema/documentSchema';
import { renderBusbarsForView, renderSymbolsForView } from '../rendering/phaseExpansion';

const cb: ElectricalSymbol = {
  id: 'cb-1',
  type: 'circuit-breaker',
  position: { x: 100, y: 100 },
  rotation: 0,
  phaseApplicability: ['A', 'B', 'C'],
  phaseMode: 'three-phase',
  renderExpansion: 'per-phase-symbols',
  phaseSpacingPx: 24,
  terminals: [
    { id: 'in', name: 'in', offset: { x: -30, y: 0 }, phaseApplicability: ['A', 'B', 'C'] },
    { id: 'out', name: 'out', offset: { x: 30, y: 0 }, phaseApplicability: ['A', 'B', 'C'] }
  ],
  operation: { switchState: 'open', tripped: false }
};

function doc(activeView: DrawingDocument['activeView']): DrawingDocument {
  return migrateDrawingDocument({
    id: 'doc',
    version: 2,
    name: 'Phase test',
    activeView,
    objects: {
      symbols: [cb],
      busbars: [{
        id: 'bus-1',
        type: 'busbar-segment',
        rotation: 0,
        phaseApplicability: ['A', 'B', 'C'],
        phaseMode: 'three-phase',
        renderExpansion: 'per-phase-symbols',
        vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        width: 8,
        connectionPoints: [
          { id: 'a', position: { x: 0, y: 0 } },
          { id: 'b', position: { x: 100, y: 0 } }
        ]
      }],
      conductors: [],
      labels: [],
      annotations: []
    }
  })!;
}

describe('phase expansion, power metadata, and faults', () => {
  it('renders one canonical CB in single-line and three linked instances in three-phase', () => {
    expect(renderSymbolsForView(doc('single-line')).map((item) => item.id)).toEqual(['cb-1']);
    const expanded = renderSymbolsForView(doc('three-phase'));
    expect(expanded.map((item) => item.id)).toEqual(['cb-1:phase:A', 'cb-1:phase:B', 'cb-1:phase:C']);
    expect(new Set(expanded.map((item) => item.canonicalId))).toEqual(new Set(['cb-1']));
  });

  it('renders three-phase busbars as one line in single-line and three lanes in three-phase', () => {
    expect(renderBusbarsForView(doc('single-line'))).toHaveLength(1);
    const expanded = renderBusbarsForView(doc('three-phase'));
    expect(expanded).toHaveLength(3);
    expect(expanded.map((item) => item.phase)).toEqual(['A', 'B', 'C']);
  });

  it('offsets three-phase lanes perpendicular to a vertically placed symbol', () => {
    const verticalCb = { ...cb, rotation: 90, phaseSpacingPx: 150 };
    const phaseDoc = migrateDrawingDocument({ ...doc('three-phase'), objects: { ...doc('three-phase').objects, symbols: [verticalCb] } })!;
    const expanded = renderSymbolsForView(phaseDoc);
    expect(expanded.map((item) => item.position.x).sort((a, b) => a - b)).toEqual([100 - 150, 100, 100 + 150]);
    expect(new Set(expanded.map((item) => item.position.y))).toEqual(new Set([100]));
  });

  it('renders a phase-specific VT only on its configured lane', () => {
    const vt = { ...cb, id: 'vt-b', type: 'vt' as const, phaseApplicability: ['B' as const], terminals: [{ id: 'tap', name: 'tap', offset: { x: 0, y: 20 }, phaseApplicability: ['B' as const] }] };
    const phaseDoc = migrateDrawingDocument({ ...doc('three-phase'), objects: { ...doc('three-phase').objects, symbols: [vt] } })!;
    const rendered = renderSymbolsForView(phaseDoc);
    expect(rendered).toHaveLength(1);
    expect(rendered[0].phases).toEqual(['B']);
  });

  it('calculates MVA and power factor from MW and MVAR', () => {
    const flow = computePowerFlow({ mw: 3, mvar: 4, direction: 'forward' });
    expect(flow?.mva).toBe(5);
    expect(flow?.powerFactor).toBe(0.6);
  });

  it('adds, clears, and expires faults with event log entries', () => {
    const base = doc('single-line');
    const faulted = addFault(base, createFault('bus-1', 'persistent', { x: 50, y: 0 }));
    expect(faulted.faults[0].active).toBe(true);
    expect(faulted.operationEvents.at(-1)?.message).toContain('Fault applied');
    const cleared = clearFault(faulted, faulted.faults[0].id);
    expect(cleared.faults[0].active).toBe(false);

    const transient = createFault('bus-1', 'transient', { x: 50, y: 0 });
    transient.createdAt = new Date(Date.now() - 2000).toISOString();
    transient.durationMs = 500;
    const expired = expireTransientFaults(addFault(base, transient), Date.now());
    expect(expired.faults[0].active).toBe(false);
    expect(expired.operationEvents.at(-1)?.message).toContain('expired');
  });
});
