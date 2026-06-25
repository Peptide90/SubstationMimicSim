import type { ElectricalSymbol } from '../drawing/model';
import type { OperationState } from '../topology/operation';
import type { TopologyGraph } from '../topology/types';

export type SwitchgearVisualState = 'open' | 'closed-dead' | 'closed-live' | 'tripped';

export function isSwitchgearSymbol(type: ElectricalSymbol['type']): boolean {
  return type === 'circuit-breaker' || type === 'disconnector';
}

export function resolveSwitchgearVisualState(
  symbol: ElectricalSymbol,
  topology: TopologyGraph,
  operateState: OperationState
): SwitchgearVisualState | undefined {
  if (!isSwitchgearSymbol(symbol.type)) return undefined;
  if (symbol.operation?.tripped) return 'tripped';
  if (symbol.operation?.switchState !== 'closed') return 'open';

  const branchLive = topology.branches.some(
    (branch) => branch.objectId === symbol.id && operateState.liveBranchIds.has(branch.id)
  );
  if (branchLive) return 'closed-live';

  const terminalLive = topology.terminals
    .filter((terminal) => terminal.parentObjectId === symbol.id)
    .flatMap((terminal) => terminal.connectedNodeIds)
    .some((nodeId) => operateState.liveNodeIds.has(nodeId));

  return terminalLive ? 'closed-live' : 'closed-dead';
}

export function defaultSwitchgearVisualState(symbol: ElectricalSymbol): SwitchgearVisualState {
  if (symbol.operation?.tripped) return 'tripped';
  if (symbol.operation?.switchState === 'closed') return 'closed-dead';
  return 'open';
}
