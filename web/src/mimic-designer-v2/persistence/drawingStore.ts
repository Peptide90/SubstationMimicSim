import type { DrawingDocument } from '../drawing/model';
import { serializeDrawingDocument } from '../schema/documentSchema';
import { migrateStoredDrawing, type MigrationResult } from './migrations';
import { createDrawingThumbnail } from './thumbnails';

export const DRAWING_STORE_KEY = 'mimicDesignerV2Drawings';
export const ACTIVE_DRAWING_KEY = 'mimicDesignerV2ActiveDrawingId';
export const DRAFT_DRAWING_KEY = 'mimicDesignerV2Draft';

export type DrawingSummary = Pick<DrawingDocument, 'id' | 'name' | 'description' | 'schemaVersion' | 'drawingType' | 'tags' | 'voltageLevels' | 'createdAt' | 'updatedAt' | 'lastOpenedAt' | 'thumbnail'> & {
  objectCount: number;
};

export interface DrawingStoreRecord {
  summary: DrawingSummary;
  doc: DrawingDocument;
}

export function listDrawingRecords(): DrawingStoreRecord[] {
  return readRecords().sort((a, b) => Date.parse(b.summary.updatedAt) - Date.parse(a.summary.updatedAt));
}

export function listDrawings(): DrawingSummary[] {
  return listDrawingRecords().map((record) => record.summary);
}

export function loadDrawing(id: string): MigrationResult | null {
  const record = readRecords().find((item) => item.doc.id === id);
  if (!record) return null;
  const result = migrateStoredDrawing({ ...record.doc, lastOpenedAt: new Date().toISOString() });
  saveDrawing(result.doc);
  localStorage.setItem(ACTIVE_DRAWING_KEY, result.doc.id);
  return result;
}

export function saveDrawing(doc: DrawingDocument): DrawingDocument {
  const now = new Date().toISOString();
  const saved = serializeDrawingDocument({
    ...doc,
    drawingType: doc.drawingType ?? 'user',
    createdAt: doc.createdAt ?? now,
    updatedAt: now,
    thumbnail: createDrawingThumbnail(doc),
    voltageLevels: deriveVoltageLevels(doc)
  });
  const records = readRecords().filter((item) => item.doc.id !== saved.id);
  records.push({ summary: summarizeDrawing(saved), doc: saved });
  writeRecords(records);
  localStorage.setItem(ACTIVE_DRAWING_KEY, saved.id);
  clearDraft();
  return saved;
}

export function saveDrawingAs(doc: DrawingDocument, name: string): DrawingDocument {
  return saveDrawing({
    ...doc,
    id: `drawing-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    name,
    drawingType: 'user',
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString()
  });
}

export function duplicateDrawing(id: string, name?: string): DrawingDocument | null {
  const loaded = loadDrawing(id);
  if (!loaded) return null;
  return saveDrawingAs(loaded.doc, name ?? `${loaded.doc.name} copy`);
}

export function renameDrawing(id: string, name: string): DrawingDocument | null {
  const loaded = loadDrawing(id);
  if (!loaded) return null;
  return saveDrawing({ ...loaded.doc, name });
}

export function deleteDrawing(id: string): void {
  writeRecords(readRecords().filter((item) => item.doc.id !== id));
  if (localStorage.getItem(ACTIVE_DRAWING_KEY) === id) localStorage.removeItem(ACTIVE_DRAWING_KEY);
}

export function saveDraft(doc: DrawingDocument): void {
  localStorage.setItem(DRAFT_DRAWING_KEY, JSON.stringify({ savedAt: new Date().toISOString(), doc: serializeDrawingDocument(doc) }));
}

export function loadDraft(): { savedAt: string; result: MigrationResult } | null {
  const raw = localStorage.getItem(DRAFT_DRAWING_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return { savedAt: parsed.savedAt, result: migrateStoredDrawing(parsed.doc) };
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_DRAWING_KEY);
}

export function activeDrawingId(): string | null {
  return localStorage.getItem(ACTIVE_DRAWING_KEY);
}

export function summarizeDrawing(doc: DrawingDocument): DrawingSummary {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    schemaVersion: doc.schemaVersion,
    drawingType: doc.drawingType,
    tags: doc.tags,
    voltageLevels: doc.voltageLevels,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastOpenedAt: doc.lastOpenedAt,
    thumbnail: doc.thumbnail,
    objectCount: doc.objects.symbols.length + doc.objects.conductors.length + doc.objects.busbars.length
  };
}

function readRecords(): DrawingStoreRecord[] {
  const raw = localStorage.getItem(DRAWING_STORE_KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as DrawingStoreRecord[]).map((record) => {
      const doc = migrateStoredDrawing(record.doc).doc;
      return { doc, summary: summarizeDrawing(doc) };
    });
  } catch {
    return [];
  }
}

function writeRecords(records: DrawingStoreRecord[]): void {
  localStorage.setItem(DRAWING_STORE_KEY, JSON.stringify(records.map((record) => ({ ...record, doc: serializeDrawingDocument(record.doc) }))));
}

function deriveVoltageLevels(doc: DrawingDocument): number[] {
  const values = new Set(doc.voltageLevels ?? []);
  doc.objects.symbols.forEach((symbol) => {
    if (symbol.voltageLevelKv) values.add(symbol.voltageLevelKv);
    if (symbol.engineering?.tertiaryVoltageKv) values.add(symbol.engineering.tertiaryVoltageKv);
  });
  return [...values].sort((a, b) => b - a);
}
