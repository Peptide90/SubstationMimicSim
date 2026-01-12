export type NodeKind =
  | 'source'
  | 'cb'
  | 'ds'
  | 'es'
  | 'load'
  | 'xfmr'
  | 'junction'; // new hidden/utility node type

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

export type EdgeKind = 'busbar' | 'wire';

export interface MimicEdge {
  id: string;
  source: string;
  target: string;

  // New: identify edges that are busbars vs wires
  kind?: EdgeKind;

  // New: stable identity for a whole busbar even when split
  busbarId?: string;
}

export type Rule =
  | {
      type: 'requires';
      action: { nodeId: string; to: SwitchState };
      requires: Array<{ nodeId: string; state: SwitchState }>;
    }
  | {
      type: 'forbids';
      action: { nodeId: string; to: SwitchState };
      forbids: Array<{ nodeId: string; state: SwitchState }>;
    }
  | { type: 'mutex'; nodes: string[] };

export interface MimicProject {
  schemaVersion: '1.0';
  nodes: MimicNode[];
  edges: MimicEdge[];
  rules: Rule[];
}
