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
import type { Connection, Edge, Node, NodeDragHandler } from 'reactflow';

import { computeEnergized } from './core/energize';
import type { MimicEdge, MimicNode, NodeKind, SwitchState } from './core/model';

import { Palette } from './ui/Palette';
import { JunctionNode } from './ui/nodes/JunctionNode';
import { ScadaNode } from './ui/nodes/ScadaNode';

import bp109Schema from './schemas/labeling/ng-bp109.json';

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

type LabelScheme = 'DEFAULT' | 'NG_BP109';
type LabelMode = 'AUTO' | 'FREEFORM';
type BayType = 'AUTO' | 'BUS' | 'LINE' | 'TX';

type VoltageClass = '400' | '275' | '132' | 'LV66' | 'HVDC';
type Prefix = '' | 'X' | 'D';
type CircuitType =
  | 'LINE'
  | 'TX_HV'
  | 'MAIN_BUS_SEC'
  | 'BUS_COUPLER'
  | 'SERIES_REACTOR'
  | 'SHUNT_COMP'
  | 'RES_BUS_SEC'
  | 'SPARE'
  | 'TX_LV'
  | 'GEN';

type PurposeDigit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

type BP109Meta = {
  enabled: boolean;
  voltageClass: VoltageClass;
  prefix?: Prefix;
  circuitType: CircuitType;
  circuitNumber: number;
  purposeDigit: PurposeDigit;
  suffixLetter?: string;
};

type InterlockRule = {
  id: string;
  actionNodeId: string;
  actionTo: SwitchState;
  condNodeId: string;
  condState: SwitchState;
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

function isConducting(kind: NodeKind, state?: SwitchState, sourceOn?: boolean): boolean {
  if (kind === 'source') return sourceOn === true;
  if (kind === 'cb' || kind === 'ds') return state === 'closed';
  if (kind === 'es') return false;
  return true;
}

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

      groundedEdgeIds.add(edgeId);

      if (otherNode.kind === 'source') continue;

      if (otherNode.kind === 'es') {
        groundedNodeIds.add(otherNode.id);
        continue;
      }

      if ((otherNode.kind === 'ds' || otherNode.kind === 'cb') && otherNode.state !== 'closed') {
        groundedNodeIds.add(otherNode.id);
        continue;
      }

      if (isConducting(otherNode.kind, otherNode.state, otherNode.sourceOn)) {
        queue.push(other);
      }
    }
  }

  return { groundedNodeIds, groundedEdgeIds };
}

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
    style: { strokeWidth: 6, stroke: '#64748b' },
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

