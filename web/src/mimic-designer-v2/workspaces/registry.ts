import type { CanvasKind, ModeId, ModeSpec, OperateView, ToolId, WorkspaceId, WorkspaceSpec } from './types';

/**
 * Every workspace is reachable at every tier: a new starter can open Protect
 * and see something true. Tiering happens per panel, never by hiding a subject.
 */
export const workspaces: Record<WorkspaceId, WorkspaceSpec> = {
  design: {
    id: 'design',
    label: 'Design',
    aspect: 'as built',
    description: 'Place equipment, run busbars and conductors, label the drawing.',
    mode: 'edit',
    panels: [
      { id: 'palette' },
      { id: 'templates' },
      { id: 'inspector' },
      { id: 'labelling', minTier: 'Apprentice' },
      { id: 'phases', minTier: 'Student' },
      { id: 'topologyOverlay', minTier: 'Engineer' },
      { id: 'debug', minTier: 'Engineer' }
    ]
  },
  protect: {
    id: 'protect',
    label: 'Protect',
    aspect: 'as protected and controlled',
    description: 'The secondary systems: what measures the plant, decides to trip, and acts.',
    mode: 'operate',
    panels: [
      { id: 'tripExplain' },
      { id: 'relayManager', minTier: 'Apprentice' },
      { id: 'relayInputs', minTier: 'Engineer' },
      { id: 'relayOutputs', minTier: 'Engineer' },
      { id: 'protectionZones', minTier: 'Engineer' },
      { id: 'curves', minTier: 'Engineer' },
      { id: 'schemeLogic', minTier: 'Commissioning Engineer' },
      { id: 'eventLog' }
    ]
  },
  operate: {
    id: 'operate',
    label: 'Operate',
    aspect: 'as it runs',
    description: 'Run the substation: watch power flow, or work it from the control room.',
    mode: 'operate',
    panels: [
      { id: 'eventLog', views: ['substation'] },
      { id: 'faults', views: ['substation'], requiresVisibility: 'allowFaultTools' },
      { id: 'powerFlow', views: ['substation'], minTier: 'Apprentice' },
      { id: 'inspector', views: ['substation'] },
      { id: 'alarmList', views: ['control-room'] },
      { id: 'controlPanel', views: ['control-room'] },
      { id: 'debug', minTier: 'Engineer', views: ['substation'] }
    ]
  }
};

export const workspaceOrder: WorkspaceId[] = ['design', 'protect', 'operate'];

export const operateViews: Record<OperateView, { label: string; description: string }> = {
  substation: { label: 'Substation', description: 'The plant as it really is: live energisation and power flow.' },
  'control-room': { label: 'Control room', description: 'Only what the secondary systems report: indications, alarms and controls.' }
};

export const modes: Record<ModeId, ModeSpec> = {
  learn: {
    id: 'learn',
    label: 'Learn',
    description: 'Lessons and challenges over this workspace, and authoring them.',
    panels: [
      { id: 'scenarioBrief' },
      { id: 'switchingSheet', minTier: 'Apprentice' },
      { id: 'objectives' },
      { id: 'hints' },
      { id: 'scenarioCatalogue' },
      { id: 'replayLog', minTier: 'Apprentice' }
    ]
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    description: 'Sequence, animate and export this workspace for video.',
    panels: [{ id: 'sequenceSteps' }, { id: 'timeline' }, { id: 'exportSettings' }]
  }
};

export const modeOrder: ModeId[] = ['learn', 'studio'];

/** Tools offered, in toolbar order. The first allowed one is the default. */
export function toolsFor(workspace: WorkspaceId, view: OperateView): ToolId[] {
  if (workspace === 'design') return ['select', 'conductor', 'pan'];
  if (workspace === 'protect') return ['select', 'pan'];
  // The control room cannot create faults; it operates by select-before-operate.
  return view === 'substation' ? ['operate', 'select', 'fault', 'pan'] : ['select', 'pan'];
}

export function canvasFor(workspace: WorkspaceId, view: OperateView): CanvasKind {
  if (workspace === 'design') return 'diagram';
  if (workspace === 'protect') return 'sheet';
  return view === 'substation' ? 'live-diagram' : 'hmi';
}

export const isWorkspaceId = (value: string): value is WorkspaceId => Object.prototype.hasOwnProperty.call(workspaces, value);
