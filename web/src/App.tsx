import 'reactflow/dist/style.css';

import { useCallback, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import type {
  Connection,
  Edge,
  Node,
  OnConnectEnd,
  OnConnectStartParams,
  NodeDragHandler,
} from 'reactflow';

import { computeEnergized } from './core/energize';
import type { MimicEdge, MimicNode, NodeKind, SwitchState } from './core/model';

import { Palette } from './ui/Palette';
import { JunctionNode } from './ui/nodes/JunctionNode';
import { ScadaNode } from './ui/nodes/ScadaNode';

type MimicData = {
  kind: NodeKind;
  state?: SwitchState;
  sourceOn?: boolean;
  label?: string;
};

type EventCategory = 'info' | 'warn' | 'error' | 'debug';
type EventLogItem = {
  ts: number;
  category: EventCategory;
  msg: string;
  tone?: 'normal' | 'success' | 'danger' | 'warning' | 'muted';
};

function nowTs() {
  return Date.now();
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function getMimicData(n: Node): MimicData | null {
  const d = n.data as any;
  const mimic = (d?.mimic ?? d) as MimicData | undefined;
  if (!mimic?.kind) return null;
  return mimic;
}

function flowToMimic(nodes: Node[], edges: Edge[]): { nodes: MimicNode[]; edges: MimicEdge[] } {
  const mimicNodes: MimicNode[] = nodes
    .map((n) => {
      const md = getMimicData(n);
      if (!md) return null;
      return {
        id: n.id,
        kind: md.kind,
        label: md.label ?? (n.data as any)?.label,
        state: md.state,
        sourceOn: md.sourceOn,
      } satisfies MimicNode;
    })
    .filter((x): x is MimicNode => x !== null);

  const mimicEdges: MimicEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    kind: (e.data as any)?.kind,
    busbarId: (e.data as any)?.busbarId,
  }));

  return { nodes: mimicNodes, edges: mimicEdges };
}

/**
 * Through-conduction rules for traversal:
 * - Source conducts if sourceOn
 * - CB/DS conduct only if CLOSED
 * - ES does not conduct through
 * - Junction/load/xfmr pass-through for MVP
 */
function isConducting(kind: NodeKind, state?: SwitchState, sourceOn?: boolean): boolean {
  if (kind === 'source') return sourceOn === true;
  if (kind === 'cb' || kind === 'ds') return state === 'closed';
  if (kind === 'es') return false;
  return true;
}

/**
 * Visual grounding propagation to satisfy your requirement:
 * - If any ES is CLOSED, the connected section should show grounded to all extremities.
 * - If a DS/CB is OPEN, grounding shows up to that device (boundary) but does not pass through.
 * - Open ES stubs should still show grounded (as part of “extremities”), but ES itself is not a through-path.
 */
function computeGroundedVisual(nodes: MimicNode[], edges: MimicEdge[]) {
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

  // Seeds: CLOSED earth switches only
  const queue: string[] = nodes.filter((n) => n.kind === 'es' && n.state === 'closed').map((n) => n.id);

  while (queue.length) {
    const id = queue.shift()!;
    if (groundedNodeIds.has(id)) continue;

    const node = nodeById.get(id);
    if (!node) continue;
    if (node.kind === 'source') continue;

    groundedNodeIds.add(id);

    for (const { other, edgeId } of adj.get(id) ?? []) {
      const otherNode = nodeById.get(other);
      if (!otherNode) continue;

      // Always mark the edge grounded if one side is grounded (visual extremities)
      groundedEdgeIds.add(edgeId);

      // Never propagate into sources
      if (otherNode.kind === 'source') continue;

      // If neighbor is ES (open or closed), mark it grounded visually but do not traverse through it
      if (otherNode.kind === 'es') {
        groundedNodeIds.add(otherNode.id);
        continue;
      }

      // If neighbor is DS/CB and OPEN, mark the device node grounded but do not traverse further
      if ((otherNode.kind === 'ds' || otherNode.kind === 'cb') && otherNode.state !== 'closed') {
        groundedNodeIds.add(otherNode.id);
        continue;
      }

      // Otherwise traverse if it is pass-through / conducting
      if (isConducting(otherNode.kind, otherNode.state, otherNode.sourceOn)) {
        queue.push(other);
      }
    }
  }

  return { groundedNodeIds, groundedEdgeIds };
}

