import type { OperationState } from '../topology/operation';
import type { TopologyGraph } from '../topology/types';

export type ExportLineState = 'dead' | 'live' | 'earth' | 'fault';

export function exportLineStateForPath(pathId: string, topology: TopologyGraph, operateState: OperationState): ExportLineState {
  const branchIds = topology.branches.filter((branch) => branch.objectId === pathId).map((branch) => branch.id);
  const live = branchIds.some((id) => operateState.liveBranchIds.has(id));
  const earthed = branchIds.some((id) => operateState.earthedBranchIds.has(id));
  if (live && earthed) return 'fault';
  if (earthed) return 'earth';
  if (live) return 'live';
  return 'dead';
}
