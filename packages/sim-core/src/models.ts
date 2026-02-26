import type { Corridor, GridNode } from '@scenarios/types';
import type { CorridorState, SimMetrics } from './types';

const nominalFrequency = 50;

export function computeCorridorFlows(nodes: GridNode[], corridors: Corridor[], nodeOutputMw: Record<string, number>): CorridorState[] {
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return corridors.map((corridor) => {
    const fromNode = nodeById[corridor.from];
    const toNode = nodeById[corridor.to];
    const push = Math.max(nodeOutputMw[fromNode.id], 0);
    const pull = Math.abs(Math.min(nodeOutputMw[toNode.id], 0));
    const flowMw = corridor.outOfService ? 0 : Math.min((push + pull) * 0.5, corridor.thermalLimitMw * 1.3);
    return {
      id: corridor.id,
      flowMw,
      outOfService: Boolean(corridor.outOfService),
      loadingPct: (flowMw / corridor.thermalLimitMw) * 100
    };
  });
}

export function computeFrequency(metrics: Pick<SimMetrics, 'frequencyHz'>, imbalanceMw: number): { frequencyHz: number; rocofHzPerS: number } {
  const inertia = 7000;
  const droop = 0.0009;
  const rocofHzPerS = -(imbalanceMw / inertia);
  const pulled = metrics.frequencyHz + rocofHzPerS - (metrics.frequencyHz - nominalFrequency) * droop;
  return { frequencyHz: Math.min(50.3, Math.max(49, pulled)), rocofHzPerS };
}

export function aggregateMetrics(nodes: GridNode[], nodeOutputMw: Record<string, number>, timeSec: number, frequencyHz: number, rocofHzPerS: number): SimMetrics {
  const generationMw = nodes.filter((n) => nodeOutputMw[n.id] > 0).reduce((acc, n) => acc + nodeOutputMw[n.id], 0);
  const loadMw = Math.abs(nodes.filter((n) => nodeOutputMw[n.id] < 0).reduce((acc, n) => acc + nodeOutputMw[n.id], 0));
  const reserveMw = Math.max(0, generationMw - loadMw);
  const weighted = nodes
    .filter((n) => nodeOutputMw[n.id] > 0)
    .reduce(
      (acc, n) => {
        const output = nodeOutputMw[n.id];
        const co2 = n.co2Intensity ?? 250;
        return { mw: acc.mw + output, co2Sum: acc.co2Sum + output * co2 };
      },
      { mw: 0, co2Sum: 0 }
    );

  return {
    timeSec,
    frequencyHz,
    rocofHzPerS,
    generationMw,
    loadMw,
    reserveMw,
    co2Intensity: weighted.mw > 0 ? weighted.co2Sum / weighted.mw : 0
  };
}
