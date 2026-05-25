import type { LearningTier, ScenarioDefinition } from '../drawing/model';
import { isTierAtLeast, learningTiers } from './tiers';

export interface LearningFeatureVisibility {
  showProtectionManager: boolean;
  showPowerFlow: boolean;
  showTopologyOverlay: boolean;
  showThermalOverlay: boolean;
  showThreePhase: boolean;
  showDebug: boolean;
  showAdvancedMetadata: boolean;
  showEventLogDetails: boolean;
  allowFaultTools: boolean;
  allowDrawingTools: boolean;
  simplifiedLabels: boolean;
  largeControls: boolean;
}

export function featureVisibilityForTier(tier: LearningTier, scenario?: ScenarioDefinition): LearningFeatureVisibility {
  const config = learningTiers[tier];
  const scenarioAllowsThreePhase = scenario?.activeView === 'three-phase' || scenario?.tags?.includes('three-phase');
  const scenarioProtection = Boolean(scenario?.relays?.length || scenario?.protection?.length || scenario?.tags?.some((tag) => tag.includes('protection') || tag.includes('relay')));
  return {
    showProtectionManager: isTierAtLeast(tier, 'Apprentice') && config.protectionDepth !== 'hidden',
    showPowerFlow: isTierAtLeast(tier, 'Apprentice'),
    showTopologyOverlay: isTierAtLeast(tier, 'Engineer'),
    showThermalOverlay: isTierAtLeast(tier, 'Apprentice'),
    showThreePhase: isTierAtLeast(tier, 'Student') && (tier !== 'Student' || Boolean(scenarioAllowsThreePhase)),
    showDebug: isTierAtLeast(tier, 'Engineer'),
    showAdvancedMetadata: isTierAtLeast(tier, 'Engineer'),
    showEventLogDetails: isTierAtLeast(tier, 'Apprentice') || scenarioProtection,
    allowFaultTools: isTierAtLeast(tier, 'Student'),
    allowDrawingTools: isTierAtLeast(tier, 'Apprentice'),
    simplifiedLabels: !isTierAtLeast(tier, 'Apprentice'),
    largeControls: tier === 'Junior' || tier === 'Student'
  };
}
