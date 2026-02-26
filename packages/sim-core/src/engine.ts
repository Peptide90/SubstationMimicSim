import type { AllowedAction, Scenario } from '@scenarios/types';
import { aggregateMetrics, computeCorridorFlows, computeFrequency } from './models';
import type { SimState, StepResult } from './types';

export class ScenarioEngine {
  private state: SimState;

  constructor(private readonly scenario: Scenario) {
    const nodeOutputMw = Object.fromEntries(scenario.network.nodes.map((n) => [n.id, n.baseMw]));
    const corridors = computeCorridorFlows(scenario.network.nodes, scenario.network.corridors, nodeOutputMw);
    this.state = {
      scenario,
      nodeOutputMw,
      corridors,
      eventLog: ['00:00 Scenario started.'],
      paused: false,
      metrics: aggregateMetrics(scenario.network.nodes, nodeOutputMw, 0, 50, 0)
    };
  }

  getState(): SimState {
    return this.state;
  }

  applyAction(action: AllowedAction): void {
    if (action.type === 'dispatch' || action.type === 'toggle-interconnector') {
      const nodeId = String(action.payload.nodeId);
      const delta = Number(action.payload.deltaMw ?? 0);
      this.state.nodeOutputMw[nodeId] = (this.state.nodeOutputMw[nodeId] ?? 0) + delta;
      this.state.eventLog.push(`${this.formatClock(this.state.metrics.timeSec)} ACTION ${action.label}`);
    }
    this.state.paused = false;
    this.state.pendingPauseId = undefined;
  }

  step(deltaSec = 1): StepResult {
    if (this.state.paused) return { state: this.state };

    const nextTime = this.state.metrics.timeSec + deltaSec;
    this.runEvents(nextTime);

    const generation = Object.values(this.state.nodeOutputMw).filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const load = Math.abs(Object.values(this.state.nodeOutputMw).filter((v) => v < 0).reduce((a, b) => a + b, 0));
    const imbalance = load - generation;
    const freq = computeFrequency(this.state.metrics, imbalance);

    this.state.corridors = computeCorridorFlows(this.scenario.network.nodes, this.scenario.network.corridors, this.state.nodeOutputMw);
    this.state.metrics = aggregateMetrics(this.scenario.network.nodes, this.state.nodeOutputMw, nextTime, freq.frequencyHz, freq.rocofHzPerS);

    const pause = this.scenario.pauses.find((p) => p.atSecond === nextTime);
    if (pause) {
      this.state.paused = true;
      this.state.pendingPauseId = pause.id;
      this.state.eventLog.push(`${this.formatClock(nextTime)} AUTO-PAUSE ${pause.message}`);
      return { state: this.state, pauseMessage: pause.message };
    }

    return { state: this.state };
  }

  private runEvents(atSecond: number): void {
    for (const event of this.scenario.events.filter((e) => e.atSecond === atSecond)) {
      if (event.updates?.nodeDeltasMw) {
        for (const [nodeId, delta] of Object.entries(event.updates.nodeDeltasMw)) {
          this.state.nodeOutputMw[nodeId] = (this.state.nodeOutputMw[nodeId] ?? 0) + delta;
        }
      }
      this.state.eventLog.push(event.log);
    }
  }

  private formatClock(totalSec: number): string {
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }
}
