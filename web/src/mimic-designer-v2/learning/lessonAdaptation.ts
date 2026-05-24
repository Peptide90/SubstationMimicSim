import type { LearningTier, ScenarioDefinition, ScenarioObjective } from '../drawing/model';
import { adaptiveHintForObjective } from './adaptiveHints';
import { isTierAtLeast, learningTiers, tierRank } from './tiers';

export function isScenarioAvailableForTier(scenario: ScenarioDefinition, tier: LearningTier): boolean {
  if (scenario.supportedTiers?.length) return scenario.supportedTiers.includes(tier);
  if (scenario.minTier && !isTierAtLeast(tier, scenario.minTier)) return false;
  if (scenario.maxTier && tierRank(tier) > tierRank(scenario.maxTier)) return false;
  if (scenario.minTier === 'Junior' && scenario.maxTier === 'Junior') return tier === 'Junior';
  return true;
}

export function adaptScenarioForTier(scenario: ScenarioDefinition, tier: LearningTier): ScenarioDefinition {
  const config = learningTiers[tier];
  const objectiveVariants = scenario.tierObjectives?.[tier];
  const adaptedObjectives = (objectiveVariants ?? scenario.objectives).map((objective) => adaptObjectiveForTier(objective, tier));
  const explanation = scenario.explanationVariants?.[tier];
  const briefing = {
    ...scenario.briefing,
    expectedOperatorRole: scenario.briefing?.expectedOperatorRole ?? `${config.label} learner`,
    initialCondition: explanation ?? scenario.briefing?.initialCondition,
    restrictions: scenario.briefing?.restrictions ?? restrictionsForTier(tier),
    warnings: scenario.briefing?.warnings ?? warningsForTier(tier),
    winConditions: adaptedObjectives.map((objective) => objective.text),
    loseConditions: loseConditionsForTier(tier)
  };
  return {
    ...scenario,
    objectives: adaptedObjectives,
    briefing,
    restrictions: {
      ...scenario.restrictions,
      disableTopologyOverlay: scenario.restrictions?.disableTopologyOverlay ?? !isTierAtLeast(tier, 'Engineer'),
      disableInspectorEditing: scenario.restrictions?.disableInspectorEditing ?? tier === 'Junior',
      disableDrawingTools: scenario.restrictions?.disableDrawingTools ?? !isTierAtLeast(tier, 'Apprentice'),
      disablePlacement: scenario.restrictions?.disablePlacement ?? !isTierAtLeast(tier, 'Apprentice')
    },
    failureRules: {
      ...scenario.failureRules,
      maxWrongOperations: scenario.failureRules?.maxWrongOperations ?? (tier === 'Junior' ? 8 : tier === 'Student' ? 5 : tier === 'Apprentice' ? 3 : 1)
    }
  };
}

export function tierBadgeForScenario(scenario: ScenarioDefinition): string {
  if (scenario.supportedTiers?.length) return scenario.supportedTiers.join(', ');
  if (scenario.minTier && scenario.maxTier) return `${scenario.minTier} to ${scenario.maxTier}`;
  if (scenario.recommendedTier) return `Recommended: ${scenario.recommendedTier}`;
  return 'All tiers';
}

function adaptObjectiveForTier(objective: ScenarioObjective, tier: LearningTier): ScenarioObjective {
  return {
    ...objective,
    text: objective.tierText?.[tier] ?? objective.text,
    hint: adaptiveHintForObjective(objective, tier)
  };
}

function restrictionsForTier(tier: LearningTier): string[] {
  if (tier === 'Junior') return ['Advanced systems are hidden.', 'Hints are always available.', 'Unsafe actions are explained gently.'];
  if (tier === 'Student') return ['Three-phase and protection detail appear only when the lesson needs them.'];
  if (tier === 'Apprentice') return ['Follow safe switching order.', 'Protection and thermal views may be used.'];
  if (tier === 'Engineer') return ['Operational constraints and voltage segregation are enforced.'];
  return ['Full diagnostic detail, timing, and protection configuration are available.'];
}

function warningsForTier(tier: LearningTier): string[] {
  if (tier === 'Junior') return ['You can always use Learn more when you are curious.'];
  if (tier === 'Student') return ['Watch how volts, amps, and power change as the circuit changes.'];
  return ['Avoid live-earth conflicts, load-breaking disconnectors, and voltage mismatch.'];
}

function loseConditionsForTier(tier: LearningTier): string[] {
  if (tier === 'Junior') return ['The circuit becomes unsafe, then you recover with help.'];
  if (tier === 'Student') return ['Unsafe circuit state or too many incorrect operations.'];
  if (tier === 'Apprentice') return ['Opening a disconnector under load, live-earth conflict, or repeated wrong sequence.'];
  if (tier === 'Engineer') return ['Voltage segregation breach, live-earth conflict, protection trip, or wrong switching sequence.'];
  return ['Protection misoperation, failed trip path, grading/selectivity issue, voltage breach, or unsafe switching.'];
}
