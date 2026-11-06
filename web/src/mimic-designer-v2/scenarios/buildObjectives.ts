import type { DrawingDocument, ElectricalSymbol } from '../drawing/model';
import type { TopologyGraph } from '../topology/types';

/**
 * Grading for build objectives — whether a learner *constructed* the right
 * thing, independent of how it is currently switched.
 *
 * Connectivity here is physical: a path of conductors, busbars and devices,
 * whether or not the switchgear on it is closed. A correctly built bay with its
 * breaker open is still correctly built.
 */

/** Topology nodes attached to an object's terminals. */
function nodesOf(graph: TopologyGraph, objectId: string): string[] {
  return graph.terminals.filter((terminal) => terminal.parentObjectId === objectId).flatMap((terminal) => terminal.connectedNodeIds);
}

/** Every node physically reachable from the given object, ignoring switch state. */
export function physicallyReachableNodes(graph: TopologyGraph, fromObjectId: string): Set<string> {
  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a)!.push(b);
  };
  for (const branch of graph.branches) {
    link(branch.fromNodeId, branch.toNodeId);
    link(branch.toNodeId, branch.fromNodeId);
  }
  const seen = new Set<string>();
  const queue = nodesOf(graph, fromObjectId);
  while (queue.length) {
    const node = queue.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) if (!seen.has(next)) queue.push(next);
  }
  return seen;
}

export function physicallyConnected(graph: TopologyGraph, fromObjectId: string, toObjectId: string): boolean {
  if (fromObjectId === toObjectId) return true;
  const reachable = physicallyReachableNodes(graph, fromObjectId);
  return nodesOf(graph, toObjectId).some((node) => reachable.has(node));
}

/** Symbols physically connected to the given object, including the object itself. */
export function symbolsInIsland(doc: DrawingDocument, graph: TopologyGraph, objectId: string): ElectricalSymbol[] {
  const reachable = physicallyReachableNodes(graph, objectId);
  return doc.objects.symbols.filter((symbol) => symbol.id === objectId || nodesOf(graph, symbol.id).some((node) => reachable.has(node)));
}

export function countByType(symbols: ElectricalSymbol[]): Partial<Record<ElectricalSymbol['type'], number>> {
  const counts: Partial<Record<ElectricalSymbol['type'], number>> = {};
  for (const symbol of symbols) counts[symbol.type] = (counts[symbol.type] ?? 0) + 1;
  return counts;
}

/** Every listed type is present at least `count` times anywhere in the drawing. */
export function includesComponents(doc: DrawingDocument, types: ElectricalSymbol['type'][], count = 1): boolean {
  const counts = countByType(doc.objects.symbols);
  return types.length > 0 && types.every((type) => (counts[type] ?? 0) >= count);
}

/**
 * The two endpoints are physically joined, and the island joining them holds at
 * least the required equipment. Counting within the island — rather than across
 * the whole canvas, as the legacy evaluator did — means stray parts placed
 * elsewhere cannot satisfy the objective, while earth switches and VTs teed off
 * the bay still count.
 */
export function bayBuilt(
  doc: DrawingDocument,
  graph: TopologyGraph,
  fromObjectId: string,
  toObjectId: string,
  requiredCounts: Partial<Record<ElectricalSymbol['type'], number>> = {}
): boolean {
  if (!physicallyConnected(graph, fromObjectId, toObjectId)) return false;
  const counts = countByType(symbolsInIsland(doc, graph, fromObjectId));
  return Object.entries(requiredCounts).every(([type, required]) => (counts[type as ElectricalSymbol['type']] ?? 0) >= (required ?? 0));
}
