import type { LearningTier, ScenarioObjective } from '../drawing/model';
import { explain } from './terminology';

export function adaptiveHintForObjective(objective: ScenarioObjective, tier: LearningTier): string | undefined {
  if (objective.tierHints?.[tier]) return objective.tierHints[tier];
  if (objective.hint && tier !== 'Junior') return objective.hint;
  if (objective.type === 'avoid-disconnector-under-load') return explain('disconnector-load', tier);
  if (objective.type === 'maintain-no-live-earth-conflict') return explain('earth-switch', tier);
  if (objective.type === 'energise-target-busbar' || objective.type === 'restore-supply-to-load') return explain('power-flow', tier);
  if (objective.type === 'explain-protection-trip' || objective.type === 'clear-fault-using-breaker') return explain('protection-relay', tier);
  if (tier === 'Junior') return 'Try one safe step, then check what changed.';
  return objective.hint;
}

export function adaptiveFeedback(message: string, tier: LearningTier): string {
  if (tier === 'Junior') {
    if (message.toLowerCase().includes('failed')) return 'That did not work yet. Try a safer step and use a hint.';
    if (message.toLowerCase().includes('complete')) return 'Nice work. The circuit is in the right state.';
  }
  if (tier === 'Student' && message.toLowerCase().includes('failed')) return 'Not quite. Look for the current path, then try again.';
  return message;
}
