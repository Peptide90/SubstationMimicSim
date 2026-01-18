import type { MimicNode, MimicEdge, NodeKind } from './model';

export interface EnergizeResult {
  energizedNodeIds: Set<string>;
  energizedEdgeIds: Set<string>;
}

function isConducting(kind: NodeKind, nodeState?: string, sourceOn?: boolean): boolean {
  if (kind === 'source') return sourceOn === true;
  if (kind === 'cb' || kind === 'ds') return nodeState === 'closed';
  if (kind === 'es') return false; // ES is not through-conducting
  // junction/load/tx are pass-through for MVP
  return true;
}

export function computeEnergized(nodes: MimicNode[], edges: MimicEdge[]): EnergizeResult {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const adj = new Map<string, Array<{ other: string; edgeId: string }>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push({ other: e.target, edgeId: e.id });
    adj.get(e.target)!.push({ other: e.source, edgeId: e.id });
  }

  const energizedNodeIds = new Set<string>();
  const energizedEdgeIds = new Set<string>();

  const queue: string[] = nodes
    .filter((n) => n.kind === 'source' && n.sourceOn)
    .map((n) => n.id);

  while (queue.length) {
    const id = queue.shift()!;
    if (energizedNodeIds.has(id)) continue;

    const node = nodeById.get(id);
    if (!node) continue;

    if (!isConducting(node.kind, node.state, node.sourceOn)) continue;

    energizedNodeIds.add(id);

    for (const { other, edgeId } of adj.get(id) ?? []) {
      energizedEdgeIds.add(edgeId);

      const otherNode = nodeById.get(other);
      if (!otherNode) continue;

      if (isConducting(otherNode.kind, otherNode.state, otherNode.sourceOn)) {
        queue.push(other);
      }
    }
  }

  return { energizedNodeIds, energizedEdgeIds };
}
