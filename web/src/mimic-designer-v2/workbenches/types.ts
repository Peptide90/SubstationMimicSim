import type { LearningTier } from '../drawing/model';

/**
 * A workbench is a filter over one shared document, not a separate application.
 * It answers a single question for the user; the tier then decides how much of
 * each answer is shown. See docs/PLATFORM-PLAN.md section 2.
 */
export type WorkbenchId = 'draw' | 'operate' | 'protect' | 'study' | 'studio';

export type PanelId =
  // Draw — "what does this substation look like?"
  | 'palette'
  | 'inspector'
  | 'templates'
  | 'labelling'
  | 'phases'
  // Operate — "what happens when I switch it?"
  | 'operationControls'
  | 'eventLog'
  | 'faults'
  | 'powerFlow'
  // Protect — "why did it trip, and would it grade?"
  | 'tripExplain'
  | 'relayManager'
  | 'relayInputs'
  | 'relayOutputs'
  | 'protectionZones'
  | 'curves'
  | 'schemeLogic'
  // Study — "am I doing this correctly?"
  | 'scenarioBrief'
  | 'switchingSheet'
  | 'objectives'
  | 'hints'
  | 'replayLog'
  | 'scenarioCatalogue'
  // Studio — "how do I film this?"
  | 'sequenceSteps'
  | 'timeline'
  | 'exportSettings'
  // Shared / diagnostic
  | 'topologyOverlay'
  | 'debug';

export type ToolId = 'select' | 'operate' | 'conductor' | 'fault' | 'pan';

/** Editing posture the canvas adopts when a workbench is entered. */
export type WorkbenchMode = 'edit' | 'operate';

export interface PanelSpec {
  id: PanelId;
  /** Lowest tier this panel appears at. Absent means every tier. */
  minTier?: LearningTier;
  /**
   * Gate on a `LearningFeatureVisibility` flag as well as tier. Lets scenario
   * context switch a panel on for a tier that would not otherwise see it.
   */
  requiresVisibility?: keyof import('../learning/featureVisibility').LearningFeatureVisibility;
}

export interface WorkbenchSpec {
  id: WorkbenchId;
  label: string;
  /** The question this workbench answers, shown in the switcher. */
  question: string;
  description: string;
  mode: WorkbenchMode;
  defaultTool: ToolId;
  tools: ToolId[];
  panels: PanelSpec[];
}

export interface ResolvedWorkbench {
  id: WorkbenchId;
  label: string;
  question: string;
  description: string;
  mode: WorkbenchMode;
  tool: ToolId;
  tools: ToolId[];
  panels: PanelId[];
  /** Panels this workbench defines that the current tier is not ready for. */
  hiddenPanels: PanelId[];
}
