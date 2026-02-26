export * from './types';
export * from './uk-tutorial';

import { ukBandATutorial } from './uk-tutorial';
import type { AgeBand, Scenario } from './types';

const scenarios: Scenario[] = [ukBandATutorial];

export const listScenariosByBand = (ageBand: AgeBand) => scenarios.filter((s) => s.ageBand === ageBand);
export const getScenarioById = (id: string) => scenarios.find((s) => s.id === id);
