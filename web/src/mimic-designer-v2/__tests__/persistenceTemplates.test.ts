import { beforeEach, describe, expect, it } from 'vitest';
import { buildGraph } from '../topology/graph';
import { importDrawingJson, exportDrawingJson } from '../persistence/importExport';
import { clearDraft, deleteDrawing, duplicateDrawing, listDrawings, loadDraft, loadDrawing, renameDrawing, saveDraft, saveDrawing, saveDrawingAs } from '../persistence/drawingStore';
import { builtInExamples, builtInTemplates, createDrawingFromTemplate, insertTemplateIntoDrawing } from '../templates';
import { migrateDrawingDocument, MIMIC_DESIGNER_V2_SCHEMA_VERSION } from '../schema/documentSchema';

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

describe('Mimic Designer V2 drawing persistence and templates', () => {
  it('creates, saves, and loads a drawing', () => {
    const doc = createDrawingFromTemplate(builtInTemplates[0], 'My feeder');
    const saved = saveDrawing(doc);
    const loaded = loadDrawing(saved.id);

    expect(listDrawings()).toHaveLength(1);
    expect(loaded?.doc.name).toBe('My feeder');
    expect(loaded?.migrated).toBe(false);
  });

  it('supports save as, duplicate, rename, and delete', () => {
    const saved = saveDrawing(createDrawingFromTemplate(builtInTemplates[0], 'Original'));
    const savedAs = saveDrawingAs(saved, 'Saved as');
    const duplicate = duplicateDrawing(savedAs.id, 'Duplicate');
    const renamed = renameDrawing(duplicate!.id, 'Renamed');
    deleteDrawing(saved.id);

    expect(savedAs.name).toBe('Saved as');
    expect(renamed?.name).toBe('Renamed');
    expect(new Set(listDrawings().map((item) => item.name))).toEqual(new Set(['Renamed', 'Saved as']));
  });

  it('round trips import/export JSON and reports migration on old schema input', () => {
    const doc = createDrawingFromTemplate(builtInTemplates[0], 'Round trip');
    const imported = importDrawingJson(exportDrawingJson(doc));
    const migrated = importDrawingJson(JSON.stringify({ ...doc, schemaVersion: 1 }));

    expect(imported.doc.objects.symbols.length).toBe(doc.objects.symbols.length);
    expect(migrated.migrated).toBe(true);
    expect(migrated.doc.schemaVersion).toBe(MIMIC_DESIGNER_V2_SCHEMA_VERSION);
  });

  it('lists built-in templates and creates topology-valid drawings from them', () => {
    expect(builtInTemplates.map((item) => item.id)).toContain('template-simple-radial-feeder');
    expect(builtInTemplates.length).toBeGreaterThanOrEqual(12);

    const doc = createDrawingFromTemplate(builtInTemplates[0]);
    const graph = buildGraph(doc);
    expect(doc.drawingType).toBe('user');
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.branches.length).toBeGreaterThan(0);
  });

  it('inserts templates into existing drawings and renumbers duplicate labels', () => {
    const template = builtInTemplates[0];
    const doc = createDrawingFromTemplate(template, 'Base');
    const inserted = insertTemplateIntoDrawing(doc, template, { x: 500, y: 300 });
    const labels = inserted.objects.symbols.map((symbol) => symbol.label?.text).filter(Boolean);

    expect(inserted.objects.symbols.length).toBeGreaterThan(doc.objects.symbols.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('examples load with editable objects and topology', () => {
    const docs = builtInExamples.map((example) => example.create());
    expect(docs.length).toBeGreaterThanOrEqual(10);
    docs.forEach((doc) => {
      const graph = buildGraph(doc);
      expect(doc.objects.symbols.length + doc.objects.busbars.length + doc.objects.conductors.length).toBeGreaterThan(0);
      expect(graph.nodes.length).toBeGreaterThan(0);
    });
  });

  it('stores and recovers autosave drafts', () => {
    const doc = migrateDrawingDocument({ ...createDrawingFromTemplate(builtInTemplates[0]), schemaVersion: 1 })!;
    saveDraft(doc);
    const draft = loadDraft();
    clearDraft();

    expect(draft?.result.doc.name).toBe(doc.name);
    expect(loadDraft()).toBeNull();
  });
});
