import type { DrawingDocument, Phase } from '../drawing/model';
import { buildConnectivityPrimitives, extractTerminals, pointKey } from './connectivity';
import type { ElectricalBranch, ElectricalDevice, ElectricalIsland, ElectricalNode, TopologyGraph } from './types';

export function buildGraph(doc: DrawingDocument): TopologyGraph {
  const terminals = extractTerminals(doc);
  const primitives = buildConnectivityPrimitives(doc);
  const grouped = new Map<string, typeof primitives>();

  primitives.forEach((p) => {
    const key = pointKey(p.position);
    const list = grouped.get(key) ?? [];
    list.push(p);
    grouped.set(key, list);
  });

  const nodes: ElectricalNode[] = [...grouped.entries()].map(([key, points], i) => ({
    id: `node:${i}:${key}`,
    position: points[0].position,
    phases: [...new Set(points.flatMap((p) => p.phases as Phase[]))],
    terminalIds: points.filter((p) => p.source === 'terminal').map((p) => p.id),
    connectionPointRefs: points.filter((p) => p.source !== 'terminal').map((p) => p.id),
    junction: points.length > 2
  }));

  const nodeByRef = new Map<string, string>();
  nodes.forEach((n) => {
    n.terminalIds.forEach((t) => nodeByRef.set(t, n.id));
    n.connectionPointRefs.forEach((cp) => nodeByRef.set(cp, n.id));
  });

  terminals.forEach((t) => {
    const nodeId = nodeByRef.get(t.id);
    t.connectedNodeIds = nodeId ? [nodeId] : [];
  });

  const branches: ElectricalBranch[] = [];

  const connectPolyline = (id: string, cps: { id: string }[], phases: Phase[], kind: ElectricalBranch['kind']) => {
    for (let i = 1; i < cps.length; i += 1) {
      const a = nodeByRef.get(cps[i - 1].id);
      const b = nodeByRef.get(cps[i].id);
      if (!a || !b || a === b) continue;
      branches.push({ id: `branch:${id}:${i}`, fromNodeId: a, toNodeId: b, kind, objectId: id, phases });
    }
  };

  doc.objects.conductors.forEach((c) => connectPolyline(c.id, c.connectionPoints, c.phaseApplicability, 'conductor'));
  doc.objects.busbars.forEach((b) => connectPolyline(b.id, b.connectionPoints, b.phaseApplicability, 'busbar'));

  const devices: ElectricalDevice[] = doc.objects.symbols.map((s) => ({
    id: `dev:${s.id}`,
    symbolId: s.id,
    type: s.type,
    terminalIds: terminals.filter((t) => t.parentObjectId === s.id).map((t) => t.id),
    phases: s.phaseApplicability,
    energisation: 'unknown'
  }));

  devices.forEach((d) => {
    const localNodes = d.terminalIds.map((t) => nodeByRef.get(t)).filter(Boolean) as string[];
    for (let i = 1; i < localNodes.length; i += 1) {
      branches.push({ id: `device:${d.id}:${i}`, fromNodeId: localNodes[i - 1], toNodeId: localNodes[i], kind: 'device-internal', objectId: d.symbolId, phases: d.phases });
    }
  });

  const islands = deriveIslands(nodes, branches, devices);
  return { nodes, branches, devices, terminals, islands, warnings: [] };
}

function deriveIslands(nodes: ElectricalNode[], branches: ElectricalBranch[], devices: ElectricalDevice[]): ElectricalIsland[] {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));
  branches.forEach((b) => { adj.get(b.fromNodeId)?.push(b.toNodeId); adj.get(b.toNodeId)?.push(b.fromNodeId); });
  const visited = new Set<string>();
  const islands: ElectricalIsland[] = [];
  let idx = 0;

  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const queue = [n.id];
    const nodeIds: string[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      nodeIds.push(cur);
      (adj.get(cur) ?? []).forEach((next) => { if (!visited.has(next)) queue.push(next); });
    }
    const branchIds = branches.filter((b) => nodeIds.includes(b.fromNodeId) && nodeIds.includes(b.toNodeId)).map((b) => b.id);
    const deviceIds = devices
      .filter((d) => branches.some((b) => b.objectId === d.symbolId && nodeIds.includes(b.fromNodeId) && nodeIds.includes(b.toNodeId)))
      .map((d) => d.id);
    const hasSource = devices.some((d) => d.type === 'source' && deviceIds.includes(d.id));
    islands.push({ id: `island:${idx++}`, nodeIds, branchIds, deviceIds, hasSource });
  }

  return islands;
}
