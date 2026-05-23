import type { DrawingDocument } from '../drawing/model';
import { MIMIC_DESIGNER_V2_SCHEMA_VERSION, migrateDrawingDocument, type PersistedDrawingDocument } from '../schema/documentSchema';

export interface MigrationResult {
  doc: DrawingDocument;
  migrated: boolean;
  fromSchemaVersion?: number;
}

export function migrateStoredDrawing(input: PersistedDrawingDocument | DrawingDocument): MigrationResult {
  const fromSchemaVersion = input.schemaVersion;
  const doc = migrateDrawingDocument(input)!;
  return {
    doc,
    migrated: fromSchemaVersion !== undefined && fromSchemaVersion < MIMIC_DESIGNER_V2_SCHEMA_VERSION,
    fromSchemaVersion
  };
}
