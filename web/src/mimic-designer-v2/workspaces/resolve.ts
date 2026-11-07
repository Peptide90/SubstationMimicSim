import type { LearningTier, ScenarioDefinition } from '../drawing/model';
import { featureVisibilityForTier } from '../learning/featureVisibility';
import type { LearningFeatureVisibility } from '../learning/featureVisibility';
import { isTierAtLeast } from '../learning/tiers';
import { canvasFor, modeOrder, modes, toolsFor, workspaces } from './registry';
import type { PanelId, PanelSpec, ResolvedWorkspace, ToolId, WorkspaceState } from './types';

/**
 * Combine the axes: the workspace decides the canvas, tools and panels; the
 * Operate view picks between truth and what is reported; modes add their
 * panels on top; the tier decides how much of it the learner is ready for.
 */
export function resolveWorkspace(
  state: WorkspaceState,
  tier: LearningTier,
  scenario?: ScenarioDefinition,
  visibility: LearningFeatureVisibility = featureVisibilityForTier(tier, scenario)
): ResolvedWorkspace {
  const spec = workspaces[state.workspace];
  const specs: PanelSpec[] = [
    ...spec.panels.filter((panel) => state.workspace !== 'operate' || !panel.views || panel.views.includes(state.operateView)),
    ...modeOrder.filter((mode) => state.modes[mode]).flatMap((mode) => modes[mode].panels)
  ];
  const panels: PanelId[] = [];
  const hiddenPanels: PanelId[] = [];
  for (const panel of specs) {
    const ready = (!panel.minTier || isTierAtLeast(tier, panel.minTier)) && (!panel.requiresVisibility || visibility[panel.requiresVisibility]);
    const list = ready ? panels : hiddenPanels;
    if (!list.includes(panel.id)) list.push(panel.id);
  }
  const tools = toolsFor(state.workspace, state.operateView).filter((tool) => isToolAllowed(tool, visibility));
  return {
    ...state,
    label: spec.label,
    mode: spec.mode,
    canvas: canvasFor(state.workspace, state.operateView),
    tool: tools[0] ?? 'pan',
    tools,
    panels,
    hiddenPanels: hiddenPanels.filter((id) => !panels.includes(id))
  };
}

function isToolAllowed(tool: ToolId, visibility: LearningFeatureVisibility): boolean {
  if (tool === 'fault') return visibility.allowFaultTools;
  if (tool === 'conductor') return visibility.allowDrawingTools;
  return true;
}

/** Where a scenario should open, and whether its Operate view is fixed. */
export function workspaceForScenario(scenario: ScenarioDefinition): Pick<WorkspaceState, 'workspace' | 'operateView'> & { viewLocked: boolean } {
  const locked = scenario.restrictions?.operateView;
  return {
    workspace: scenario.workspace ?? 'operate',
    operateView: locked ?? scenario.preferredOperateView ?? 'substation',
    viewLocked: Boolean(locked)
  };
}