/**
 * Busbar edge factory:
 * - Thick step edge (right angles)
 * - Stores kind='busbar' and stable busbarId
 * - Preserves sourceHandle/targetHandle
 */
function makeBusbarEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
  busbarId?: string,
): Edge {
  const bbid = busbarId ?? `bb-${crypto.randomUUID().slice(0, 6)}`;
  return {
    id: `${bbid}-${crypto.randomUUID().slice(0, 4)}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'step',
    style: { strokeWidth: 6, stroke: '#777' },
    data: { kind: 'busbar', busbarId: bbid },
  };
}

function makeNode(kind: NodeKind, id: string, x: number, y: number, state?: SwitchState, sourceOn?: boolean): Node {
  const mimic: MimicData = { kind, state, sourceOn, label: id };
  return {
    id,
    type: kind === 'junction' ? 'junction' : 'scada',
    position: { x, y },
    data: { label: id, mimic },
    draggable: kind !== 'junction',
  };
}

// ---- Initial test topology you requested ----
const initialNodes: Node[] = [
  makeNode('source', 'SRC', 80, 140, undefined, true),

  makeNode('junction', 'J1', 260, 140),
  makeNode('es', 'ES1', 260, 280, 'open'),

  makeNode('ds', 'DS1', 420, 140, 'closed'),
  makeNode('cb', 'CB1', 580, 140, 'closed'),
  makeNode('ds', 'DS2', 740, 140, 'closed'),

  makeNode('junction', 'J2', 900, 140),
  makeNode('es', 'ES2', 900, 280, 'open'),

  makeNode('load', 'LOAD', 1080, 140),
];

const initialEdges: Edge[] = [
  makeBusbarEdge('SRC', 'J1', 'R', 'L'),
  makeBusbarEdge('J1', 'DS1', 'R', 'L'),
  makeBusbarEdge('DS1', 'CB1', 'R', 'L'),
  makeBusbarEdge('CB1', 'DS2', 'R', 'L'),
  makeBusbarEdge('DS2', 'J2', 'R', 'L'),
  makeBusbarEdge('J2', 'LOAD', 'R', 'L'),

  makeBusbarEdge('J1', 'ES1', 'B', 'T'),
  makeBusbarEdge('J2', 'ES2', 'B', 'T'),
];

function GridIcon({ enabled }: { enabled: boolean }) {
  const fill = enabled ? 'currentColor' : 'none';
  const stroke = 'currentColor';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2" y="2" width="4" height="4" fill={fill} stroke={stroke} />
      <rect x="7" y="2" width="4" height="4" fill={fill} stroke={stroke} />
      <rect x="12" y="2" width="4" height="4" fill={fill} stroke={stroke} />
      <rect x="2" y="7" width="4" height="4" fill={fill} stroke={stroke} />
      <rect x="7" y="7" width="4" height="4" fill={fill} stroke={stroke} />
      <rect x="12" y="7" width="4" height="4" fill={fill} stroke={stroke} />
      <rect x="2" y="12" width="4" height="4" fill={fill} stroke={stroke} />
      <rect x="7" y="12" width="4" height="4" fill={fill} stroke={stroke} />
      <rect x="12" y="12" width="4" height="4" fill={fill} stroke={stroke} />
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 1a5 5 0 0 0-5 5v4H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 9V6a3 3 0 1 1 6 0v4H9Z"
      />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17 8V6a5 5 0 0 0-10 0h2a3 3 0 1 1 6 0v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11a3 3 0 0 0 3-3v-9a2 2 0 0 0-2-2h-1Z"
      />
    </svg>
  );
}

function AppInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const { screenToFlowPosition, getNode } = useReactFlow();

  // Memoize nodeTypes to fix memoize warning
  const nodeTypes = useMemo(() => ({ junction: JunctionNode, scada: ScadaNode }), []);

  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapGrid = useMemo<[number, number]>(() => [20, 20], []);

  // Lock button restored: disables editing actions
  const [locked, setLocked] = useState(false);

  const [events, setEvents] = useState<EventLogItem[]>([]);
  const [filters, setFilters] = useState<Record<EventCategory, boolean>>({
    info: true,
    warn: true,
    error: true,
    debug: false,
  });

  const appendEvent = useCallback((category: EventCategory, msg: string, tone: EventLogItem['tone'] = 'normal') => {
    setEvents((ev) => [{ ts: nowTs(), category, msg, tone }, ...ev].slice(0, 500));
  }, []);

  // Track whether a node drag occurred; prevents operations on click after drag
  const [nodeDragInProgress, setNodeDragInProgress] = useState(false);

  const onNodeDragStart: NodeDragHandler = useCallback(() => setNodeDragInProgress(true), []);
  const onNodeDragStop: NodeDragHandler = useCallback(() => {
    // delay reset to avoid click firing immediately after drag end
    window.setTimeout(() => setNodeDragInProgress(false), 0);
  }, []);

  // Phase 3 tee state
  const connectWasValidRef = useRef(false);
  const connectFromNodeIdRef = useRef<string | null>(null);

  // ---- Computations ----
  const { nodes: mimicNodes, edges: mimicEdges } = useMemo(() => flowToMimic(nodes, edges), [nodes, edges]);
  const energized = useMemo(() => computeEnergized(mimicNodes, mimicEdges), [mimicNodes, mimicEdges]);
  const grounded = useMemo(() => computeGroundedVisual(mimicNodes, mimicEdges), [mimicNodes, mimicEdges]);

  const styledEdges = useMemo(() => {
    return edges.map((e) => {
      const isEnergized = energized.energizedEdgeIds.has(e.id);
      const isGrounded = grounded.groundedEdgeIds.has(e.id);
      const conflict = isEnergized && isGrounded;

      const base: Edge = { ...e, type: 'step', style: { strokeWidth: 6 } };

      if (conflict) return { ...base, style: { ...base.style, stroke: '#c00000', strokeDasharray: '10 6' } };
      if (isGrounded) return { ...base, style: { ...base.style, stroke: '#b36b00', strokeDasharray: '10 6' } };
      if (isEnergized) return { ...base, style: { ...base.style, stroke: '#00a3a3' } };
      return { ...base, style: { ...base.style, stroke: '#777' } };
    });
  }, [edges, energized.energizedEdgeIds, grounded.groundedEdgeIds]);

  // ---- isValidConnection defined and in-scope ----
  const isValidConnection = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return false;

      const targetNode = nodes.find((n) => n.id === c.target);
      if (!targetNode) return false;

      const targetKind = getMimicData(targetNode)?.kind;

      // ES: only one connection total
      if (targetKind === 'es') {
        const already = edges.some((e) => e.source === c.target || e.target === c.target);
        if (already) return false;
      }

      // Axis locking: if node already has L/R connected, only allow L/R etc.
      const used = new Set<string>();
      for (const e of edges) {
        if (e.source === c.target && e.sourceHandle) used.add(e.sourceHandle);
        if (e.target === c.target && e.targetHandle) used.add(e.targetHandle);
      }
      const hasH = used.has('L') || used.has('R');
      const hasV = used.has('T') || used.has('B');

      if (hasH) return c.targetHandle === 'L' || c.targetHandle === 'R';
      if (hasV) return c.targetHandle === 'T' || c.targetHandle === 'B';

      return true;
    },
    [nodes, edges],
  );

  // ---- Palette drag-drop onto canvas (fix blocked cursor) ----
  const onDragOver = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (evt: React.DragEvent) => {
      evt.preventDefault();
      const kind = evt.dataTransfer.getData('application/mimic-node-kind') as NodeKind;
      if (!kind) return;

      const pos = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;

      setNodes((ns) =>
        ns.concat(makeNode(kind, id, pos.x, pos.y, kind === 'cb' || kind === 'ds' || kind === 'es' ? 'open' : undefined)),
      );
      appendEvent('debug', `DROP ${kind.toUpperCase()} ${id}`, 'muted');
    },
    [appendEvent, screenToFlowPosition],
  );

  // ---- Tee insertion helpers (Phase 3) ----
  function snapPoint(p: { x: number; y: number }) {
    return {
      x: Math.round(p.x / snapGrid[0]) * snapGrid[0],
      y: Math.round(p.y / snapGrid[1]) * snapGrid[1],
    };
  }

  function edgePolyline(e: Edge): Array<{ x: number; y: number }> | null {
    const s = getNode(e.source);
    const t = getNode(e.target);
    if (!s || !t) return null;

    const p1 = { x: s.position.x, y: s.position.y };
    const p3 = { x: t.position.x, y: t.position.y };
    const mx = (p1.x + p3.x) / 2;
    const p2 = { x: mx, y: p1.y };
    const p4 = { x: mx, y: p3.y };
    return [p1, p2, p4, p3];
  }

  function closestPointOnSegment(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const x = a.x + t * abx;
    const y = a.y + t * aby;
    const dx = p.x - x;
    const dy = p.y - y;
    return { x, y, dist2: dx * dx + dy * dy };
  }

  function findNearestBusbar(p: { x: number; y: number }) {
    let best: { edge: Edge; point: { x: number; y: number }; dist2: number } | null = null;

    for (const e of edges) {
      if ((e.data as any)?.kind !== 'busbar') continue;
      const poly = edgePolyline(e);
      if (!poly) continue;

      for (let i = 0; i < poly.length - 1; i++) {
        const cp = closestPointOnSegment(poly[i], poly[i + 1], p);
        if (!best || cp.dist2 < best.dist2) best = { edge: e, point: { x: cp.x, y: cp.y }, dist2: cp.dist2 };
      }
    }

    const threshold = 35;
    if (best && best.dist2 <= threshold * threshold) return best;
    return null;
  }

  function insertTeeAndConnect(fromNodeId: string, dropFlow: { x: number; y: number }) {
    const hit = findNearestBusbar(dropFlow);
    if (!hit) {
      appendEvent('debug', `TEE: no busbar near drop point`, 'muted');
      return;
    }

    const { edge, point } = hit;
    const bbid = (edge.data as any)?.busbarId as string | undefined;
    if (!bbid) {
      appendEvent('debug', `TEE: busbar missing busbarId`, 'muted');
      return;
    }

    const jPos = snapPoint(point);
    const jId = `J-${bbid}-${crypto.randomUUID().slice(0, 4)}`;

    setNodes((ns) => ns.concat(makeNode('junction', jId, jPos.x, jPos.y)));

    setEdges((eds) => {
      const remaining = eds.filter((e) => e.id !== edge.id);

      const segA = makeBusbarEdge(edge.source, jId, edge.sourceHandle ?? undefined, 'L', bbid);
      const segB = makeBusbarEdge(jId, edge.target, 'R', edge.targetHandle ?? undefined, bbid);

      const branch = makeBusbarEdge(fromNodeId, jId, 'R', 'L');

      appendEvent('debug', `TEE OK: split ${edge.id} -> ${segA.id}+${segB.id}, branch ${branch.id}`, 'muted');
      return remaining.concat(segA, segB, branch);
    });
  }

  // ---- Connections ----
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      if (locked) return;

      connectWasValidRef.current = true;

      setEdges((eds) => {
        const exists = eds.find(
          (e) =>
            e.source === c.source &&
            e.target === c.target &&
            (e.sourceHandle ?? null) === (c.sourceHandle ?? null) &&
            (e.targetHandle ?? null) === (c.targetHandle ?? null),
        );

        if (exists) {
          const bbid = (exists.data as any)?.busbarId as string | undefined;
          if ((exists.data as any)?.kind === 'busbar' && bbid) {
            appendEvent('debug', `BUSBAR DELETE ${bbid} (toggle)`, 'muted');
            return eds.filter((x) => (x.data as any)?.busbarId !== bbid);
          }
          appendEvent('debug', `EDGE DELETE ${exists.id} (toggle)`, 'muted');
          return eds.filter((x) => x.id !== exists.id);
        }

        const newEdge = makeBusbarEdge(c.source!, c.target!, c.sourceHandle ?? undefined, c.targetHandle ?? undefined);
        appendEvent('debug', `BUSBAR ADD ${newEdge.id} ${c.source}(${c.sourceHandle}) -> ${c.target}(${c.targetHandle})`, 'muted');
        return addEdge(newEdge, eds);
      });
    },
    [appendEvent, locked],
  );

  const onConnectStart = useCallback(
    (_evt: unknown, params: OnConnectStartParams) => {
      if (locked) return;
      connectWasValidRef.current = false;
      connectFromNodeIdRef.current = params.nodeId ?? null;
    },
    [locked],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (evt) => {
      if (locked) return;

      const fromNodeId = connectFromNodeIdRef.current;
      connectFromNodeIdRef.current = null;

      if (!fromNodeId) return;

      if (connectWasValidRef.current) {
        connectWasValidRef.current = false;
        return;
      }

      if (!('clientX' in evt)) return;
      const dropFlow = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      insertTeeAndConnect(fromNodeId, dropFlow);
    },
    [locked, screenToFlowPosition],
  );

  const onEdgeDoubleClick = useCallback(
    (_evt: unknown, edge: Edge) => {
      if (locked) return;
      if ((edge.data as any)?.kind !== 'busbar') return;
      const bbid = (edge.data as any)?.busbarId as string | undefined;
      if (!bbid) return;
      appendEvent('debug', `BUSBAR DELETE ${bbid} (double click)`, 'muted');
      setEdges((eds) => eds.filter((e) => (e.data as any)?.busbarId !== bbid));
    },
    [appendEvent, locked],
  );

  // ---- Switching command simulation ----
  const pendingRef = useRef<Map<string, any>>(new Map());

  const setNodeSwitchState = useCallback((nodeId: string, to: SwitchState) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const md = getMimicData(n);
        if (!md) return n;
        return { ...n, data: { ...(n.data as any), mimic: { ...md, state: to } } };
      }),
    );
  }, []);

  const scheduleSwitchCommand = useCallback(
    (nodeId: string, kind: NodeKind, to: SwitchState) => {
      if (pendingRef.current.has(nodeId)) {
        appendEvent('warn', `CMD REJECTED ${kind.toUpperCase()} ${nodeId} (already in progress)`, 'warning');
        return;
      }

      let completionMs: number;
      let timeoutMs: number;

      if (kind === 'cb') {
        completionMs = Math.round(randomBetween(60, 120));
        timeoutMs = 500;
      } else if (kind === 'ds' || kind === 'es') {
        completionMs = Math.round(randomBetween(2000, 3000));
        timeoutMs = 6000;
      } else {
        completionMs = 1000;
        timeoutMs = 4000;
      }

      const cmdId = `cmd-${crypto.randomUUID().slice(0, 8)}`;
      appendEvent('info', `CMD ${kind.toUpperCase()} ${nodeId} ${to.toUpperCase()}`);

      const failProb = kind === 'cb' ? 0.01 : 0.03;
      const willFail = Math.random() < failProb;

      const completeTimer = window.setTimeout(() => {
        const pending = pendingRef.current.get(nodeId);
        if (!pending || pending.cmdId !== cmdId) return;

        window.clearTimeout(pending.timeoutTimer);
        pendingRef.current.delete(nodeId);

        if (willFail) {
          appendEvent('error', `RPT ${kind.toUpperCase()} ${nodeId} FAILED (${to.toUpperCase()})`, 'danger');
          return;
        }

        setNodeSwitchState(nodeId, to);
        appendEvent('info', `RPT ${kind.toUpperCase()} ${nodeId} ${to.toUpperCase()}`, 'success');
      }, completionMs);

      const timeoutTimer = window.setTimeout(() => {
        const pending = pendingRef.current.get(nodeId);
        if (!pending || pending.cmdId !== cmdId) return;

        window.clearTimeout(pending.completeTimer);
        pendingRef.current.delete(nodeId);

        appendEvent('error', `TIMEOUT ${kind.toUpperCase()} ${nodeId} (${to.toUpperCase()}) after ${timeoutMs} ms`, 'danger');
      }, timeoutMs);

      pendingRef.current.set(nodeId, { cmdId, nodeId, kind, to, completeTimer, timeoutTimer });
    },
    [appendEvent, setNodeSwitchState],
  );

  // Operate on click (node body) unless a drag just happened
  const onNodeClick = useCallback(
    (_evt: unknown, node: Node) => {
      if (nodeDragInProgress) return;

      const md = getMimicData(node);
      if (!md) return;
      if (md.kind === 'junction') return;

      if (md.kind === 'cb' || md.kind === 'ds' || md.kind === 'es') {
        const current = md.state ?? 'open';
        const to: SwitchState = current === 'closed' ? 'open' : 'closed';
        scheduleSwitchCommand(node.id, md.kind, to);
        return;
      }

      if (md.kind === 'source') {
        const next = !(md.sourceOn ?? false);
        setNodes((ns) =>
          ns.map((n) => {
            if (n.id !== node.id) return n;
            const cur = getMimicData(n);
            if (!cur) return n;
            return { ...n, data: { ...(n.data as any), mimic: { ...cur, sourceOn: next } } };
          }),
        );
        appendEvent('info', `SOURCE ${node.id} -> ${next ? 'ON' : 'OFF'}`);
      }
    },
    [appendEvent, nodeDragInProgress, scheduleSwitchCommand, setNodes],
  );

  // Palette click-to-add at centre
  const addAtCenter = useCallback(
    (kind: NodeKind) => {
      const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;
      setNodes((ns) => ns.concat(makeNode(kind, id, 160, 60, kind === 'cb' || kind === 'ds' || kind === 'es' ? 'open' : undefined)));
      appendEvent('debug', `CREATE ${kind.toUpperCase()} ${id}`, 'muted');
    },
    [appendEvent],
  );

  // Switchgear list in SCADA panel
  const switchgear = useMemo(() => {
    const byKind: Record<'es' | 'ds' | 'cb', Array<{ id: string; state: SwitchState; label: string }>> = {
      es: [],
      ds: [],
      cb: [],
    };

    for (const n of nodes) {
      const md = getMimicData(n);
      if (!md) continue;
      if (md.kind !== 'es' && md.kind !== 'ds' && md.kind !== 'cb') continue;

      byKind[md.kind].push({
        id: n.id,
        state: md.state ?? 'open',
        label: (n.data as any)?.label ?? n.id,
      });
    }

    (Object.keys(byKind) as Array<'es' | 'ds' | 'cb'>).forEach((k) => byKind[k].sort((a, b) => a.label.localeCompare(b.label)));
    return byKind;
  }, [nodes]);

  const issueSwitchCommand = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      const md = getMimicData(n);
      if (!md) return;
      const current = md.state ?? 'open';
      const to: SwitchState = current === 'closed' ? 'open' : 'closed';
      scheduleSwitchCommand(id, md.kind, to);
    },
    [nodes, scheduleSwitchCommand],
  );

  const filteredEvents = useMemo(() => events.filter((e) => filters[e.category]), [events, filters]);
  const toggleFilter = useCallback((cat: EventCategory) => setFilters((f) => ({ ...f, [cat]: !f[cat] })), []);

  const eventRowStyle = (e: EventLogItem): React.CSSProperties => {
    if (e.tone === 'success') return { background: '#ecfff1', borderColor: '#bfe8c9' };
    if (e.tone === 'danger') return { background: '#fff0f0', borderColor: '#f0b6b6' };
    if (e.tone === 'warning') return { background: '#fff7e6', borderColor: '#f2d39b' };
    if (e.tone === 'muted') return { background: '#f6f7f9', borderColor: '#e5e7eb' };
    return { background: '#ffffff', borderColor: '#eee' };
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex' }}>
      <div style={{ flex: 2, position: 'relative' }}>
        <div style={{ width: '100%', height: '100%' }} onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            nodeTypes={nodeTypes}
            isValidConnection={isValidConnection}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onNodeClick={onNodeClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            fitView
            snapToGrid={snapEnabled}
            snapGrid={snapGrid}
            deleteKeyCode={['Backspace', 'Delete']}
            panOnDrag={[1, 2]}
            // Lock disables editing actions
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            edgesUpdatable={!locked}
            elementsSelectable
          >
            <Background variant="lines" gap={24} />
            <MiniMap />

            <Controls position="bottom-left" showZoom showFitView showInteractive={false}>
              <ControlButton onClick={() => setSnapEnabled((v) => !v)} title={`Snap: ${snapEnabled ? 'ON' : 'OFF'}`}>
                <GridIcon enabled={snapEnabled} />
              </ControlButton>
              <ControlButton onClick={() => setLocked((v) => !v)} title={locked ? 'Unlock editing' : 'Lock editing'}>
                <LockIcon locked={locked} />
              </ControlButton>
            </Controls>
          </ReactFlow>
        </div>

        <Palette onAddAtCenter={addAtCenter} />
      </div>

      <div style={{ flex: 1, borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, padding: 12, overflow: 'auto', color: '#111' }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>SCADA – Control & Measurement</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14 }}>
            <div>
              <div style={{ color: '#666' }}>Snap</div>
              <div style={{ color: '#111' }}>{snapEnabled ? 'ON' : 'OFF'}</div>
            </div>
            <div>
              <div style={{ color: '#666' }}>Lock</div>
              <div style={{ color: '#111' }}>{locked ? 'LOCKED' : 'UNLOCKED'}</div>
            </div>
            <div>
              <div style={{ color: '#666' }}>Energized edges</div>
              <div style={{ color: '#111' }}>{energized.energizedEdgeIds.size}</div>
            </div>
            <div>
              <div style={{ color: '#666' }}>Grounded edges</div>
              <div style={{ color: '#111' }}>{grounded.groundedEdgeIds.size}</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Switchgear</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {(['es', 'ds', 'cb'] as const).map((k) => (
                <div key={k}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{k.toUpperCase()}</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {switchgear[k].length === 0 ? (
                      <div style={{ color: '#666', fontSize: 12 }}>None</div>
                    ) : (
                      switchgear[k].map((sw) => {
                        const isClosed = sw.state === 'closed';
                        return (
                          <button
                            key={sw.id}
                            onClick={() => issueSwitchCommand(sw.id)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 10px',
                              borderRadius: 6,
                              border: '1px solid #ddd',
                              background: isClosed ? '#fff0f0' : '#ecfff1',
                              color: isClosed ? '#b00000' : '#2e7d32',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            {sw.label}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}

              <div>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Future</div>
                <div style={{ color: '#666', fontSize: 12 }}>Space reserved for alarms / groups.</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, borderTop: '1px solid #ddd', padding: 12, overflow: 'auto', color: '#111' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontWeight: 800 }}>Event Log</div>
            <div style={{ color: '#666', fontSize: 12 }}>{filteredEvents.length} shown</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10, marginBottom: 10, flexWrap: 'wrap', color: '#111' }}>
            {(['info', 'warn', 'error', 'debug'] as EventCategory[]).map((cat) => (
              <label key={cat} style={{ userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#111' }}>
                <input type="checkbox" checked={filters[cat]} onChange={() => toggleFilter(cat)} />
                {cat.toUpperCase()}
              </label>
            ))}
          </div>

          {filteredEvents.length === 0 ? (
            <div style={{ color: '#666' }}>No events.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {filteredEvents.map((e, idx) => (
                <div
                  key={`${e.ts}-${idx}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr',
                    gap: 10,
                    padding: '8px 10px',
                    border: '1px solid',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#111',
                    ...eventRowStyle(e),
                  }}
                >
                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace', color: '#111' }}>
                    {formatTime(e.ts)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#111' }}>
                    <div style={{ color: '#111' }}>{e.msg}</div>
                    <div style={{ color: '#666', minWidth: 70, textAlign: 'right' }}>{e.category.toUpperCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}
