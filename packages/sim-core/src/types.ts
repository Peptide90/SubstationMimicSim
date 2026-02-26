import type { Scenario } from '@scenarios/types';

export interface CorridorState {
  id: string;
  flowMw: number;
  loadingPct: number;
  outOfService: boolean;
}

export interface SimMetrics {
  timeSec: number;
  frequencyHz: number;
  rocofHzPerS: number;
  generationMw: number;
  loadMw: number;
  reserveMw: number;
  co2Intensity: number;
}

export interface SimState {
  scenario: Scenario;
  nodeOutputMw: Record<string, number>;
  corridors: CorridorState[];
  eventLog: string[];
  metrics: SimMetrics;
  paused: boolean;
  pendingPauseId?: string;
}

export interface StepResult {
  state: SimState;
  pauseMessage?: string;
}
