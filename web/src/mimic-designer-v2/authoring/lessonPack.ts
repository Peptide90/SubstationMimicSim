import type { ScenarioPackage } from '../scenarios/packageScenario';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { validateScenario, type AuthoringIssue } from './validation';

/**
 * Lesson packs: one shareable file holding the drawing and the scenario, so a
 * lesson can be passed to a colleague or a class without a code change.
 */
export const LESSON_PACK_FORMAT = 'substation-sim-lesson-pack';
export const LESSON_PACK_VERSION = 1;

interface LessonPackFile {
  format: typeof LESSON_PACK_FORMAT;
  version: number;
  exportedAt: string;
  package: ScenarioPackage;
}

export function exportLessonPack(pkg: ScenarioPackage, now = new Date()): string {
  const file: LessonPackFile = { format: LESSON_PACK_FORMAT, version: LESSON_PACK_VERSION, exportedAt: now.toISOString(), package: pkg };
  return JSON.stringify(file, null, 2);
}

export type LessonPackImport =
  | { ok: true; pkg: ScenarioPackage; issues: AuthoringIssue[] }
  | { ok: false; reason: string };

export function importLessonPack(json: string): LessonPackImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'This file is not valid JSON.' };
  }
  const file = parsed as Partial<LessonPackFile>;
  if (file?.format !== LESSON_PACK_FORMAT) return { ok: false, reason: 'This is not a Substation Sim lesson pack.' };
  if (typeof file.version !== 'number' || file.version > LESSON_PACK_VERSION) {
    return { ok: false, reason: 'This lesson pack was made by a newer version of the app.' };
  }
  const pkg = file.package;
  if (!pkg?.scenario || !pkg.drawing) return { ok: false, reason: 'The lesson pack is missing its drawing or scenario.' };
  const drawing = migrateDrawingDocument(pkg.drawing);
  if (!drawing) return { ok: false, reason: 'The lesson pack drawing could not be read.' };
  const migrated = migrateDrawingDocument({ ...drawing, scenarios: [pkg.scenario] });
  const scenario = migrated?.scenarios[0] ?? pkg.scenario;
  const imported: ScenarioPackage = { ...pkg, drawing, scenario, title: scenario.name, updatedAt: new Date().toISOString() };
  return { ok: true, pkg: imported, issues: validateScenario(scenario, drawing) };
}
