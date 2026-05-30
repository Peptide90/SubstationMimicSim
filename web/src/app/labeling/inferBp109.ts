import type { Edge, Node } from "reactflow";

import type { NodeKind } from "../../core/model";
import { getMimicData } from "../mimic/graphUtils";

import { defaultPurposeDigit, schemaDefaultPrefix, voltageClassFromKv } from "./bp109";
import type { BayType, BP109Meta, CircuitType, PurposeDigit } from "./types";

const SWITCH_KINDS = new Set<NodeKind>(["cb", "ds", "es"]);

type Graph = {
  adjacency: Map<string, string[]>;
  busbarIdsByNode: Map<string, Set<string>>;
  nodeById: Map<string, Node>;
};

function buildGraph(nodes: Node[], edges: Edge[]): Graph {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, string[]>();
  const busbarIdsByNode = new Map<string, Set<string>>();

  const touch = (id: string, other: string) => {
    if (!adjacency.has(id)) adjacency.set(id, []);
    adjacency.get(id)!.push(other);
  };

  for (const edge of edges) {
    touch(edge.source, edge.target);
    touch(edge.target, edge.source);
    const busbarId = (edge.data as { busbarId?: string } | undefined)?.busbarId;
    if (busbarId) {
      for (const id of [edge.source, edge.target]) {
        const set = busbarIdsByNode.get(id) ?? new Set<string>();
        set.add(busbarId);
        busbarIdsByNode.set(id, set);
      }
    }
  }

  return { adjacency, busbarIdsByNode, nodeById };
}

function kindOf(nodeId: string, graph: Graph): NodeKind | null {
  const node = graph.nodeById.get(nodeId);
  if (!node) return null;
  return getMimicData(node)?.kind ?? null;
}

function bfsKinds(start: string, graph: Graph): Set<NodeKind> {
  const seen = new Set<string>();
  const kinds = new Set<NodeKind>();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const kind = kindOf(id, graph);
    if (kind) kinds.add(kind);
    for (const next of graph.adjacency.get(id) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return kinds;
}

function collectBusbarIds(start: string, graph: Graph): Set<string> {
  const seen = new Set<string>();
  const ids = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const bb of graph.busbarIdsByNode.get(id) ?? []) ids.add(bb);
    for (const next of graph.adjacency.get(id) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return ids;
}

function nodeX(nodeId: string, graph: Graph): number {
  return graph.nodeById.get(nodeId)?.position.x ?? 0;
}

function classifyCircuitType(nodeId: string, graph: Graph, bayTypeOverride: BayType): CircuitType {
  if (bayTypeOverride === "LINE") return "LINE";
  if (bayTypeOverride === "TX") {
    const kinds = bfsKinds(nodeId, graph);
    return kinds.has("tx") ? sideOfTransformer(nodeId, graph) : "TX_HV";
  }
  if (bayTypeOverride === "BUS") {
    const busIds = collectBusbarIds(nodeId, graph);
    return busIds.size >= 2 ? "MAIN_BUS_SEC" : "BUS_COUPLER";
  }

  const kinds = bfsKinds(nodeId, graph);
  if (kinds.has("iface")) return "LINE";
  if (kinds.has("tx")) return sideOfTransformer(nodeId, graph);
  if (kinds.has("source")) return "LINE";

  const busIds = collectBusbarIds(nodeId, graph);
  if (busIds.size >= 3) return "MAIN_BUS_SEC";
  if (busIds.size >= 2) return "BUS_COUPLER";
  return "LINE";
}

function sideOfTransformer(nodeId: string, graph: Graph): CircuitType {
  const txNodes = [...graph.nodeById.keys()].filter((id) => kindOf(id, graph) === "tx");
  if (!txNodes.length) return "TX_HV";

  let nearestTx = txNodes[0]!;
  let nearestDist = Infinity;
  for (const txId of txNodes) {
    const dist = bfsDistance(nodeId, txId, graph);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestTx = txId;
    }
  }

  const txX = nodeX(nearestTx, graph);
  const nodeSide = nodeX(nodeId, graph);
  const busbarSide = inferBusbarSide(nearestTx, graph);
  if (busbarSide === null) return nodeSide <= txX ? "TX_HV" : "TX_LV";
  return Math.abs(nodeSide - busbarSide) <= Math.abs(nodeSide - txX) ? "TX_HV" : "TX_LV";
}

function inferBusbarSide(txId: string, graph: Graph): number | null {
  const visited = new Set<string>();
  const queue = [txId];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const kind = kindOf(id, graph);
    if (kind === "iface" || kind === "source") return nodeX(id, graph);
    for (const next of graph.adjacency.get(id) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return null;
}

function bfsDistance(from: string, to: string, graph: Graph): number {
  const seen = new Set<string>([from]);
  const queue: Array<{ id: string; dist: number }> = [{ id: from, dist: 0 }];
  while (queue.length) {
    const { id, dist } = queue.shift()!;
    if (id === to) return dist;
    for (const next of graph.adjacency.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ id: next, dist: dist + 1 });
    }
  }
  return Infinity;
}

