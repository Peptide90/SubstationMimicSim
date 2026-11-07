import type { LearningTier } from '../drawing/model';
import type { LearningFeatureVisibility } from '../learning/featureVisibility';

/**
 * Three views of the same substation. See docs/PLATFORM-PLAN.md section 2.
 *
 * - design:  the substation as built — edit the single-line diagram.
 * - protect: as protected and controlled — generated secondary sheets.
 * - operate: as it runs — the live substation, or the control room's view of it.
 */
export type WorkspaceId = 'design' | 'protect' | 'operate';

/** Operate shows the truth (substation) or only what is reported (control room). */
export type OperateView = 'substation' | 'control-room';

/** Activities that run on top of any workspace. */
export type ModeId = 'learn' | 'studio';
export type WorkspaceModes = Record<ModeId, boolean>;

/** What the main area of the screen is. */
export type CanvasKind = 'diagram' | 'live-diagram' | 'hmi' | 'sheet';

export type PanelId =
  // Design
  | 'palette'
  | 'templates'
  | 'inspector'
  | 'labelling'
  | 'phases'
  | 'topologyOverlay'
  | 'debug'
  // Operate
  | 'eventLog'
  | 'faults'
  | 'powerFlow'
  | 'alarmList'
  | 'controlPanel'
  // Protect
  | 'tripExplain'
  | 'relayManager'
  | 'relayInputs'
  | 'relayOutputs'
  | 'protectionZones'
  | 'curves'
  | 'schemeLogic'
  // Learn mode
  | 'scenarioBrief'
  | 'switchingSheet'
  | 'objectives'
  | 'hints'
  | 'replayLog'
  | 'scenarioCatalogue'
  // Studio mode
  | 'sequenceSteps'
  | 'timeline'
  | 'exportSettings';

export type ToolId = 'select' | 'operate' | 'conductor' | 'fault' | 'pan';

export interface PanelSpec {
  id: PanelId;
  /** Lowest tier this panel appears at. Absent means every tier. */
  minTier?: LearningTier;
  /** Also require a feature-visibility flag, which scenario context can switch on. */
  requiresVisibility?: keyof LearningFeatureVisibility;
  /** Operate only: the views this panel belongs to. Absent means both. */
  views?: OperateView[];
}

export interface WorkspaceSpec {
  id: WorkspaceId;
  label: string;
  /** "The substation as …", shown in the switcher. */
  aspect: string;
  description: string;
  /** Editing posture of the diagram. */
  mode: 'edit' | 'operate';
  panels: PanelSpec[];
}

export interface ModeSpec {
  id: ModeId;
  label: string;
  description: string;
  panels: PanelSpec[];
}

export interface WorkspaceState {
  workspace: WorkspaceId;
  operateView: OperateView;
  modes: WorkspaceModes;
}

export interface ResolvedWorkspace extends WorkspaceState {
  label: string;
  mode: 'edit' | 'operate';
  canvas: CanvasKind;
  tool: ToolId;
  tools: ToolId[];
  panels: PanelId[];
  /** Panels the workspace and modes define that this tier is not ready for. */
  hiddenPanels: PanelId[];
}
