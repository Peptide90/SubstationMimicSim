import type { Phase, Point } from '../drawing/model';

export type EnergisationState = 'unknown' | 'live' | 'dead' | 'earthed' | 'faulted';

export interface ElectricalTerminal {
  id: string;
  parentObjectId: string;
  name: string;
  role: 'line' | 'bus' | 'hv' | 'lv' | 'earth' | 'measurement';
  localPosition: Point;
  worldPosition: Point;
  allowedPhases: Phase[];
  connectedNodeIds: string[];
}

export interface ElectricalNode {
  id: string;
  position: Point;
  phases: Phase[];
  terminalIds: string[];
  connectionPointRefs: string[];
  junction: boolean;
}

export interface ElectricalBranch {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: 'conductor' | 'busbar' | 'device-internal';
  objectId?: string;
  phases: Phase[];
}

export interface ElectricalDevice {
  id: string;
  symbolId: string;
  type: string;
  terminalIds: string[];
  phases: Phase[];
  energisation: EnergisationState;
}

export interface ElectricalIsland {
  id: string;
  nodeIds: string[];
  branchIds: string[];
  deviceIds: string[];
  hasSource: boolean;
}

export interface TopologyWarning {
  id: string;
  severity: 'warning' | 'error';
  code: string;
  message: string;
  objectId?: string;
}

export interface TopologyGraph {
  nodes: ElectricalNode[];
  branches: ElectricalBranch[];
  devices: ElectricalDevice[];
  terminals: ElectricalTerminal[];
  islands: ElectricalIsland[];
  warnings: TopologyWarning[];
}
