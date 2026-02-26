import type { Edge, Node } from "reactflow";

import { getMimicData } from "../mimic/graphUtils";

export type BusVoltageState = "LOW" | "NORMAL" | "HIGH";
export type BusCurrentState = "UNDER" | "NOMINAL" | "OVER";

export type PowerSimResult = {
  edgeLoadingPct: Record<string, number>;
  edgeOverloaded: Set<string>;
  busVoltage: Record<string, BusVoltageState>;
  busCurrent: Record<string, BusCurrentState>;
  totals: {
    pMw: number;
    qMvar: number;
    sMva: number;
  };
};

type NodePower = {
  role: "source" | "load" | "neutral";
  pMw: number;
  qMvar: number;
  deviceType?: "shunt_reactor" | "cap_bank";
};

function isConductingNode(node: Node): boolean {
  const md = getMimicData(node);
  if (!md) return false;
  if (md.kind === "es") return false;
  if (md.kind === "cb" || md.kind === "ds") return md.state === "closed";
  if (md.kind === "source") return md.sourceOn === true;
  return true;
}

function getNodePower(node: Node): NodePower {
  const data = (node.data as any) ?? {};
  if (data.power) {
    return {
      role: data.power.role ?? "neutral",
      pMw: Number(data.power.pMw ?? 0),
      qMvar: Number(data.power.qMvar ?? 0),
      deviceType: data.power.deviceType,
    };
  }

  const label = String(data.label ?? "").toLowerCase();
  if (label.includes("source") || label.includes("import")) {
    return { role: "source", pMw: Number(data.pMw ?? 180), qMvar: Number(data.qMvar ?? 20) };
  }
  if (label.includes("load") || label.includes("export")) {
    return { role: "load", pMw: Number(data.pMw ?? 120), qMvar: Number(data.qMvar ?? 45) };
  }
  return { role: "neutral", pMw: 0, qMvar: 0 };
}

