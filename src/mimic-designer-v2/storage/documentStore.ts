import type { DrawingDocument } from '../drawing/model';

export const STORAGE_KEY = 'mimicDesignerV2Document';

export function saveDocument(doc: DrawingDocument): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

export function loadDocument(): DrawingDocument | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as DrawingDocument;
}
