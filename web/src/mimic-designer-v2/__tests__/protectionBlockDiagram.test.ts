import { describe, expect, it } from 'vitest';
import type { DrawingDocument } from '../drawing/model';
import { addFault, createFault } from '../faults/faults';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { buildProtectionBlockDiagram, layoutBlockDiagram } from '../secondary/protectionBlockDiagram';
import { deriveSimulationState } from '../simulation/powerFlow';
import { applyRelayProtectionStep } from '../simulation/protection';
import { templateLibrary } from '../templates';
import { buildGraph } from '../topology/graph';
import { deriveOperationState } from '../topology/operation';

const example = (id: string): DrawingDocument => migrateDrawingDocument(templateLibrary.find((t) => t.id === id)!.create())!;
const derive = (doc: DrawingDocument) => {
  const graph = buildGraph(doc);
  return deriveSimulationState(doc, graph, deriveOperationState(doc, graph));
};

/**
 * Earth-fault the feeder and let the real protection engine pick up, then trip
 * after its delay. (Faults do not raise current in this engine — there is no
 * fault-level calculation yet — so an overcurrent relay would not see one.)
 */
function tripped(doc: DrawingDocument): DrawingDocument {
  let next = addFault(doc, createFault('ex-earth-fault-ct-ds2', 'A-E'));
  next = applyRelayProtectionStep(next, derive(next), 0).doc;
  next = applyRelayProtectionStep(next, derive(next), 1000).doc;
  return next;
}

describe('protection block diagram', () => {
  it('reads left to right as the engine evaluates: measures, functions, relay, outputs, plant', () => {
    const diagram = buildProtectionBlockDiagram(example('example-overcurrent-trip'), 'Apprentice');
    expect(diagram.columns).toEqual(['measure', 'function', 'relay', 'output', 'plant']);
    const byColumn = (column: string) => diagram.blocks.filter((block) => block.column === column).map((block) => `${block.label} | ${block.detail ?? ''}`);
    expect(byColumn('measure')[0]).toMatch(/zone of \d+ items/);
    expect(byColumn('function')).toEqual(['Overcurrent | pickup 500 A · 500 ms']);
    expect(byColumn('relay')[0]).toMatch(/^OC Relay/);
    expect(byColumn('output')).toContain('Trip | ');
    expect(byColumn('plant')[0]).toMatch(/^PROT CB/);
  });

  it('cross-references plant blocks to the drawing', () => {
    const doc = example('example-overcurrent-trip');
    const plant = buildProtectionBlockDiagram(doc).blocks.filter((block) => block.column === 'plant');
    for (const block of plant) expect(doc.objects.symbols.some((symbol) => symbol.id === block.objectId)).toBe(true);
  });

  it('shows a real trip travelling through it', () => {
    const before = buildProtectionBlockDiagram(example('example-earth-fault-trip'));
    expect(before.links.some((link) => link.active)).toBe(false);

    const after = buildProtectionBlockDiagram(tripped(example('example-earth-fault-trip')));
    expect(after.blocks.find((block) => block.column === 'relay')?.state).toBe('tripped');
    expect(after.blocks.find((block) => block.column === 'plant')?.state).toBe('open');
    const tripPath = after.links.filter((link) => link.active).map((link) => `${link.from.split(':')[0]}>${link.to.split(':')[0]}`);
    expect(tripPath).toEqual(expect.arrayContaining(['function>relay', 'relay>output', 'output>plant']));
  });

  it('draws breaker-fail backup tripping to the backup breaker', () => {
    const diagram = buildProtectionBlockDiagram(example('example-breaker-fail-backup'));
    const backup = diagram.blocks.find((block) => block.label === 'Breaker fail backup trip');
    expect(backup).toBeDefined();
    expect(diagram.links.some((link) => link.from === backup!.id && link.to === 'plant:ex-bf-backup-cb')).toBe(true);
  });

  it('simplifies for the youngest tiers without changing what it says', () => {
    const doc = tripped(example('example-earth-fault-trip'));
    const simple = buildProtectionBlockDiagram(doc, 'Junior');
    expect(simple.columns).toEqual(['measure', 'relay', 'plant']);
    expect(simple.blocks.some((block) => block.column === 'function' || block.column === 'output')).toBe(false);
    expect(simple.blocks.find((block) => block.column === 'relay')?.detail).toBe('switched off the circuit');
    expect(simple.links.filter((link) => link.active).length).toBeGreaterThan(0);
  });

  it('says so when a relay watches the whole network, rather than inventing a CT', () => {
    const doc = example('example-overcurrent-trip');
    const unzoned = { ...doc, relays: doc.relays.map((relay) => ({ ...relay, zoneId: undefined, inputs: [] })) };
    const diagram = buildProtectionBlockDiagram(unzoned);
    expect(diagram.blocks.find((block) => block.column === 'measure')?.label).toBe('Whole network');
    expect(diagram.notes[0]).toMatch(/watches the whole network/);
  });

  it('is empty, not broken, on a drawing without protection', () => {
    const diagram = buildProtectionBlockDiagram(example('template-simple-radial-feeder'));
    expect(diagram.blocks).toEqual([]);
    expect(layoutBlockDiagram(diagram).blocks).toEqual([]);
  });

  it('lays blocks out in non-overlapping columns', () => {
    const { blocks } = layoutBlockDiagram(buildProtectionBlockDiagram(example('example-breaker-fail-backup')));
    for (const a of blocks) for (const b of blocks) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  });
});
