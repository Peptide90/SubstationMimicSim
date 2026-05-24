import { describe, expect, it } from 'vitest';
import type { ScenarioDefinition } from '../drawing/model';
import { adaptiveHintForObjective, adaptScenarioForTier, eventExplanation, explain, featureVisibilityForTier, isScenarioAvailableForTier, learnMore } from '../learning';
import { builtInScenarioPackages } from '../scenarios/builtInScenarios';

const scenario = (patch: Partial<ScenarioDefinition> = {}): ScenarioDefinition => ({
  id: 'scenario-learning',
  name: 'Learning scenario',
  description: 'A scenario for tier tests',
  learningObjectives: ['Operate safely'],
  mode: 'lesson',
  difficulty: 'intro',
  tags: [],
  initialSwitchStates: {},
  initialSourceStates: {},
  faults: [],
  relays: [],
  objectives: [{ id: 'obj-1', text: 'Energise bus', type: 'energise-target-busbar', targetObjectId: 'bus-1', hint: 'Close the correct breaker.' }],
  ...patch
});

describe('Mimic Designer V2 learning-tier framework', () => {
  it('changes feature visibility by tier', () => {
    const junior = featureVisibilityForTier('Junior');
    const apprentice = featureVisibilityForTier('Apprentice');
    const commissioning = featureVisibilityForTier('Commissioning Engineer');

    expect(junior.showProtectionManager).toBe(false);
    expect(junior.showTopologyOverlay).toBe(false);
    expect(junior.showThreePhase).toBe(false);
    expect(apprentice.showProtectionManager).toBe(true);
    expect(apprentice.showThermalOverlay).toBe(true);
    expect(commissioning.showTopologyOverlay).toBe(true);
    expect(commissioning.showAdvancedMetadata).toBe(true);
  });

  it('filters lessons by supported tier metadata', () => {
    const juniorOnly = scenario({ minTier: 'Junior', maxTier: 'Junior' });
    const engineerOnly = scenario({ minTier: 'Engineer' });

    expect(isScenarioAvailableForTier(juniorOnly, 'Junior')).toBe(true);
    expect(isScenarioAvailableForTier(juniorOnly, 'Engineer')).toBe(false);
    expect(isScenarioAvailableForTier(engineerOnly, 'Apprentice')).toBe(false);
    expect(isScenarioAvailableForTier(engineerOnly, 'Commissioning Engineer')).toBe(true);
  });

  it('renders adaptive terminology and learn-more expansions', () => {
    expect(explain('current-flowing', 'Junior')).toContain('Electricity');
    expect(explain('current-flowing', 'Commissioning Engineer')).toContain('per-phase current');
    expect(learnMore('power-flow', 'Student').map((item) => item.tier)).toEqual(['Apprentice', 'Engineer', 'Commissioning Engineer']);
  });

  it('adapts scenario objectives, hints, restrictions, and failure tolerance', () => {
    const adapted = adaptScenarioForTier(scenario({
      tierObjectives: {
        Junior: [{ id: 'obj-jr', text: 'Make electricity flow safely', type: 'restore-supply-to-load', targetObjectId: 'load-1' }]
      }
    }), 'Junior');

    expect(adapted.objectives[0].text).toBe('Make electricity flow safely');
    expect(adapted.objectives[0].hint).toContain('Electricity');
    expect(adapted.restrictions?.disableTopologyOverlay).toBe(true);
    expect(adapted.failureRules?.maxWrongOperations).toBe(8);
  });

  it('uses tier-specific adaptive hints and feedback wording', () => {
    expect(adaptiveHintForObjective({ id: 'obj', text: 'Avoid DS load', type: 'avoid-disconnector-under-load' }, 'Junior')).toContain('proper switch');
    expect(adaptiveHintForObjective({ id: 'obj', text: 'Avoid DS load', type: 'avoid-disconnector-under-load' }, 'Commissioning Engineer')).toContain('CB first');
    expect(eventExplanation('Breaker tripped on voltage mismatch', 'protection', 'Student')).toContain('Different voltage levels');
  });

  it('ships junior-only and advanced built-in scenario metadata', () => {
    const junior = builtInScenarioPackages.find((pkg) => pkg.title.startsWith('Junior:'));
    const advanced = builtInScenarioPackages.find((pkg) => pkg.title === 'Breaker fail with backup trip');

    expect(junior?.scenario.maxTier).toBe('Junior');
    expect(isScenarioAvailableForTier(junior!.scenario, 'Engineer')).toBe(false);
    expect(advanced?.scenario.recommendedTier).toBe('Commissioning Engineer');
    expect(isScenarioAvailableForTier(advanced!.scenario, 'Engineer')).toBe(true);
  });
});
