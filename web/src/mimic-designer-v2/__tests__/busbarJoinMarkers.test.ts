import { describe, expect, it } from 'vitest';
import { buildDrawingExportSvg } from '../rendering/drawingExport';
import { busbarJoinMarkers } from '../rendering/busbarJoinMarkers';
import { extractTopology } from '../topology/extractTopology';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { busbar } from '../templates/factory';

describe('busbar join markers', () => {
  it('marks busbars that join at a shared node', () => {
    const doc = migrateDrawingDocument({
      id: 'join-doc',
      version: 2,
      name: 'Join',
      activeView: 'single-line',
      objects: {
        symbols: [],
        conductors: [],
        busbars: [
          busbar('main', [{ x: 100, y: 100 }, { x: 200, y: 100 }]),
          busbar('drop', [{ x: 150, y: 100 }, { x: 150, y: 180 }])
        ],
        labels: [],
        annotations: []
      }
    })!;

    const joins = busbarJoinMarkers(extractTopology(doc));
    expect(joins).toEqual([{ x: 150, y: 100 }]);

    const svg = buildDrawingExportSvg(doc, { theme: 'light' });
    expect(svg).toContain('cx="150" cy="100"');
  });
});