export function computePowerSim(nodes: Node[], edges: Edge[]): PowerSimResult {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const conductingEdges = edges.filter((e) => isConductingNode(nodeById.get(e.source)!) && isConductingNode(nodeById.get(e.target)!));
  const adjacency = new Map<string, Array<{ nodeId: string; edgeId: string }>>();
  for (const edge of conductingEdges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push({ nodeId: edge.target, edgeId: edge.id });
    adjacency.get(edge.target)!.push({ nodeId: edge.source, edgeId: edge.id });
  }

  const sources = nodes.filter((n) => getNodePower(n).role === "source");
  const loads = nodes.filter((n) => getNodePower(n).role === "load");

  const energizedSources = new Set<string>();
  for (const source of sources) {
    if (!isConductingNode(source)) continue;
    energizedSources.add(source.id);
  }

  const energizedNodes = new Set<string>();
  const seedQueue = Array.from(energizedSources);
  while (seedQueue.length) {
    const id = seedQueue.shift()!;
    if (energizedNodes.has(id)) continue;
    energizedNodes.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!energizedNodes.has(next.nodeId)) seedQueue.push(next.nodeId);
    }
  }

  const energizedLoads = loads.filter((load) => {
    if (!adjacency.has(load.id)) return false;
    const seen = new Set<string>();
    const queue = [load.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (energizedSources.has(id)) return true;
      for (const next of adjacency.get(id) ?? []) {
        if (!seen.has(next.nodeId)) queue.push(next.nodeId);
      }
    }
    return false;
  });

  const edgeFlowP: Record<string, number> = {};
  const edgeFlowQ: Record<string, number> = {};

  const sourceIds = Array.from(energizedSources);
  for (const load of energizedLoads) {
    const loadPower = getNodePower(load);
    const queue: Array<{ nodeId: string; pathEdges: string[]; pathNodes: string[] }> = [{ nodeId: load.id, pathEdges: [], pathNodes: [load.id] }];
    const candidatePaths: string[][] = [];
    let shortest = Infinity;

    while (queue.length) {
      const current = queue.shift()!;
      if (current.pathEdges.length > shortest) continue;
      if (sourceIds.includes(current.nodeId)) {
        shortest = current.pathEdges.length;
        candidatePaths.push(current.pathEdges);
        continue;
      }
      for (const next of adjacency.get(current.nodeId) ?? []) {
        if (current.pathNodes.includes(next.nodeId)) continue;
        queue.push({
          nodeId: next.nodeId,
          pathEdges: current.pathEdges.concat(next.edgeId),
          pathNodes: current.pathNodes.concat(next.nodeId),
        });
      }
    }

    const paths = candidatePaths.length > 0 ? candidatePaths : [];
    const split = paths.length > 0 ? 1 / paths.length : 0;
    for (const pathEdges of paths) {
      for (const edgeId of pathEdges) {
        edgeFlowP[edgeId] = (edgeFlowP[edgeId] ?? 0) + loadPower.pMw * split;
        edgeFlowQ[edgeId] = (edgeFlowQ[edgeId] ?? 0) + loadPower.qMvar * split;
      }
    }
  }

  const edgeLoadingPct: Record<string, number> = {};
  const edgeOverloaded = new Set<string>();
  const busCurrentPct: Record<string, number> = {};

  for (const edge of edges) {
    const p = edgeFlowP[edge.id] ?? 0;
    const q = edgeFlowQ[edge.id] ?? 0;
    const s = Math.sqrt(p * p + q * q);
    const rating = Number((edge.data as any)?.ratingMva ?? 100);
    const loadingPct = rating > 0 ? (s / rating) * 100 : 0;
    edgeLoadingPct[edge.id] = loadingPct;
    if (loadingPct > 100) edgeOverloaded.add(edge.id);

    const busbarIdForCurrent = (edge.data as any)?.busbarId;
    if (busbarIdForCurrent) {
      const prev = busCurrentPct[busbarIdForCurrent] ?? 0;
      busCurrentPct[busbarIdForCurrent] = Math.max(prev, loadingPct);
    }
  }

  // Build busbar connectivity (propagation) across energized conducting topology.
  const allBusbarIds = new Set<string>();
  const busbarIdsByNode = new Map<string, Set<string>>();
  for (const edge of conductingEdges) {
    const busbarId = (edge.data as any)?.busbarId as string | undefined;
    if (!busbarId) continue;
    allBusbarIds.add(busbarId);
    const a = busbarIdsByNode.get(edge.source) ?? new Set<string>();
    a.add(busbarId);
    busbarIdsByNode.set(edge.source, a);
    const b = busbarIdsByNode.get(edge.target) ?? new Set<string>();
    b.add(busbarId);
    busbarIdsByNode.set(edge.target, b);
  }

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of allBusbarIds) parent.set(id, id);

  for (const [nodeId, busIds] of busbarIdsByNode.entries()) {
    // Propagate only through energized nodes; open switchgear already removed via conductingEdges.
    if (!energizedNodes.has(nodeId)) continue;
    const list = Array.from(busIds);
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i += 1) union(list[0], list[i]);
  }

  const busContribution: Record<string, number> = {};
  for (const node of nodes) {
    if (!energizedNodes.has(node.id)) continue;
    const power = getNodePower(node);
    const connectedBusIds = new Set(
      edges
        .filter((edge) => edge.source === node.id || edge.target === node.id)
        .map((edge) => (edge.data as any)?.busbarId)
        .filter(Boolean)
    );
    if (connectedBusIds.size === 0) continue;
    let qContribution = 0;
    if (power.role === "load") qContribution += power.qMvar;
    if (power.role === "source") qContribution -= power.qMvar;
    if (power.deviceType === "shunt_reactor") qContribution += Math.abs(power.qMvar);
    if (power.deviceType === "cap_bank") qContribution -= Math.abs(power.qMvar);
    if (!adjacency.has(node.id) && power.deviceType) continue;

    const split = qContribution / connectedBusIds.size;
    for (const busId of connectedBusIds) {
      busContribution[busId] = (busContribution[busId] ?? 0) + split;
    }
  }

  const busVoltage: Record<string, BusVoltageState> = {};
  const componentNetQ = new Map<string, number>();
  const componentMaxCurrentPct = new Map<string, number>();
  for (const busId of allBusbarIds) {
    const root = find(busId);
    componentNetQ.set(root, (componentNetQ.get(root) ?? 0) + (busContribution[busId] ?? 0));
    componentMaxCurrentPct.set(root, Math.max(componentMaxCurrentPct.get(root) ?? 0, busCurrentPct[busId] ?? 0));
  }

  for (const busId of allBusbarIds) {
    const root = find(busId);
    const netQ = componentNetQ.get(root) ?? 0;

    let state: BusVoltageState;
    if (netQ > 30) state = "LOW";
    else if (netQ < -30) state = "HIGH";
    else state = "NORMAL";

    // Special-case phase 1 overload scenario: keep voltage nominal since the player
    // cannot influence reactive power in that lesson.
    if (busId.startsWith("p1-")) state = "NORMAL";

    busVoltage[busId] = state;
  }

  const busCurrent: Record<string, BusCurrentState> = {};
  for (const busId of allBusbarIds) {
    const root = find(busId);
    const pct = componentMaxCurrentPct.get(root) ?? 0;
    if (pct > 100) busCurrent[busId] = "OVER";
    else if (pct < 10) busCurrent[busId] = "UNDER";
    else busCurrent[busId] = "NOMINAL";
  }

  const totalP = energizedLoads.reduce((acc, load) => acc + getNodePower(load).pMw, 0);
  const totalQ = nodes.reduce((acc, node) => {
    if (!energizedNodes.has(node.id)) return acc;
    const power = getNodePower(node);
    if (power.role === "load") return acc + power.qMvar;
    if (power.deviceType === "shunt_reactor") return acc + Math.abs(power.qMvar);
    if (power.deviceType === "cap_bank") return acc - Math.abs(power.qMvar);
    return acc;
  }, 0);

  return {
    edgeLoadingPct,
    edgeOverloaded,
    busVoltage,
    busCurrent,
    totals: {
      pMw: totalP,
      qMvar: totalQ,
      sMva: Math.sqrt(totalP * totalP + totalQ * totalQ),
    },
  };
}
