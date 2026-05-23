import { migrateDrawingDocument } from '../schema/documentSchema';
import { createScenarioFromDrawing, duplicateScenarioPackage, type ScenarioPackage } from './packageScenario';

export const SCENARIO_STORE_KEY = 'mimicDesignerV2Scenarios';

export function listScenarioPackages(): ScenarioPackage[] {
  return readPackages().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function saveScenarioPackage(pkg: ScenarioPackage): ScenarioPackage {
  const saved = { ...pkg, updatedAt: new Date().toISOString() };
  const packages = readPackages().filter((item) => item.id !== saved.id);
  packages.push(saved);
  localStorage.setItem(SCENARIO_STORE_KEY, JSON.stringify(packages));
  return saved;
}

export function loadScenarioPackage(id: string): ScenarioPackage | null {
  return readPackages().find((item) => item.id === id) ?? null;
}

export function deleteScenarioPackage(id: string): void {
  localStorage.setItem(SCENARIO_STORE_KEY, JSON.stringify(readPackages().filter((item) => item.id !== id)));
}

export function duplicateScenario(id: string, name?: string): ScenarioPackage | null {
  const source = loadScenarioPackage(id);
  if (!source) return null;
  return saveScenarioPackage(duplicateScenarioPackage(source, name));
}

export function saveDrawingAsScenarioFromUi(doc: Parameters<typeof createScenarioFromDrawing>[0], patch: Parameters<typeof createScenarioFromDrawing>[1]) {
  return saveScenarioPackage(createScenarioFromDrawing(doc, patch));
}

function readPackages(): ScenarioPackage[] {
  const raw = localStorage.getItem(SCENARIO_STORE_KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as ScenarioPackage[]).map((pkg) => {
      const drawing = migrateDrawingDocument(pkg.drawing)!;
      const scenario = migrateDrawingDocument({ ...pkg.drawing, scenarios: [pkg.scenario] })!.scenarios[0] ?? pkg.scenario;
      return { ...pkg, drawing, scenario };
    });
  } catch {
    return [];
  }
}
