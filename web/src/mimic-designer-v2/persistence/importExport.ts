import type { DrawingDocument } from '../drawing/model';
import { serializeDrawingDocument } from '../schema/documentSchema';
import { migrateStoredDrawing, type MigrationResult } from './migrations';

export function exportDrawingJson(doc: DrawingDocument): string {
  return JSON.stringify(serializeDrawingDocument(doc), null, 2);
}

export function importDrawingJson(json: string): MigrationResult {
  return migrateStoredDrawing(JSON.parse(json));
}

export function downloadDrawingJson(doc: DrawingDocument): void {
  const blob = new Blob([exportDrawingJson(doc)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${safeFileName(doc.name)}.mimic-v2.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function safeFileName(name: string): string {
  return name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'mimic-drawing';
}
