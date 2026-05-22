import type { TopologyGraph } from './types';

export function traceFromSources(graph: TopologyGraph): Set<string> {
  const liveNodes = new Set<string>();
  const sourceNodeIds = graph.devices
    .filter((d) => d.type === 'source')
    .flatMap((d) => d.terminalIds)
    .flatMap((tid) => graph.terminals.find((t) => t.id === tid)?.connectedNodeIds ?? []);

  const queue = [...sourceNodeIds];
  while (queue.length) {
    const cur = queue.shift()!;
    if (liveNodes.has(cur)) continue;
    liveNodes.add(cur);
    graph.branches
      .filter((b) => b.fromNodeId === cur || b.toNodeId === cur)
      .forEach((b) => {
        const other = b.fromNodeId === cur ? b.toNodeId : b.fromNodeId;
        if (!liveNodes.has(other)) queue.push(other);
      });
  }

  return liveNodes;
}