const TEMPLATE_TEST = {
  name: 'Test: SRC → ES || DS → CB → DS || ES → LOAD',
  description: 'Source through DS/CB chain with parallel earth switches at each end.',
  build: () => {
    const nodes: Node[] = [
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

    const edges: Edge[] = [
      makeBusbarEdge('SRC', 'J1', 'R', 'L'),
      makeBusbarEdge('J1', 'DS1', 'R', 'L'),
      makeBusbarEdge('DS1', 'CB1', 'R', 'L'),
      makeBusbarEdge('CB1', 'DS2', 'R', 'L'),
      makeBusbarEdge('DS2', 'J2', 'R', 'L'),
      makeBusbarEdge('J2', 'LOAD', 'R', 'L'),
      makeBusbarEdge('J1', 'ES1', 'B', 'T'),
      makeBusbarEdge('J2', 'ES2', 'B', 'T'),
    ];

    return { nodes, edges };
  },
};

function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: 'min(1100px, 96vw)',
          maxHeight: '85vh',
          overflow: 'auto',
          background: '#0b1220',
          borderRadius: 10,
          border: '1px solid #1f2937',
          padding: 14,
          color: '#fff',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              border: '1px solid #334155',
              background: '#0f172a',
              padding: '6px 10px',
              borderRadius: 8,
              color: '#fff',
            }}
          >
            Close
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function LockGlyph({ locked }: { locked: boolean }) {
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
  const { screenToFlowPosition } = useReactFlow();

  const initial = useMemo(() => TEMPLATE_TEST.build(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  const nodeTypes = useMemo(() => ({ junction: JunctionNode, scada: ScadaNode }), []);

  const TOOLBAR_H = 52;
  const BUILD_TAG = 'BP109-READY-003';

  // Modals
  const [openInterlocking, setOpenInterlocking] = useState(false);
  const [openLabelling, setOpenLabelling] = useState(false);
  const [openSaveLoad, setOpenSaveLoad] = useState(false);

  // Editing lock (bottom-left)
  const [locked, setLocked] = useState(false);

  // Drag gating for node clicks
  const [nodeDragInProgress, setNodeDragInProgress] = useState(false);
  const onNodeDragStart: NodeDragHandler = useCallback(() => setNodeDragInProgress(true), []);
  const onNodeDragStop: NodeDragHandler = useCallback(() => window.setTimeout(() => setNodeDragInProgress(false), 0), []);

  // Event log
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

  // Labelling
  const [labelScheme, setLabelScheme] = useState<LabelScheme>('DEFAULT');
  const [labelMode, setLabelMode] = useState<LabelMode>('AUTO');
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [bayTypeOverrides, setBayTypeOverrides] = useState<Record<string, BayType>>({});
  const [bp109MetaById, setBp109MetaById] = useState<Record<string, BP109Meta>>({});

  // Save metadata for templates
  const [saveTitle, setSaveTitle] = useState('Untitled Template');
  const [saveDescription, setSaveDescription] = useState('Describe what this template represents.');

  // Interlocks (MVP)
  const [interlocks, setInterlocks] = useState<InterlockRule[]>([]);

  // Palette drag drop
  const onDragOver = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy';
  }, []);

  const ensureBp109Meta = useCallback((nodeId: string, kind: NodeKind) => {
    setBp109MetaById((m) => {
      if (m[nodeId]) return m;
      const meta: BP109Meta = {
        enabled: kind === 'ds' || kind === 'cb' || kind === 'es',
        voltageClass: '400',
        prefix: 'X',
        circuitType: 'LINE',
        circuitNumber: 1,
        purposeDigit: kind === 'es' ? 1 : kind === 'cb' ? 5 : 3,
        suffixLetter: '',
      };
      return { ...m, [nodeId]: meta };
    });
  }, []);

  const onDrop = useCallback(
    (evt: React.DragEvent) => {
      evt.preventDefault();
      const kind = evt.dataTransfer.getData('application/mimic-node-kind') as NodeKind;
      if (!kind) return;

      const pos = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;

      setNodes((ns) => ns.concat(makeNode(kind, id, pos.x, pos.y, kind === 'cb' || kind === 'ds' || kind === 'es' ? 'open' : undefined)));
      ensureBp109Meta(id, kind);
      appendEvent('debug', `DROP ${kind.toUpperCase()} ${id}`, 'muted');
    },
    [appendEvent, ensureBp109Meta, screenToFlowPosition, setNodes]
  );

  const addAtCenter = useCallback(
    (kind: NodeKind) => {
      const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;
      setNodes((ns) => ns.concat(makeNode(kind, id, 260, 160, kind === 'cb' || kind === 'ds' || kind === 'es' ? 'open' : undefined)));
      ensureBp109Meta(id, kind);
      appendEvent('debug', `CREATE ${kind.toUpperCase()} ${id}`, 'muted');
    },
    [appendEvent, ensureBp109Meta, setNodes]
  );

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const isValidConnection = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return false;
      const target = nodeById.get(c.target);
      if (!target) return false;

      const targetKind = getMimicData(target)?.kind;
      if (!targetKind) return false;

      if (targetKind === 'es') {
        const already = edges.some((e) => e.source === c.target || e.target === c.target);
        if (already) return false;
      }

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
    [edges, nodeById]
  );

  // Power visuals
  const { nodes: mimicNodes, edges: mimicEdges } = useMemo(() => flowToMimic(nodes, edges), [nodes, edges]);
  const energized = useMemo(() => computeEnergized(mimicNodes, mimicEdges), [mimicNodes, mimicEdges]);
  const grounded = useMemo(() => computeGroundedVisual(mimicNodes, mimicEdges), [mimicNodes, mimicEdges]);

  const styledEdges = useMemo(() => {
    return edges.map((e) => {
      const isEnergized = energized.energizedEdgeIds.has(e.id);
      const isGrounded = grounded.groundedEdgeIds.has(e.id);
      const conflict = isEnergized && isGrounded;

      const base: Edge = { ...e, type: 'step', style: { strokeWidth: 6 } };

      if (conflict) return { ...base, style: { ...base.style, stroke: '#ff4d4d', strokeDasharray: '10 6' } };
      if (isGrounded) return { ...base, style: { ...base.style, stroke: '#ffb020', strokeDasharray: '10 6' } };
      if (isEnergized) return { ...base, style: { ...base.style, stroke: '#00e5ff' } };
      return { ...base, style: { ...base.style, stroke: '#64748b' } };
    });
  }, [edges, energized.energizedEdgeIds, grounded.groundedEdgeIds]);

  // Interlock enforcement
  const checkInterlock = useCallback(
    (actionNodeId: string, actionTo: SwitchState): string | null => {
      const nodesMap = new Map(nodes.map((n) => [n.id, n]));
      for (const r of interlocks) {
        if (r.actionNodeId !== actionNodeId) continue;
        if (r.actionTo !== actionTo) continue;

        const condNode = nodesMap.get(r.condNodeId);
        const condState = getMimicData(condNode as any)?.state ?? 'open';
        if (condState === r.condState) {
          return `Interlock: Block ${actionNodeId} -> ${actionTo.toUpperCase()} when ${r.condNodeId} is ${r.condState.toUpperCase()}`;
        }
      }
      return null;
    },
    [interlocks, nodes]
  );

  const pendingRef = useRef<Map<string, any>>(new Map());

  const setNodeSwitchState = useCallback(
    (nodeId: string, to: SwitchState) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const md = getMimicData(n);
          if (!md) return n;
          return { ...n, data: { ...(n.data as any), mimic: { ...md, state: to } } };
        })
      );
    },
    [setNodes]
  );

  const scheduleSwitchCommand = useCallback(
    (nodeId: string, kind: NodeKind, to: SwitchState) => {
      const blocked = checkInterlock(nodeId, to);
      if (blocked) {
        appendEvent('warn', blocked, 'warning');
        return;
      }

      if (pendingRef.current.has(nodeId)) {
        appendEvent('warn', `CMD REJECTED ${kind.toUpperCase()} ${nodeId} (already in progress)`, 'warning');
        return;
      }

      let completionMs = 1000;
      let timeoutMs = 4000;

      if (kind === 'cb') {
        completionMs = Math.round(randomBetween(60, 120));
        timeoutMs = 500;
      } else if (kind === 'ds' || kind === 'es') {
        completionMs = Math.round(randomBetween(2000, 3000));
        timeoutMs = 6000;
      }

      const cmdId = `cmd-${crypto.randomUUID().slice(0, 6)}`;
      appendEvent('info', `CMD ${kind.toUpperCase()} ${nodeId} ${to.toUpperCase()}`);

      const willFail = Math.random() < (kind === 'cb' ? 0.01 : 0.03);

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

      pendingRef.current.set(nodeId, { cmdId, completeTimer, timeoutTimer });
    },
    [appendEvent, checkInterlock, setNodeSwitchState]
  );

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
      }
    },
    [nodeDragInProgress, scheduleSwitchCommand]
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      if (locked) return;
      const newEdge = makeBusbarEdge(c.source, c.target, c.sourceHandle ?? undefined, c.targetHandle ?? undefined);
      setEdges((eds) => addEdge(newEdge, eds));
      appendEvent('debug', `BUSBAR ADD ${newEdge.id}`, 'muted');
    },
    [appendEvent, locked, setEdges]
  );

  // Switchgear list for SCADA commands
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
      const node = nodeById.get(id);
      if (!node) return;
      const md = getMimicData(node);
      if (!md) return;
      const current = md.state ?? 'open';
      const to: SwitchState = current === 'closed' ? 'open' : 'closed';
      scheduleSwitchCommand(id, md.kind, to);
    },
    [nodeById, scheduleSwitchCommand]
  );

  // Event log view
  const filteredEvents = useMemo(() => events.filter((e) => filters[e.category]), [events, filters]);
  const toggleFilter = useCallback((cat: EventCategory) => setFilters((f) => ({ ...f, [cat]: !f[cat] })), []);

  // Save/Load
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const serializeProject = useCallback(() => {
    return JSON.stringify(
      {
        schemaVersion: '1.0',
        metadata: { title: saveTitle, description: saveDescription },
        nodes,
        edges,
        labelScheme,
        labelMode,
        labelOverrides,
        bayTypeOverrides,
        bp109MetaById,
        interlocks,
      },
      null,
      2
    );
  }, [bp109MetaById, bayTypeOverrides, edges, interlocks, labelMode, labelOverrides, labelScheme, nodes, saveDescription, saveTitle]);

  const downloadJson = useCallback(() => {
    const json = serializeProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${saveTitle.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40) || 'mimic-template'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    appendEvent('debug', `Saved template JSON`, 'muted');
  }, [appendEvent, saveTitle, serializeProject]);

  const loadFromFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed?.nodes || !parsed?.edges) {
      appendEvent('error', 'Load failed: invalid file format', 'danger');
      return;
    }

    setNodes(parsed.nodes);
    setEdges(parsed.edges);

    if (parsed?.metadata?.title) setSaveTitle(parsed.metadata.title);
    if (parsed?.metadata?.description) setSaveDescription(parsed.metadata.description);

    if (parsed.labelScheme) setLabelScheme(parsed.labelScheme);
    if (parsed.labelMode) setLabelMode(parsed.labelMode);
    if (parsed.labelOverrides) setLabelOverrides(parsed.labelOverrides);
    if (parsed.bayTypeOverrides) setBayTypeOverrides(parsed.bayTypeOverrides);
    if (parsed.bp109MetaById) setBp109MetaById(parsed.bp109MetaById);
    if (parsed.interlocks) setInterlocks(parsed.interlocks);

    appendEvent('debug', `Loaded ${file.name}`, 'muted');
  }, [appendEvent]);

  const templates = useMemo(() => [TEMPLATE_TEST], []);
  const loadTemplate = useCallback((t: typeof TEMPLATE_TEST) => {
    const built = t.build();
    setNodes(built.nodes);
    setEdges(built.edges);
    setSaveTitle(t.name);
    setSaveDescription(t.description);
    appendEvent('debug', `Loaded template: ${t.name}`, 'muted');
    setOpenSaveLoad(false);
  }, [appendEvent]);

  // Labelling: BP109 label compute
  const computeBp109Label = useCallback(
    (nodeId: string): string => {
      const node = nodeById.get(nodeId);
      if (!node) return nodeId;
      const md = getMimicData(node);
      if (!md) return nodeId;

      const meta = bp109MetaById[nodeId];
      if (!meta || !meta.enabled) return (node.data as any)?.label ?? node.id;

      const vc = meta.voltageClass;
      const vcSpec = (bp109Schema as any).voltageClasses?.[vc];
      const prefixDefault: string = vcSpec?.prefix ?? '';
      const prefix: string = (meta.prefix ?? prefixDefault) || '';

      const digitMap = (bp109Schema as any).typeMaps?.digitMap ?? {};
      const letterMap = (bp109Schema as any).typeMaps?.letterMap ?? {};

      const typeDigit = digitMap[meta.circuitType];
      const typeLetter = letterMap[meta.circuitType];

      const cnum = Math.max(0, Math.min(9, Math.floor(meta.circuitNumber)));
      const p = meta.purposeDigit;
      const suffix = (meta.suffixLetter ?? '').trim();

      if (vc === '400' || vc === 'HVDC') return `${prefix}${cnum}${typeDigit}${p}${suffix}`;
      if (vc === '132') return `${cnum}${typeDigit}${p}${suffix}`;
      if (vc === '275') return `${typeLetter}${cnum}${p}${suffix}`;
      return `${cnum}${typeLetter}${p}${suffix}`;
    },
    [bp109MetaById, nodeById]
  );

  const computeAutoLabel = useCallback(
    (nodeId: string): string => {
      const node = nodeById.get(nodeId);
      if (!node) return nodeId;
      const base = (node.data as any)?.label ?? node.id;
      if (labelScheme === 'DEFAULT') return base;
      return computeBp109Label(nodeId);
    },
    [computeBp109Label, labelScheme, nodeById]
  );

  const getDisplayLabel = useCallback(
    (nodeId: string): string => {
      if (labelMode === 'FREEFORM') {
        const o = (labelOverrides[nodeId] ?? '').trim();
        if (o.length > 0) return o;
      }
      return computeAutoLabel(nodeId);
    },
    [computeAutoLabel, labelMode, labelOverrides]
  );

  const applyLabelsToNodes = useCallback(() => {
    setNodes((ns) =>
      ns.map((n) => {
        const md = getMimicData(n);
        if (!md || md.kind === 'junction') return n;
        const label = getDisplayLabel(n.id);
        return { ...n, data: { ...(n.data as any), label } };
      })
    );
  }, [getDisplayLabel, setNodes]);

  useMemo(() => {
    applyLabelsToNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelScheme, labelMode, labelOverrides, bayTypeOverrides, bp109MetaById]);

  // Interlocking modal lists
  const switchgearIds = useMemo(() => {
    return nodes
      .map((n) => ({ id: n.id, md: getMimicData(n) }))
      .filter((x): x is { id: string; md: MimicData } => !!x.md)
      .filter((x) => x.md.kind === 'cb' || x.md.kind === 'ds' || x.md.kind === 'es')
      .map((x) => x.id)
      .sort();
  }, [nodes]);

  const [ilActionNode, setIlActionNode] = useState('DS1');
  const [ilActionTo, setIlActionTo] = useState<SwitchState>('closed');
  const [ilCondNode, setIlCondNode] = useState('ES1');
  const [ilCondState, setIlCondState] = useState<SwitchState>('closed');

  const addInterlockRule = useCallback(() => {
    const id = `il-${crypto.randomUUID().slice(0, 6)}`;
    setInterlocks((r) =>
      r.concat({
        id,
        actionNodeId: ilActionNode,
        actionTo: ilActionTo,
        condNodeId: ilCondNode,
        condState: ilCondState,
      })
    );
    appendEvent('debug', `Added interlock ${id}`, 'muted');
  }, [appendEvent, ilActionNode, ilActionTo, ilCondNode, ilCondState]);

  const removeInterlock = useCallback((id: string) => {
    setInterlocks((r) => r.filter((x) => x.id !== id));
    appendEvent('debug', `Removed interlock ${id}`, 'muted');
  }, [appendEvent]);

  // UI layout: prevent needing to scroll the page
  // SCADA has fixed sections and the event log scrolls internally.
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#060b12' }}>
      {/* Fixed toolbar */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: TOOLBAR_H,
          zIndex: 99999,
          background: '#0b1220',
          borderBottom: '1px solid #1f2937',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          color: '#fff',
        }}
      >
        <div style={{ fontWeight: 900 }}>Substation Mimic</div>
        <div style={{ color: '#94a3b8', fontSize: 12 }}>Build: {BUILD_TAG}</div>

        {/* order: Interlocking, Labelling, Save/Load */}
        <button
          onClick={() => setOpenInterlocking(true)}
          style={{ border: '1px solid #334155', background: '#0f172a', padding: '6px 10px', borderRadius: 8, color: '#fff' }}
        >
          Interlocking
        </button>
        <button
          onClick={() => setOpenLabelling(true)}
          style={{ border: '1px solid #334155', background: '#0f172a', padding: '6px 10px', borderRadius: 8, color: '#fff' }}
        >
          Labelling
        </button>
        <button
          onClick={() => setOpenSaveLoad(true)}
          style={{ border: '1px solid #334155', background: '#0f172a', padding: '6px 10px', borderRadius: 8, color: '#fff' }}
        >
          Save/Load
        </button>
      </div>

      {/* Main split */}
      <div style={{ display: 'flex', height: '100vh', paddingTop: TOOLBAR_H }}>
        {/* Editor */}
        <div style={{ flex: 2, position: 'relative' }}>
          <div style={{ width: '100%', height: '100%' }} onDragOver={onDragOver} onDrop={onDrop}>
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              nodeTypes={nodeTypes}
              isValidConnection={isValidConnection}
              onConnect={onConnect}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
			  onEdgeDoubleClick={onEdgeDoubleClick}
              onNodeClick={onNodeClick}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={onNodeDragStop}
              fitView
              deleteKeyCode={['Backspace', 'Delete']}
              panOnDrag={[1, 2]}
              nodesDraggable={!locked}
              nodesConnectable={!locked}
              edgesUpdatable={!locked}
              elementsSelectable
            >
              <Background variant="lines" gap={24} />
              <MiniMap />

              {/* Lock button only here (bottom-left), not in the toolbar */}
              <Controls showInteractive={false} position="bottom-left">
                <ControlButton onClick={() => setLocked((v) => !v)} title={locked ? 'Unlock editing' : 'Lock editing'}>
                  <span style={{ color: '#111' }}>
                    <LockGlyph locked={locked} />
                  </span>
                </ControlButton>
              </Controls>
            </ReactFlow>

            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000 }}>
              <Palette onAddAtCenter={addAtCenter} />
            </div>
          </div>
        </div>

        {/* SCADA - fits screen, only log scrolls */}
        <div
          style={{
            flex: 1,
            borderLeft: '1px solid #1f2937',
            background: '#0b1220',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {/* Status */}
          <div style={{ padding: 14, borderBottom: '1px solid #1f2937' }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>SCADA</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 14 }}>
              <div>
                <div style={{ color: '#94a3b8' }}>Energized edges</div>
                <div style={{ color: '#fff' }}>{energized.energizedEdgeIds.size}</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8' }}>Grounded edges</div>
                <div style={{ color: '#fff' }}>{grounded.groundedEdgeIds.size}</div>
              </div>
            </div>
          </div>

          {/* Commands */}
          <div style={{ padding: 14, borderBottom: '1px solid #1f2937' }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Commands</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {(['es', 'ds', 'cb'] as const).map((k) => (
                <div key={k}>
                  <div style={{ fontWeight: 900, marginBottom: 6, color: '#fff' }}>{k.toUpperCase()}</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {switchgear[k].length === 0 ? (
                      <div style={{ color: '#94a3b8', fontSize: 12 }}>None</div>
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
                              borderRadius: 8,
                              border: '1px solid #334155',
                              background: isClosed ? '#3f0d0d' : '#0d3f1d',
                              color: '#fff',
                              fontWeight: 900,
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
                <div style={{ fontWeight: 900, marginBottom: 6, color: '#fff' }}>Future</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>Alarms / groups</div>
              </div>
            </div>
          </div>

          {/* Event Log - scrolls */}
          <div style={{ padding: 14, overflow: 'auto', minHeight: 0 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Event Log</div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              {(['info', 'warn', 'error', 'debug'] as EventCategory[]).map((cat) => (
                <label key={cat} style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#fff', fontSize: 13 }}>
                  <input type="checkbox" checked={filters[cat]} onChange={() => toggleFilter(cat)} />
                  {cat.toUpperCase()}
                </label>
              ))}
            </div>

            {filteredEvents.length === 0 ? (
              <div style={{ color: '#94a3b8' }}>No events.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {filteredEvents.map((e, idx) => (
                  <div
                    key={`${e.ts}-${idx}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 1fr',
                      gap: 10,
                      padding: '8px 10px',
                      border: '1px solid #1f2937',
                      borderRadius: 8,
                      fontSize: 13,
                      background: '#0f172a',
                      color: '#fff',
                    }}
                  >
                    <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' }}>
                      {formatTime(e.ts)}
                    </div>
                    <div>{e.msg}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interlocking modal */}
      <Modal title="Interlocking" open={openInterlocking} onClose={() => setOpenInterlocking(false)}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: '#cbd5e1' }}>
            MVP: Block a specific action (OPEN/CLOSE) when another device is OPEN/CLOSED.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr 140px', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Block action on</div>
              <select value={ilActionNode} onChange={(e) => setIlActionNode(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, background: '#0f172a', color: '#fff', border: '1px solid #334155' }}>
                {switchgearIds.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Action</div>
              <select value={ilActionTo} onChange={(e) => setIlActionTo(e.target.value as SwitchState)} style={{ width: '100%', padding: 8, borderRadius: 8, background: '#0f172a', color: '#fff', border: '1px solid #334155' }}>
                <option value="open">OPEN</option>
                <option value="closed">CLOSE</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>When this device is</div>
              <select value={ilCondNode} onChange={(e) => setIlCondNode(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, background: '#0f172a', color: '#fff', border: '1px solid #334155' }}>
                {switchgearIds.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>State</div>
              <select value={ilCondState} onChange={(e) => setIlCondState(e.target.value as SwitchState)} style={{ width: '100%', padding: 8, borderRadius: 8, background: '#0f172a', color: '#fff', border: '1px solid #334155' }}>
                <option value="open">OPEN</option>
                <option value="closed">CLOSED</option>
              </select>
            </div>
          </div>

          <button
            onClick={addInterlockRule}
            style={{ border: '1px solid #334155', background: '#0f172a', padding: '8px 12px', borderRadius: 8, color: '#fff', width: 'fit-content' }}
          >
            Add Interlock
          </button>

          <div style={{ borderTop: '1px solid #1f2937', paddingTop: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Rules</div>
            {interlocks.length === 0 ? (
              <div style={{ color: '#94a3b8' }}>No interlocks yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {interlocks.map((r) => (
                  <div key={r.id} style={{ border: '1px solid #1f2937', background: '#0f172a', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      Block {r.actionNodeId} → {r.actionTo.toUpperCase()} when {r.condNodeId} is {r.condState.toUpperCase()}
                    </div>
                    <button
                      onClick={() => removeInterlock(r.id)}
                      style={{ marginTop: 8, border: '1px solid #334155', background: '#0b1220', padding: '6px 10px', borderRadius: 8, color: '#fff' }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Labelling modal */}
      <Modal title="Labelling" open={openLabelling} onClose={() => setOpenLabelling(false)}>
        <div style={{ color: '#cbd5e1', marginBottom: 10, fontSize: 12 }}>
          FREEFORM overrides always win. BP109 is schema-driven from ng-bp109.json.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Scheme</div>
            <select
              value={labelScheme}
              onChange={(e) => setLabelScheme(e.target.value as LabelScheme)}
              style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
            >
              <option value="DEFAULT">Default</option>
              <option value="NG_BP109">NG BP109</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Mode</div>
            <select
              value={labelMode}
              onChange={(e) => setLabelMode(e.target.value as LabelMode)}
              style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
            >
              <option value="AUTO">Auto</option>
              <option value="FREEFORM">Freeform overrides</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {nodes
            .filter((n) => getMimicData(n)?.kind !== 'junction')
            .map((n) => {
              const md = getMimicData(n)!;
              const display = getDisplayLabel(n.id);

              if (labelScheme === 'NG_BP109' && !bp109MetaById[n.id]) ensureBp109Meta(n.id, md.kind);
              const meta = bp109MetaById[n.id];

              const bayType = bayTypeOverrides[n.id] ?? 'AUTO';

              return (
                <div
                  key={n.id}
                  style={{
                    border: '1px solid #1f2937',
                    borderRadius: 10,
                    padding: 12,
                    background: '#0f172a',
                    display: 'grid',
                    gridTemplateColumns: '90px 140px 160px 1fr',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{md.kind.toUpperCase()}</div>
                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace' }}>{n.id}</div>

                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>BayType</div>
                    <select
                      value={bayType}
                      onChange={(e) => setBayTypeOverrides((m) => ({ ...m, [n.id]: e.target.value as BayType }))}
                      style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: '#fff' }}
                    >
                      <option value="AUTO">AUTO</option>
                      <option value="BUS">BUS</option>
                      <option value="LINE">LINE</option>
                      <option value="TX">TX</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Label</div>
                    {labelMode === 'FREEFORM' ? (
                      <input
                        value={labelOverrides[n.id] ?? ''}
                        placeholder={display}
                        onChange={(e) => setLabelOverrides((m) => ({ ...m, [n.id]: e.target.value }))}
                        style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: '#fff' }}
                      />
                    ) : (
                      <div style={{ padding: 8, borderRadius: 8, border: '1px solid #1f2937', background: '#0b1220', color: '#fff' }}>
                        {display}
                      </div>
                    )}

                    {labelScheme === 'NG_BP109' && meta && (
                      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>Voltage</div>
                          <select
                            value={meta.voltageClass}
                            onChange={(e) =>
                              setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], voltageClass: e.target.value as VoltageClass } }))
                            }
                            style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: '#fff' }}
                          >
                            <option value="400">400</option>
                            <option value="275">275</option>
                            <option value="132">132</option>
                            <option value="LV66">LV66</option>
                            <option value="HVDC">HVDC</option>
                          </select>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>Type</div>
                          <select
                            value={meta.circuitType}
                            onChange={(e) =>
                              setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], circuitType: e.target.value as CircuitType } }))
                            }
                            style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: '#fff' }}
                          >
                            <option value="LINE">LINE</option>
                            <option value="TX_HV">TX_HV</option>
                            <option value="MAIN_BUS_SEC">MAIN_BUS_SEC</option>
                            <option value="BUS_COUPLER">BUS_COUPLER</option>
                            <option value="SERIES_REACTOR">SERIES_REACTOR</option>
                            <option value="SHUNT_COMP">SHUNT_COMP</option>
                            <option value="RES_BUS_SEC">RES_BUS_SEC</option>
                            <option value="SPARE">SPARE</option>
                            <option value="TX_LV">TX_LV</option>
                            <option value="GEN">GEN</option>
                          </select>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>Circuit #</div>
                          <input
                            type="number"
                            min={0}
                            max={9}
                            value={meta.circuitNumber}
                            onChange={(e) =>
                              setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], circuitNumber: Number(e.target.value) } }))
                            }
                            style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: '#fff' }}
                          />
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>Purpose</div>
                          <select
                            value={String(meta.purposeDigit)}
                            onChange={(e) =>
                              setBp109MetaById((m) => ({
                                ...m,
                                [n.id]: { ...m[n.id], purposeDigit: Number(e.target.value) as PurposeDigit },
                              }))
                            }
                            style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: '#fff' }}
                          >
                            {Array.from({ length: 10 }).map((_, i) => (
                              <option key={i} value={String(i)}>{i}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>Suffix</div>
                          <input
                            value={meta.suffixLetter ?? ''}
                            onChange={(e) =>
                              setBp109MetaById((m) => ({ ...m, [n.id]: { ...m[n.id], suffixLetter: e.target.value } }))
                            }
                            style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0b1220', color: '#fff' }}
                            placeholder="A/B…"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </Modal>

      {/* Save/Load modal */}
      <Modal title="Save / Load" open={openSaveLoad} onClose={() => setOpenSaveLoad(false)}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Title (saved into JSON metadata)</div>
              <input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Description (saved into JSON metadata)</div>
              <input
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                style={{ padding: 8, width: '100%', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#fff' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={downloadJson}
              style={{ border: '1px solid #334155', background: '#0f172a', padding: '8px 12px', borderRadius: 8, color: '#fff' }}
            >
              Save (download JSON)
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ border: '1px solid #334155', background: '#0f172a', padding: '8px 12px', borderRadius: 8, color: '#fff' }}
            >
              Load (upload JSON)
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFromFile(f);
                e.currentTarget.value = '';
              }}
            />
          </div>

          <div style={{ borderTop: '1px solid #1f2937', paddingTop: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Templates</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {templates.map((t) => (
                <div key={t.name} style={{ border: '1px solid #1f2937', background: '#0f172a', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 900 }}>{t.name}</div>
                  <div style={{ color: '#cbd5e1', marginTop: 4 }}>{t.description}</div>
                  <button
                    onClick={() => loadTemplate(t)}
                    style={{ marginTop: 10, border: '1px solid #334155', background: '#0b1220', padding: '6px 10px', borderRadius: 8, color: '#fff' }}
                  >
                    Load Template
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* (No lock button in top-right; only bottom-left Controls button) */}
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
