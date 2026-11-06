import type { DrawingDocument, ElectricalSymbol, LearningTier, ScenarioDefinition, SwitchingVerb } from '../drawing/model';
import { learningTierOrder } from '../learning/tiers';
import { objectiveFields } from './scenarioDraft';

/**
 * Checks a scenario against the drawing it runs on, before a learner finds the
 * problem the hard way. Errors make the scenario impossible or misleading to
 * play; warnings are gaps worth filling, chiefly in tier coverage.
 */
export interface AuthoringIssue {
  severity: 'error' | 'warning';
  message: string;
  /** Where to look: 'overview', 'objectives', 'steps', 'sheets' or 'rules'. */
  area: 'overview' | 'objectives' | 'steps' | 'sheets' | 'rules';
  itemId?: string;
}

const verbDevices: Record<SwitchingVerb, ElectricalSymbol['type'][]> = {
  open: ['circuit-breaker', 'disconnector', 'busbar-coupler'],
  close: ['circuit-breaker', 'disconnector', 'busbar-coupler'],
  'check-open': ['circuit-breaker', 'disconnector', 'busbar-coupler', 'earth-switch'],
  'check-closed': ['circuit-breaker', 'disconnector', 'busbar-coupler', 'earth-switch'],
  'open-lock-caution': ['circuit-breaker', 'disconnector'],
  'check-open-lock-caution': ['circuit-breaker', 'disconnector'],
  'close-earth': ['earth-switch'],
  'close-earth-lock': ['earth-switch'],
  'open-earth': ['earth-switch'],
  'remove-lock-caution': ['circuit-breaker', 'disconnector', 'earth-switch']
};

const tierIndex = (tier?: LearningTier) => (tier ? learningTierOrder.indexOf(tier) : -1);

