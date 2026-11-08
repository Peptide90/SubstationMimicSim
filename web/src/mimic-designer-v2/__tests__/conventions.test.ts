import { describe, expect, it } from 'vitest';
import type { DrawingDocument } from '../drawing/model';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { conventionOrder, deviceLabel, deviceRoles, formatDeviceLabel, isConventionAvailable } from '../secondary/conventions';
import { buildProtectionBlockDiagram } from '../secondary/protectionBlockDiagram';
import { templateLibrary } from '../templates';

const example = (id: string): DrawingDocument => migrateDrawingDocument(templateLibrary.find((t) => t.id === id)!.create())!;

describe('secondary labelling conventions', () => {
  it('give every role a plain name', () => {
    for (const role of deviceRoles) expect(deviceLabel(role, 'plain').name.length, role).toBeGreaterThan(0);
  });

  it('offer ANSI and IEC, because every role is covered', () => {
    expect(isConventionAvailable('ansi')).toBe(true);
    expect(isConventionAvailable('iec')).toBe(true);
  });

  it('hold back National Grid until its definitions are supplied, rather than guessing', () => {
    expect(isConventionAvailable('ng')).toBe(false);
    expect(deviceLabel('overcurrent', 'ng')).toEqual({ name: 'Overcurrent' });
  });

  it('use the standard device numbers and symbols', () => {
    expect(formatDeviceLabel('overcurrent', 'ansi')).toBe('51 Time overcurrent');
    expect(formatDeviceLabel('output:apply-lockout', 'ansi')).toBe('86 Lockout relay');
    expect(formatDeviceLabel('output:trip-open-breaker', 'ansi')).toBe('94 Tripping relay');
    expect(formatDeviceLabel('breaker-fail', 'ansi')).toBe('50BF Breaker failure');
    expect(formatDeviceLabel('overcurrent', 'iec')).toBe('I> PTOC');
    expect(formatDeviceLabel('differential', 'iec')).toBe('Id> PDIF');
  });

  it('relabel the block diagram without changing its structure', () => {
    const doc = example('example-breaker-fail-backup');
    const shape = (convention: (typeof conventionOrder)[number]) => {
      const diagram = buildProtectionBlockDiagram(doc, 'Engineer', convention);
      return { ids: diagram.blocks.map((block) => block.id), links: diagram.links, labels: diagram.blocks.map((block) => block.label) };
    };
    const plain = shape('plain');
    const ansi = shape('ansi');
    const iec = shape('iec');
    expect(ansi.ids).toEqual(plain.ids);
    expect(iec.links).toEqual(plain.links);
    expect(ansi.labels).toContain('51 Time overcurrent');
    expect(ansi.labels).toContain('50BF Backup trip');
    expect(iec.labels).toContain('I> PTOC');
    expect(plain.labels).toContain('Overcurrent');
  });

  it('is saved with the drawing', () => {
    const doc = example('example-overcurrent-trip');
    const migrated = migrateDrawingDocument({ ...doc, uiState: { ...doc.uiState, secondaryConvention: 'iec' } })!;
    expect(migrated.uiState.secondaryConvention).toBe('iec');
  });
});
