import type { Edge as RFEdge, Node as RFNode } from 'reactflow';
import type { MimicEdge, MimicNode, NodeKind, SwitchState } from '../core/model';

type MimicData = {
  kind: NodeKind;
  state?: SwitchState;
  sourceOn?: boolean;
  label?: string;
  tags?: string[];
};

export function getMimicData(n: RFNode): MimicData | null {
  const d = n.data as any;
  if (!d) return null;

  // Allow either data.kind or data.mimic.kind
  const mimic = (d.mimic ?? d) as MimicData;
  if (!mimic?.kind) return null;

  return mimic;
}

export function flowToMimic(nodes: RFNode[], edges: RFEdge[]): { nodes: MimicNode[]; edges: MimicEdge[] } {
  const mimicNodes: MimicNode[] = nodes
    .map((n) => {
      const md = getMimicData(n);
      if (!md) return null;

      return {
        id: n.id,
        kind: md.kind,
        label: md.label,
        tags: md.tags,
        state: md.state,
        sourceOn: md.sourceOn,
      } satisfies MimicNode;
    })
    .filter((x): x is MimicNode => x !== null);

  const mimicEdges: MimicEdge[] = edges
    .filter((e) => !!e.source && !!e.target)
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));

  return { nodes: mimicNodes, edges: mimicEdges };
}
