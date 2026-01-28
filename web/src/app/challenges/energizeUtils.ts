import type { Edge, Node } from "reactflow";

import { computeEnergized } from "../../core/energize";
import { flowToMimicLocal, getMimicData } from "../mimic/graphUtils";

export function getChallengeEnergized(nodes: Node[], edges: Edge[]) {
  const { nodes: mimicNodes, edges: mimicEdges } = flowToMimicLocal(nodes, edges);
  const nodesForEnergize = mimicNodes.map((n: any) => {
    if (n.kind !== "iface") return n;
    const label = n.label ?? n.id;
    const isSource = n.id.startsWith("SRC") || String(label).toLowerCase().includes("source");
    return isSource ? { ...n, kind: "source", sourceOn: true } : n;
  });
  return computeEnergized(nodesForEnergize as any, mimicEdges as any);
}

export function getChallengeLoadIds(nodes: Node[]) {
  return nodes
    .filter((n) => getMimicData(n)?.kind === "iface")
    .filter((n) => {
      const label = (n.data as any)?.label ?? n.id;
      return n.id.startsWith("LOAD") || String(label).toLowerCase().includes("load");
    })
    .map((n) => n.id);
}
