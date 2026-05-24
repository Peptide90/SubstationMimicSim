import type { LearningTier } from '../drawing/model';

export interface LearningTierConfig {
  id: LearningTier;
  label: string;
  audience: string;
  explanationStyle: string;
  vocabulary: 'simple' | 'school' | 'trade' | 'engineering' | 'commissioning';
  visibleSystems: string[];
  availableTools: string[];
  visibleMetadata: string[];
  operationalRealism: 'forgiving' | 'guided' | 'realistic' | 'strict' | 'commissioning';
  protectionDepth: 'hidden' | 'conceptual' | 'basic-relay' | 'scheme' | 'secondary-systems';
  electricalAbstraction: 'flow' | 'values' | 'equipment-purpose' | 'network-operation' | 'protection-control';
  uiSimplification: 'very-high' | 'high' | 'medium' | 'low' | 'none';
}

export const learningTierOrder: LearningTier[] = ['Junior', 'Student', 'Apprentice', 'Engineer', 'Commissioning Engineer'];

export const learningTiers: Record<LearningTier, LearningTierConfig> = {
  Junior: {
    id: 'Junior',
    label: 'Junior',
    audience: '~10 years old',
    explanationStyle: 'Friendly, concrete, visual, and safety-first.',
    vocabulary: 'simple',
    visibleSystems: ['power-flow', 'switches', 'simple-breakers', 'safety-colours'],
    availableTools: ['select', 'pan'],
    visibleMetadata: ['simple-state', 'friendly-labels'],
    operationalRealism: 'forgiving',
    protectionDepth: 'hidden',
    electricalAbstraction: 'flow',
    uiSimplification: 'very-high'
  },
  Student: {
    id: 'Student',
    label: 'Student',
    audience: 'secondary/high school',
    explanationStyle: 'Clear school science language with careful formula introductions.',
    vocabulary: 'school',
    visibleSystems: ['power-flow', 'volts-amps-resistance', 'transformers', 'simple-faults'],
    availableTools: ['select', 'pan', 'fault'],
    visibleMetadata: ['voltage', 'current', 'power'],
    operationalRealism: 'guided',
    protectionDepth: 'conceptual',
    electricalAbstraction: 'values',
    uiSimplification: 'high'
  },
  Apprentice: {
    id: 'Apprentice',
    label: 'Apprentice',
    audience: 'technical student/apprentice',
    explanationStyle: 'Practical, equipment-led, and sequence-aware.',
    vocabulary: 'trade',
    visibleSystems: ['switching', 'thermal', 'phase-imbalance', 'ct-vt', 'basic-relays', 'event-log'],
    availableTools: ['select', 'pan', 'fault', 'conductor', 'busbar'],
    visibleMetadata: ['voltage', 'current', 'power', 'impedance', 'phase'],
    operationalRealism: 'realistic',
    protectionDepth: 'basic-relay',
    electricalAbstraction: 'equipment-purpose',
    uiSimplification: 'medium'
  },
  Engineer: {
    id: 'Engineer',
    label: 'Engineer',
    audience: 'SAP/operations engineer bridge',
    explanationStyle: 'Operational, procedure-driven, and topology-aware.',
    vocabulary: 'engineering',
    visibleSystems: ['topology', 'protection', 'voltage-segregation', 'interlocking', 'restoration', 'diagnostics'],
    availableTools: ['select', 'pan', 'fault', 'conductor', 'busbar'],
    visibleMetadata: ['all-primary-metadata', 'topology', 'warnings', 'protection-status'],
    operationalRealism: 'strict',
    protectionDepth: 'scheme',
    electricalAbstraction: 'network-operation',
    uiSimplification: 'low'
  },
  'Commissioning Engineer': {
    id: 'Commissioning Engineer',
    label: 'Commissioning Engineer',
    audience: 'advanced protection and control learner',
    explanationStyle: 'Precise protection, control, test, and timing detail.',
    vocabulary: 'commissioning',
    visibleSystems: ['all-overlays', 'secondary-systems', 'relay-timing', 'trip-paths', 'intertrips', 'breaker-fail', 'alarm-analysis'],
    availableTools: ['select', 'pan', 'fault', 'conductor', 'busbar'],
    visibleMetadata: ['full-simulation-state', 'relay-functions', 'event-timing', 'phase-analysis'],
    operationalRealism: 'commissioning',
    protectionDepth: 'secondary-systems',
    electricalAbstraction: 'protection-control',
    uiSimplification: 'none'
  }
};

export function tierRank(tier: LearningTier): number {
  return learningTierOrder.indexOf(tier);
}

export function isTierAtLeast(tier: LearningTier, minimum: LearningTier): boolean {
  return tierRank(tier) >= tierRank(minimum);
}
