import { describe, expect, it } from 'vitest';
import type { DrawingDocument } from '../drawing/model';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { createBaseDocument } from '../templates/factory';
import { extractTopology } from '../topology/extractTopology';
import { deriveOperationState, operateDevice } from '../topology/operation';
import { buildRun, link } from '../scenarios/exerciseLayout';
import { symbolsInIsland } from '../scenarios/buildObjectives';

const docOf = (parts: Pick<ReturnType<typeof buildRun>, 'symbols' | 'conductors'>[]): DrawingDocument =>
  migrateDrawingDocument(createBaseDocument('layout-test', 'layout', {
    objects: { symbols: parts.flatMap((p) => p.symbols), conductors: parts.flatMap((p) => p.conductors), busbars: [], labels: [], annotations: [] }
  }))!;

const live = (doc: DrawingDocument, id: string) => {
  const topology = extractTopology(doc);
  const state = deriveOperationState(doc, topology);
  return topology.terminals.filter((t) => t.parentObjectId === id).flatMap((t) => t.connectedNodeIds).some((n) => state.liveNodeIds.has(n));
};

describe('buildRun', () => {
  const row = () => buildRun('r', { x: 80, y: 200 }, [
    { kind: 'device', id: 'src', type: 'source', label: 'SRC' },
    { kind: 'tap', id: 'es1', type: 'earth-switch', label: 'ES1' },
    { kind: 'device', id: 'ds1', type: 'disconnector', label: 'DS1', closed: true },
    { kind: 'device', id: 'cb', type: 'circuit-breaker', label: 'CB', closed: true },
    { kind: 'device', id: 'ct', type: 'ct', label: 'CT' },
    { kind: 'device', id: 'ds2', type: 'disconnector', label: 'DS2', closed: true },
    { kind: 'tap', id: 'es2', type: 'earth-switch', label: 'ES2' },
    { kind: 'tap', id: 'vt', type: 'vt', label: 'VT' },
    { kind: 'device', id: 'load', type: 'load', label: 'LOAD' }
  ]);

  it('produces a drawing whose load is live through closed switchgear', () => {
    expect(live(docOf([row()]), 'load')).toBe(true);
  });

  it('de-energises the load when the breaker opens', () => {
    const doc = docOf([row()]);
    const opened = operateDevice(doc, extractTopology(doc), 'cb').doc;
    expect(live(opened, 'load')).toBe(false);
  });

  it('connects every tap, including the VT', () => {
    const doc = docOf([row()]);
    const island = symbolsInIsland(doc, extractTopology(doc), 'src').map((s) => s.id).sort();
    expect(island).toEqual(['cb', 'ct', 'ds1', 'ds2', 'es1', 'es2', 'load', 'src', 'vt']);
  });

  it('wires earth taps electrically: closing a live earth arcs', () => {
    const doc = docOf([row()]);
    expect(operateDevice(doc, extractTopology(doc), 'es2').reason).toMatch(/arced/);
  });

  it('builds vertical columns the same way', () => {
    const column = buildRun('c', { x: 300, y: 80 }, [
      { kind: 'device', id: 'csrc', type: 'source', label: 'SRC' },
      { kind: 'device', id: 'cds', type: 'disconnector', label: 'DS', closed: true },
      { kind: 'device', id: 'ccb', type: 'circuit-breaker', label: 'CB', closed: true },
      { kind: 'device', id: 'cload', type: 'load', label: 'LOAD' }
    ], { axis: 'y' });
    const doc = docOf([column]);
    expect(live(doc, 'cload')).toBe(true);
    expect(live(operateDevice(doc, extractTopology(doc), 'ccb').doc, 'cload')).toBe(false);
  });

  it('carries supply through a transformer to a lower-voltage load', () => {
    const run = buildRun('t', { x: 80, y: 200 }, [
      { kind: 'device', id: 'tsrc', type: 'source', label: 'SRC' },
      { kind: 'device', id: 'tcb', type: 'circuit-breaker', label: 'CB', closed: true },
      { kind: 'device', id: 'ttx', type: 'transformer', label: 'TX' },
      { kind: 'device', id: 'tload', type: 'load', label: 'LV', kv: 33 }
    ]);
    expect(live(docOf([run]), 'tload')).toBe(true);
  });

  it('joins two runs with a link at a tee', () => {
    const a = buildRun('a', { x: 80, y: 100 }, [
      { kind: 'device', id: 'asrc', type: 'source', label: 'SRC' },
      { kind: 'device', id: 'acb', type: 'circuit-breaker', label: 'CB', closed: true },
      { kind: 'tee', id: 'a-tee' },
      { kind: 'device', id: 'aload', type: 'load', label: 'A' }
    ]);
    const b = buildRun('b', { x: 80, y: 300 }, [
      { kind: 'tee', id: 'b-tee' },
      { kind: 'device', id: 'bload', type: 'load', label: 'B' }
    ]);
    // b has no source of its own; it is live only through the link.
    const joined = { symbols: [], conductors: [link('ab', a.points['a-tee'], b.points['b-tee'])] };
    expect(live(docOf([a, b]), 'bload')).toBe(false);
    expect(live(docOf([a, b, joined]), 'bload')).toBe(true);
  });
});
