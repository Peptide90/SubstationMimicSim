export type NodeKind = 'source' | 'bus' | 'cb' | 'ds' | 'es' | 'load' | 'xfmr';

export type SwitchState = 'open' | 'closed';

export interface MimicNode {
  id: string;
  kind: NodeKind;
  label?: string;
  tags?: string[];
  // For switches
  state?: SwitchState;
  // For sources
  sourceOn?: boolean;
}

export interface MimicEdge {
  id: string;
  source: string;
  target: string;
}

export type Rule =
  | { type: 'requires'; action: { nodeId: string; to: SwitchState }; requires: Array<{ nodeId: string; state: SwitchState }> }
  | { type: 'forbids'; action: { nodeId: string; to: SwitchState }; forbids: Array<{ nodeId: string; state: SwitchState }> }
  | { type: 'mutex'; nodes: string[] };

export interface MimicProject {
  schemaVersion: '1.0';
  nodes: MimicNode[];
  edges: MimicEdge[];
  rules: Rule[];
}
