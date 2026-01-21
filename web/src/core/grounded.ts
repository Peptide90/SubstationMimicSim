import type { MimicEdge, MimicNode, NodeKind, SwitchState } from "./model";

function isConducting(kind: NodeKind, state?: SwitchState, sourceOn?: boolean): boolean {
  if (kind === "source") return sourceOn === true;
  if (kind === "cb" || kind === "ds") return state === "closed";
  if (kind === "es") return false;
  return true;
}

export function computeGroundedVisual(nodes: MimicNode[], edges: MimicEdge[]) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, Array<{ other: string; edgeId: string }>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push({ other: e.target, edgeId: e.id });
    adj.get(e.target)!.push({ other: e.source, edgeId: e.id });
  }

  const groundedNodeIds = new Set<string>();
  const groundedEdgeIds = new Set<string>();
  const queue: string[] = nodes.filter((n) => n.kind === "es" && n.state === "closed").map((n) => n.id);

  while (queue.length) {
    const id = queue.shift()!;
    if (groundedNodeIds.has(id)) continue;
    const node = nodeById.get(id);
    if (!node || node.kind === "source") continue;

    groundedNodeIds.add(id);

    for (const { other, edgeId } of adj.get(id) ?? []) {
      const otherNode = nodeById.get(other);
      if (!otherNode) continue;

      groundedEdgeIds.add(edgeId);
      if (otherNode.kind === "source") continue;

      if (otherNode.kind === "es") {
        groundedNodeIds.add(otherNode.id);
        continue;
      }
      if ((otherNode.kind === "ds" || otherNode.kind === "cb") && otherNode.state !== "closed") {
        groundedNodeIds.add(otherNode.id);
        continue;
      }
      if (isConducting(otherNode.kind, otherNode.state, otherNode.sourceOn)) queue.push(other);
    }
  }

  return { groundedNodeIds, groundedEdgeIds };
}
