import type { WorkbenchId, WorkbenchSpec } from './types';

/**
 * The five workbenches. Adding a teaching surface should mean adding a panel id
 * here and a component that renders it — not editing a monolithic screen.
 *
 * Every workbench is reachable at every tier on purpose: a new starter should be
 * able to look at protection and see *something* true about it. What differs is
 * which panels resolve — Junior gets `tripExplain` alone, an Engineer gets curves
 * and zones. Tiering happens per panel, never by hiding the subject itself.
 */
export const workbenches: Record<WorkbenchId, WorkbenchSpec> = {
  draw: {
    id: 'draw',
    label: 'Draw',
    question: 'What does this substation look like?',
    description: 'Place equipment, run busbars and conductors, label the drawing.',
    mode: 'edit',
    defaultTool: 'select',
    tools: ['select', 'conductor', 'pan'],
    panels: [
      { id: 'palette' },
      { id: 'templates' },
      { id: 'inspector' },
      { id: 'labelling', minTier: 'Apprentice' },
      { id: 'phases', minTier: 'Student' },
      { id: 'topologyOverlay', minTier: 'Engineer' },
      { id: 'debug', minTier: 'Engineer' },
    ],
  },
  operate: {
    id: 'operate',
    label: 'Operate',
    question: 'What happens when I switch it?',
    description: 'Operate switchgear, trace energisation, apply faults and watch the log.',
    mode: 'operate',
    defaultTool: 'operate',
    tools: ['operate', 'select', 'fault', 'pan'],
    panels: [
      { id: 'operationControls' },
      { id: 'eventLog' },
      { id: 'faults', requiresVisibility: 'allowFaultTools' },
      { id: 'powerFlow', minTier: 'Apprentice' },
      { id: 'inspector' },
      { id: 'debug', minTier: 'Engineer' },
    ],
  },
  protect: {
    id: 'protect',
    label: 'Protect',
    question: 'Why did it trip, and would it grade?',
    description: 'Follow a trip from fault to breaker, then inspect the relays that caused it.',
    mode: 'operate',
    defaultTool: 'select',
    tools: ['select', 'fault', 'pan'],
    panels: [
      // Available to everyone: the plain-language account of what just tripped.
      { id: 'tripExplain' },
      { id: 'relayManager', minTier: 'Apprentice' },
      { id: 'relayInputs', minTier: 'Engineer' },
      { id: 'relayOutputs', minTier: 'Engineer' },
      { id: 'protectionZones', minTier: 'Engineer' },
      { id: 'curves', minTier: 'Engineer' },
      { id: 'schemeLogic', minTier: 'Commissioning Engineer' },
      { id: 'eventLog' },
    ],
  },
  study: {
    id: 'study',
    label: 'Study',
    question: 'Am I doing this correctly?',
    description: 'Work through lessons and challenges, with objectives, hints and marking.',
    mode: 'operate',
    defaultTool: 'operate',
    tools: ['operate', 'select', 'pan'],
    panels: [
      { id: 'scenarioBrief' },
      { id: 'objectives' },
      { id: 'hints' },
      { id: 'scenarioCatalogue' },
      { id: 'eventLog' },
      { id: 'replayLog', minTier: 'Apprentice' },
    ],
  },
  studio: {
    id: 'studio',
    label: 'Studio',
    question: 'How do I film this?',
    description: 'Sequence switching steps on a timeline and export an animated diagram.',
    mode: 'operate',
    defaultTool: 'select',
    tools: ['select', 'operate', 'pan'],
    panels: [
      { id: 'sequenceSteps' },
      { id: 'timeline' },
      { id: 'exportSettings' },
      { id: 'inspector' },
    ],
  },
};

export const workbenchOrder: WorkbenchId[] = ['draw', 'operate', 'protect', 'study', 'studio'];

export const isWorkbenchId = (value: string): value is WorkbenchId =>
  Object.prototype.hasOwnProperty.call(workbenches, value);