function lineBayGroups(graph: Graph): Map<string, number> {
  const ifaceNodes = [...graph.nodeById.keys()].filter((id) => {
    const kind = kindOf(id, graph);
    return kind === "iface" || kind === "source";
  });

  const groups = new Map<string, Set<string>>();
  for (const ifaceId of ifaceNodes) {
    const key = [...bfsReachableSwitchgear(ifaceId, graph)].sort().join("|");
    if (!key) continue;
    const set = groups.get(key) ?? new Set<string>();
    for (const id of key.split("|")) set.add(id);
    groups.set(key, set);
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    const ax = Math.min(...[...a].map((id) => nodeX(id, graph)));
    const bx = Math.min(...[...b].map((id) => nodeX(id, graph)));
    return ax - bx;
  });

  const circuitByNode = new Map<string, number>();
  sortedGroups.forEach((memberIds, index) => {
    const circuitNumber = index + 1;
    for (const id of memberIds) circuitByNode.set(id, circuitNumber);
  });
  return circuitByNode;
}

function bfsReachableSwitchgear(start: string, graph: Graph): Set<string> {
  const seen = new Set<string>();
  const switches = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const kind = kindOf(id, graph);
    if (kind && SWITCH_KINDS.has(kind)) switches.add(id);
    for (const next of graph.adjacency.get(id) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return switches;
}

function assignCircuitNumbers(
  entries: Array<{ nodeId: string; circuitType: CircuitType }>,
  graph: Graph
): Map<string, number> {
  const lineBayNumbers = lineBayGroups(graph);
  const byType = new Map<CircuitType, string[]>();

  for (const { nodeId, circuitType } of entries) {
    const list = byType.get(circuitType) ?? [];
    if (!list.includes(nodeId)) list.push(nodeId);
    byType.set(circuitType, list);
  }

  const result = new Map<string, number>();
  for (const [circuitType, nodeIds] of byType) {
    if (circuitType === "LINE") {
      for (const nodeId of nodeIds) {
        result.set(nodeId, lineBayNumbers.get(nodeId) ?? 1);
      }
      continue;
    }

    const sorted = [...nodeIds].sort((a, b) => nodeX(a, graph) - nodeX(b, graph));
    sorted.forEach((nodeId, index) => result.set(nodeId, index + 1));
  }
  return result;
}

function inferPurposeDigit(
  nodeId: string,
  kind: NodeKind,
  circuitType: CircuitType,
  graph: Graph
): PurposeDigit {
  if (kind !== "ds") return defaultPurposeDigit(kind, circuitType);

  const switchesOnPath = [...bfsReachableSwitchgear(nodeId, graph)].filter((id) => kindOf(id, graph) === "ds");
  const ordered = switchesOnPath.sort((a, b) => nodeX(a, graph) - nodeX(b, graph));
  const index = ordered.indexOf(nodeId);
  if (index === 0 && (circuitType === "LINE" || circuitType.startsWith("TX"))) return 4;
  if (index === ordered.length - 1 && ordered.length > 1) return 3;
  return defaultPurposeDigit(kind, circuitType);
}

function mergeMeta(base: BP109Meta, overrides?: Partial<BP109Meta>): BP109Meta {
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    enabled: overrides.enabled ?? base.enabled,
    voltageClass: overrides.voltageClass ?? base.voltageClass,
    circuitType: overrides.circuitType ?? base.circuitType,
    circuitNumber: overrides.circuitNumber ?? base.circuitNumber,
    purposeDigit: overrides.purposeDigit ?? base.purposeDigit,
  };
}

export function inferBp109Meta(
  nodes: Node[],
  edges: Edge[],
  bayTypeOverrides: Record<string, BayType> = {},
  userOverrides: Record<string, Partial<BP109Meta>> = {},
  substationVoltageKv = 400
): Record<string, BP109Meta> {
  const graph = buildGraph(nodes, edges);
  const voltageClass = voltageClassFromKv(substationVoltageKv);
  const prefix = schemaDefaultPrefix(voltageClass);

  const switchNodes = nodes
    .map((n) => ({ id: n.id, kind: getMimicData(n)?.kind }))
    .filter((entry): entry is { id: string; kind: NodeKind } => !!entry.kind && SWITCH_KINDS.has(entry.kind));

  const classified = switchNodes.map(({ id, kind }) => ({
    nodeId: id,
    kind,
    circuitType: classifyCircuitType(id, graph, bayTypeOverrides[id] ?? "AUTO"),
  }));

  const circuitNumbers = assignCircuitNumbers(
    classified.map(({ nodeId, circuitType }) => ({ nodeId, circuitType })),
    graph
  );

  const result: Record<string, BP109Meta> = {};
  for (const { nodeId, kind, circuitType } of classified) {
    const inferred: BP109Meta = {
      enabled: true,
      voltageClass,
      prefix,
      circuitType,
      circuitNumber: circuitNumbers.get(nodeId) ?? 1,
      purposeDigit: inferPurposeDigit(nodeId, kind, circuitType, graph),
      suffixLetter: "",
    };
    result[nodeId] = mergeMeta(inferred, userOverrides[nodeId]);
  }

  return result;
}

export function resolveBp109Meta(
  nodes: Node[],
  edges: Edge[],
  bayTypeOverrides: Record<string, BayType>,
  userOverrides: Record<string, Partial<BP109Meta>>,
  substationVoltageKv?: number
): Record<string, BP109Meta> {
  return inferBp109Meta(nodes, edges, bayTypeOverrides, userOverrides, substationVoltageKv ?? 400);
}