export function validateScenario(scenario: ScenarioDefinition, doc: DrawingDocument): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  const objectIds = new Set([...doc.objects.symbols, ...doc.objects.conductors, ...doc.objects.busbars].map((item) => item.id));
  const symbols = new Map(doc.objects.symbols.map((symbol) => [symbol.id, symbol]));
  const nameOf = (id?: string) => (id ? symbols.get(id)?.label?.text?.trim() || id : '');
  const sheets = new Map((scenario.switchingSheets ?? []).map((sheet) => [sheet.id, sheet]));
  const objectiveIndex = new Map(scenario.objectives.map((objective, index) => [objective.id, index]));

  // Overview
  if (!scenario.name?.trim()) issues.push({ severity: 'error', area: 'overview', message: 'Give the scenario a name.' });
  if (tierIndex(scenario.minTier) > -1 && tierIndex(scenario.maxTier) > -1 && tierIndex(scenario.minTier) > tierIndex(scenario.maxTier)) {
    issues.push({ severity: 'error', area: 'overview', message: `The lowest tier (${scenario.minTier}) is above the highest (${scenario.maxTier}), so no learner can see it.` });
  }
  const audience = learningTierOrder.filter((tier) => (tierIndex(scenario.minTier) < 0 || tierIndex(tier) >= tierIndex(scenario.minTier)) && (tierIndex(scenario.maxTier) < 0 || tierIndex(tier) <= tierIndex(scenario.maxTier)));
  const unexplained = audience.filter((tier) => !scenario.explanationVariants?.[tier]?.trim());
  if (unexplained.length && unexplained.length < audience.length) {
    issues.push({ severity: 'warning', area: 'overview', message: `No explanation written for ${unexplained.join(', ')}. Those learners will see none.` });
  }

  // Objectives
  if (!scenario.objectives.length) issues.push({ severity: 'error', area: 'objectives', message: 'Add at least one objective: without one the scenario can never be completed.' });
  for (const [index, objective] of scenario.objectives.entries()) {
    const label = `Objective ${index + 1} ("${objective.text}")`;
    const type = objective.type ?? 'operate-switchgear';
    const fields = objectiveFields(type);
    if (fields.targetRequired && !objective.targetObjectId) issues.push({ severity: 'error', area: 'objectives', itemId: objective.id, message: `${label} needs a target.` });
    if (objective.targetObjectId && !objectIds.has(objective.targetObjectId)) issues.push({ severity: 'error', area: 'objectives', itemId: objective.id, message: `${label} targets ${objective.targetObjectId}, which is not on the drawing.` });
    if (fields.secondary && !objective.secondaryObjectId) issues.push({ severity: 'error', area: 'objectives', itemId: objective.id, message: `${label} needs a second endpoint.` });
    if (objective.secondaryObjectId && !objectIds.has(objective.secondaryObjectId)) issues.push({ severity: 'error', area: 'objectives', itemId: objective.id, message: `${label}'s second endpoint is not on the drawing.` });
    if (type === 'operate-switchgear' && objective.targetObjectId && symbols.has(objective.targetObjectId)) {
      const device = symbols.get(objective.targetObjectId)!;
      if (!['circuit-breaker', 'disconnector', 'earth-switch', 'busbar-coupler'].includes(device.type)) {
        issues.push({ severity: 'error', area: 'objectives', itemId: objective.id, message: `${label} asks to switch ${nameOf(device.id)}, which is a ${device.type.replace(/-/g, ' ')} and cannot be switched.` });
      }
    }
    if (type === 'include-component' && !objective.componentTypes?.length && !Object.keys(objective.requiredCounts ?? {}).length) {
      issues.push({ severity: 'error', area: 'objectives', itemId: objective.id, message: `${label} does not say which equipment to include.` });
    }
    if (type === 'complete-switching-sheet' && !sheets.has(objective.sheetId ?? '')) {
      issues.push({ severity: 'error', area: 'objectives', itemId: objective.id, message: `${label} refers to a switching sheet that does not exist.` });
    }
    for (const required of objective.requires ?? []) {
      const at = objectiveIndex.get(required);
      if (at === undefined) issues.push({ severity: 'error', area: 'objectives', itemId: objective.id, message: `${label} requires an objective that no longer exists.` });
      else if (at >= index) issues.push({ severity: 'error', area: 'objectives', itemId: objective.id, message: `${label} requires objective ${at + 1}, which comes after it. Requirements must come first.` });
    }
  }

  // Teaching steps
  for (const [index, step] of (scenario.teachingSteps ?? []).entries()) {
    const label = `Step ${index + 1} ("${step.title}")`;
    if (step.waitFor === 'objective-complete' && !objectiveIndex.has(step.objectiveId ?? '')) {
      issues.push({ severity: 'error', area: 'steps', itemId: step.id, message: `${label} waits for an objective that does not exist, so the lesson will stop here.` });
    }
    if (step.waitFor === 'correct-state' && (!(step.expectedObjectId ?? step.targetObjectId) || !step.expectedState)) {
      issues.push({ severity: 'error', area: 'steps', itemId: step.id, message: `${label} waits for a device state but does not say which device or state.` });
    }
    if (step.waitFor === 'manual' && index < (scenario.teachingSteps?.length ?? 0) - 1) {
      issues.push({ severity: 'warning', area: 'steps', itemId: step.id, message: `${label} waits for nothing, so the lesson cannot move past it. Make it wait for an objective or a device state.` });
    }
    if (step.eventIdToTrigger && !(scenario.events ?? []).some((event) => event.id === step.eventIdToTrigger)) {
      issues.push({ severity: 'error', area: 'steps', itemId: step.id, message: `${label} triggers an event that does not exist.` });
    }
  }

  // Switching sheets
  for (const sheet of scenario.switchingSheets ?? []) {
    if (!sheet.instructions.length) issues.push({ severity: 'error', area: 'sheets', itemId: sheet.id, message: `Sheet "${sheet.title}" has no lines.` });
    for (const [index, line] of sheet.instructions.entries()) {
      const label = `Sheet "${sheet.title}" line ${index + 1}`;
      const device = symbols.get(line.targetObjectId);
      if (!device) {
        issues.push({ severity: 'error', area: 'sheets', itemId: line.id, message: `${label} has no device on the drawing.` });
        continue;
      }
      if (!verbDevices[line.verb].includes(device.type)) {
        issues.push({ severity: 'error', area: 'sheets', itemId: line.id, message: `${label}: "${line.verb.replace(/-/g, ' ')}" cannot be done to ${nameOf(device.id)}, a ${device.type.replace(/-/g, ' ')}.` });
      }
      if (line.report?.kind === 'line-end-colours' && !sheet.lineEndColours?.[line.report.targetObjectId]?.length) {
        issues.push({ severity: 'error', area: 'sheets', itemId: line.id, message: `${label} asks for line-end colours at ${nameOf(line.report.targetObjectId)}, but none are painted there.` });
      }
    }
    if (!scenario.objectives.some((objective) => objective.type === 'complete-switching-sheet' && objective.sheetId === sheet.id)) {
      issues.push({ severity: 'warning', area: 'sheets', itemId: sheet.id, message: `Sheet "${sheet.title}" is not graded: add a "complete a switching sheet" objective for it.` });
    }
  }

  // Rules
  if (scenario.tags?.includes('build')) {
    const fixtures = scenario.restrictions?.lockedObjectIds ?? [];
    if (!fixtures.length) issues.push({ severity: 'warning', area: 'rules', message: 'This build exercise has no fixtures, so the learner starts from an empty canvas.' });
    for (const fixture of fixtures) if (!objectIds.has(fixture)) issues.push({ severity: 'error', area: 'rules', message: `Fixture ${fixture} is not on the drawing.` });
    if (!scenario.restrictions?.allowedComponentTypes?.length) issues.push({ severity: 'warning', area: 'rules', message: 'Every kind of equipment is offered in the palette. Choose the parts this exercise is about.' });
  }

  return issues;
}
