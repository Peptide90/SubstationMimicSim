import type { LearningTier, ScenarioEventSeverity } from '../drawing/model';

export type ExplanationKey =
  | 'power-flow'
  | 'current-flowing'
  | 'breaker-trip'
  | 'disconnector-load'
  | 'voltage-segregation'
  | 'protection-relay'
  | 'earth-switch'
  | 'transformer';

type TierText = Partial<Record<LearningTier, string>>;

const explanations: Record<ExplanationKey, TierText> = {
  'power-flow': {
    Junior: 'Electricity is moving from the supply to the things that need it.',
    Student: 'Current and power are flowing through a complete circuit.',
    Apprentice: 'Load is being supplied through closed switchgear and connected conductors.',
    Engineer: 'The energised topology is carrying load according to the configured source and load values.',
    'Commissioning Engineer': 'Derived branch loading is calculated from topology, source/load metadata, impedance, limits, and per-phase values.'
  },
  'current-flowing': {
    Junior: 'Electricity is flowing through the wire.',
    Student: 'Current is flowing through the circuit.',
    Apprentice: 'The closed path is carrying load current.',
    Engineer: 'The branch is energised and carrying load from a source island.',
    'Commissioning Engineer': 'The branch is live in the derived topology and has calculated per-phase current.'
  },
  'breaker-trip': {
    Junior: 'The breaker opened to help stop danger.',
    Student: 'The breaker opened because the circuit became unsafe.',
    Apprentice: 'The breaker opened because fault current exceeded the protection setting.',
    Engineer: 'OC protection operated after downstream fault current exceeded pickup.',
    'Commissioning Engineer': 'Stage 1 OC picked up and issued trip after the configured grading delay.'
  },
  'disconnector-load': {
    Junior: 'Use the proper switch to stop the electricity before opening this one.',
    Student: 'A disconnector should not break load current.',
    Apprentice: 'The disconnector should not be opened while carrying load current.',
    Engineer: 'Transfer or interrupt load before operating the disconnector.',
    'Commissioning Engineer': 'Open the CB first to avoid disconnector interruption duty.'
  },
  'voltage-segregation': {
    Junior: 'Big and small electricity systems must not be joined directly.',
    Student: 'Different voltage levels need a transformer between them.',
    Apprentice: 'Do not connect different voltage systems unless a transformer separates them.',
    Engineer: 'Voltage segregation is required; incompatible systems must only couple through a transformer or converter.',
    'Commissioning Engineer': 'Parallel or direct connection of mismatched voltage systems should alarm/trip unless an approved transformer/converter boundary maps the voltages.'
  },
  'protection-relay': {
    Junior: 'A protection device watches for danger and tells the breaker to open.',
    Student: 'Protection measures the circuit and trips a breaker when values become unsafe.',
    Apprentice: 'A relay reads CTs/VTs and instructs a breaker when its function picks up.',
    Engineer: 'Protection functions evaluate measured quantities and issue trips to assigned circuit breakers.',
    'Commissioning Engineer': 'Relay elements, inputs, timers, outputs, and backup logic determine trip paths and event timing.'
  },
  'earth-switch': {
    Junior: 'An earth switch makes equipment safe after the electricity is off.',
    Student: 'Earthing connects isolated equipment safely to ground.',
    Apprentice: 'Close earth switches only after isolation and proving dead.',
    Engineer: 'Earthing is an operational safety state and must not conflict with live conductors.',
    'Commissioning Engineer': 'Live-earth conflicts are detected in topology and should produce alarm/trip behaviour.'
  },
  transformer: {
    Junior: 'A transformer changes electricity to a safer or more useful level.',
    Student: 'A transformer changes voltage up or down.',
    Apprentice: 'A transformer separates voltage systems and transfers power magnetically.',
    Engineer: 'Transformer boundaries map HV/LV/tertiary networks while maintaining voltage segregation.',
    'Commissioning Engineer': 'Transformer-side voltage mapping constrains topology traversal and protection-zone interpretation.'
  }
};

export function explain(key: ExplanationKey, tier: LearningTier): string {
  return explanations[key][tier] ?? explanations[key].Apprentice ?? key;
}

export function learnMore(key: ExplanationKey, tier: LearningTier) {
  const order: LearningTier[] = ['Junior', 'Student', 'Apprentice', 'Engineer', 'Commissioning Engineer'];
  const index = order.indexOf(tier);
  return order.slice(index + 1).map((nextTier) => ({ tier: nextTier, text: explain(key, nextTier) }));
}

export function eventExplanation(message: string, severity: ScenarioEventSeverity, tier: LearningTier): string {
  const lower = message.toLowerCase();
  if (lower.includes('disconnector')) return explain('disconnector-load', tier);
  if (lower.includes('voltage')) return explain('voltage-segregation', tier);
  if (lower.includes('trip') || severity === 'protection') return explain('breaker-trip', tier);
  if (lower.includes('earth')) return explain('earth-switch', tier);
  if (severity === 'operation') return explain('current-flowing', tier);
  return message;
}
