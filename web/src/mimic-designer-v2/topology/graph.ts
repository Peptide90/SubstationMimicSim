import type { DrawingDocument, Phase } from '../drawing/model';
import { buildConnectivityPrimitives, extractTerminals, pointKey } from './connectivity';
import type { ElectricalBranch, ElectricalDevice, ElectricalIsland, ElectricalNode, TopologyGraph } from './types';

export function buildGraph(doc: DrawingDocument): TopologyGraph {
  const terminals = extractTerminals(doc);
  const primitives = withPathTeePrimitives(doc, buildConnectivityPrimitives(doc));
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

  const connectPolyline = (id: string, vertices: { id: string; position: { x: number; y: number } }[], phases: Phase[], kind: ElectricalBranch['kind']) => {
    for (let i = 1; i < vertices.length; i += 1) {
      const a = nodeByRef.get(vertices[i - 1].id);
      const b = nodeByRef.get(vertices[i].id);
      if (!a || !b || a === b) continue;
      branches.push({ id: `branch:${id}:${i}`, fromNodeId: a, toNodeId: b, kind, objectId: id, phases });
    }
  };

  doc.objects.conductors.forEach((c) => connectPolyline(c.id, orderedPathPoints(c.id, c.connectionPoints, primitives), c.phaseApplicability, 'conductor'));
  doc.objects.busbars.forEach((b) => connectPolyline(b.id, orderedPathPoints(b.id, b.connectionPoints, primitives), b.phaseApplicability, 'busbar'));

  const devices: ElectricalDevice[] = doc.objects.symbols.map((s) => ({
    id: `dev:${s.id}`,
    symbolId: s.id,
    type: s.type,
    terminalIds: terminals.filter((t) => t.parentObjectId === s.id).map((t) => t.id),
    phases: s.phaseApplicability,
    energisation: 'unknown'
  }));

  devices.forEach((d) => {
    const deviceTerminals = d.terminalIds
      .map((terminalId) => terminals.find((terminal) => terminal.id === terminalId))
      .filter(Boolean) as typeof terminals;
    const pairs = deviceTerminalPairs(d.type, deviceTerminals);
    pairs.forEach(([from, to]) => {
      const fromNodeId = nodeByRef.get(from.id);
      const toNodeId = nodeByRef.get(to.id);
      if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return;
      const phases = intersectPhases(from.allowedPhases, to.allowedPhases);
      phases.forEach((phase) => {
        branches.push({
          id: `device:${d.id}:${from.name}:${to.name}:${phase}`,
          fromNodeId,
          toNodeId,
          kind: 'device-internal',
          objectId: d.symbolId,
          fromTerminalId: from.id,
          toTerminalId: to.id,
          phase,
          phases: [phase],
          normallyOpen: d.type === 'circuit-breaker' || d.type === 'disconnector' || d.type === 'earth-switch'
        });
      });
    });
  });

  const islands = deriveIslands(nodes, branches, devices);
  return { nodes, branches, devices, terminals, islands, warnings: [] };
}

type Primitive = ReturnType<typeof buildConnectivityPrimitives>[number];
type PathPoint = { id: string; position: { x: number; y: number } };

function withPathTeePrimitives(doc: DrawingDocument, primitives: Primitive[]): Primitive[] {
  const result = [...primitives];
  const candidates = primitives.filter((primitive) => primitive.source === 'terminal' || primitive.source === 'conductor-point' || primitive.source === 'busbar-point');
  const addVirtualPoints = (pathId: string, vertices: PathPoint[], phases: Phase[], source: Primitive['source']) => {
    candidates.forEach((candidate) => {
      if (candidate.refId === pathId) return;
      if (vertices.some((vertex) => samePoint(vertex.position, candidate.position))) return;
      if (!pointOnPolyline(candidate.position, vertices.map((vertex) => vertex.position))) return;
      result.push({
        id: `${pathId}:tee:${pointKey(candidate.position)}`,
        position: candidate.position,
        phases,
        source,
        refId: pathId
      });
    });
  };

  doc.objects.conductors.forEach((conductor) => addVirtualPoints(conductor.id, conductor.connectionPoints, conductor.phaseApplicability, 'conductor-point'));
  doc.objects.busbars.forEach((busbar) => addVirtualPoints(busbar.id, busbar.connectionPoints, busbar.phaseApplicability, 'busbar-point'));
  return result;
}

function orderedPathPoints(pathId: string, connectionPoints: PathPoint[], primitives: Primitive[]): PathPoint[] {
  const extras = primitives
    .filter((primitive) => primitive.refId === pathId && primitive.id.includes(':tee:'))
    .map((primitive) => ({ id: primitive.id, position: primitive.position }));
  const all = [...connectionPoints, ...extras];
  const ordered: PathPoint[] = [];
  for (let i = 1; i < connectionPoints.length; i += 1) {
    const a = connectionPoints[i - 1].position;
    const b = connectionPoints[i].position;
    const segmentPoints = all
      .filter((point) => samePoint(point.position, a) || samePoint(point.position, b) || pointOnSegment(point.position, a, b))
      .sort((left, right) => distanceAlongSegment(left.position, a, b) - distanceAlongSegment(right.position, a, b));
    segmentPoints.forEach((point) => {
      if (!ordered.some((existing) => existing.id === point.id)) ordered.push(point);
    });
  }
  return ordered.length ? ordered : connectionPoints;
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return pointKey(a) === pointKey(b);
}

function pointOnPolyline(point: { x: number; y: number }, vertices: Array<{ x: number; y: number }>) {
  return vertices.slice(0, -1).some((vertex, index) => pointOnSegment(point, vertex, vertices[index + 1]));
}

function pointOnSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return Math.abs(cross) < 0.001 && point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

function distanceAlongSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  return (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
}

function intersectPhases(a: Phase[], b: Phase[]): Phase[] {
  return a.filter((phase) => b.includes(phase));
}

function deviceTerminalPairs(type: string, terminals: ReturnType<typeof extractTerminals>): Array<[ReturnType<typeof extractTerminals>[number], ReturnType<typeof extractTerminals>[number]]> {
  if (terminals.length < 2) return [];
  const byName = new Map(terminals.map((terminal) => [terminal.name, terminal]));
  if (type === 'transformer') {
    const hv = byName.get('hv');
    const lv = byName.get('lv');
    const tertiary = byName.get('tertiary');
    return [
      ...(hv && lv ? [[hv, lv] as [typeof hv, typeof lv]] : []),
      ...(hv && tertiary ? [[hv, tertiary] as [typeof hv, typeof tertiary]] : []),
      ...(lv && tertiary ? [[lv, tertiary] as [typeof lv, typeof tertiary]] : [])
    ];
  }
  if (type === 'earth-switch') {
    const line = byName.get('in') ?? terminals[0];
    const earth = byName.get('earth') ?? terminals[1];
    return line && earth ? [[line, earth]] : [];
  }
  const [first, ...rest] = terminals;
  return rest.map((terminal) => [first, terminal]);
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
