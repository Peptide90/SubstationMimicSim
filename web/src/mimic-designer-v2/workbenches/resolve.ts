import type { LearningTier, ScenarioDefinition } from '../drawing/model';
import { featureVisibilityForTier } from '../learning/featureVisibility';
import type { LearningFeatureVisibility } from '../learning/featureVisibility';
import { isTierAtLeast } from '../learning/tiers';
import { workbenches } from './registry';
import type { PanelId, ResolvedWorkbench, ToolId, WorkbenchId } from './types';

/**
 * Combine the two axes: the workbench decides which panels exist, the tier
 * decides how many of them the learner is ready for.
 */
export function resolveWorkbench(
  id: WorkbenchId,
  tier: LearningTier,
  scenario?: ScenarioDefinition,
  visibility: LearningFeatureVisibility = featureVisibilityForTier(tier, scenario)
): ResolvedWorkbench {
  const spec = workbenches[id];
  const panels: PanelId[] = [];
  const hiddenPanels: PanelId[] = [];

  for (const panel of spec.panels) {
    const tierOk = !panel.minTier || isTierAtLeast(tier, panel.minTier);
    const visibilityOk = !panel.requiresVisibility || visibility[panel.requiresVisibility];
    if (tierOk && visibilityOk) panels.push(panel.id);
    else hiddenPanels.push(panel.id);
  }

  const tools = spec.tools.filter((tool) => isToolAllowed(tool, visibility));
  const tool = tools.includes(spec.defaultTool) ? spec.defaultTool : (tools[0] ?? 'pan');

  return {
    id: spec.id,
    label: spec.label,
    question: spec.question,
    description: spec.description,
    mode: spec.mode,
    tool,
    tools,
    panels,
    hiddenPanels,
  };
}

function isToolAllowed(tool: ToolId, visibility: LearningFeatureVisibility): boolean {
  if (tool === 'fault') return visibility.allowFaultTools;
  if (tool === 'conductor') return visibility.allowDrawingTools;
  return true;
}

/**
 * Panels are deduplicated across workbenches (several show the event log), so
 * ask this rather than testing panel arrays by hand.
 */
export function hasPanel(resolved: ResolvedWorkbench, panel: PanelId): boolean {
  return resolved.panels.includes(panel);
}
