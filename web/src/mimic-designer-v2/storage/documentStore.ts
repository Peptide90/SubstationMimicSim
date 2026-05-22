import type { DrawingDocument } from '../drawing/model';
import { migrateDrawingDocument, serializeDrawingDocument } from '../schema/documentSchema';

export const STORAGE_KEY = 'mimicDesignerV2Document';

export function saveDocument(doc: DrawingDocument): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeDrawingDocument(doc)));
}

export function loadDocument(): DrawingDocument | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return migrateDrawingDocument(JSON.parse(raw));
}
