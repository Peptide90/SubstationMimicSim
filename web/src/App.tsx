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
import type { Connection, Edge, Node } from 'reactflow';

import { computeEnergized } from './core/energize';
import type { MimicEdge, MimicNode, NodeKind, Rule, SwitchState } from './core/model';
import { Palette } from './ui/Palette';

type EventCategory = 'info' | 'warn' | 'error' | 'debug';
type EventLogItem = {
  ts: number;
  category: EventCategory;
  msg: string;
  // Optional display hint: used for "command acknowledged/complete" green highlight
  tone?: 'normal' | 'success' | 'danger' | 'warning' | 'muted';
};

type MimicData = {
  kind: NodeKind;
  state?: SwitchState;
  sourceOn?: boolean;
  label?: string;
  tags?: string[];
};

const initialNodes: Node[] = [
  {
    id: 'source-1',
    position: { x: 80, y: 80 },
    data: { label: 'Source', mimic: { kind: 'source', sourceOn: true } satisfies MimicData },
  },
  {
    id: 'bus-1',
    position: { x: 360, y: 80 },
    data: { label: 'Bus', mimic: { kind: 'bus' } satisfies MimicData },
  },
  {
    id: 'ds-1',
    position: { x: 620, y: 80 },
    data: { label: 'DS', mimic: { kind: 'ds', state: 'closed' } satisfies MimicData },
  },
  {
    id: 'load-1',
    position: { x: 860, y: 80 },
    data: { label: 'Load', mimic: { kind: 'load' } satisfies MimicData },
  },
  {
    id: 'es-1',
    position: { x: 360, y: 220 },
    data: { label: 'ES', mimic: { kind: 'es', state: 'open' } satisfies MimicData },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1', source: 'source-1', target: 'bus-1', type: 'step' },
  { id: 'e2', source: 'bus-1', target: 'ds-1', type: 'step' },
  { id: 'e3', source: 'ds-1', target: 'load-1', type: 'step' },
  { id: 'e4', source: 'bus-1', target: 'es-1', type: 'step' },
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
        tags: md.tags,
        state: md.state,
        sourceOn: md.sourceOn,
      } satisfies MimicNode;
    })
    .filter((x): x is MimicNode => x !== null);

  const mimicEdges: MimicEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));

  return { nodes: mimicNodes, edges: mimicEdges };
}

function isConductingForTraversal(kind: NodeKind, state?: SwitchState, sourceOn?: boolean): boolean {
  if (kind === 'source') return sourceOn === true;
  if (kind === 'cb' || kind === 'ds') return state === 'closed';
  if (kind === 'es') return false;
  return true;
}

/**
 * Grounding traversal (MVP):
 * - Any CLOSED earth switch is a grounding point.
 * - Ground spreads through closed CB/DS and pass-through nodes (bus/load/xfmr).
 * - Ground does NOT propagate into Source nodes.
 */
function computeGrounded(nodes: MimicNode[], edges: MimicEdge[]): { groundedNodeIds: Set<string>; groundedEdgeIds: Set<string> } {
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
      if (otherNode.kind === 'source') continue;

      const canTraverse =
        otherNode.kind === 'es'
          ? otherNode.state === 'closed'
          : isConductingForTraversal(otherNode.kind, otherNode.state, otherNode.sourceOn);

      if (canTraverse) {
        groundedEdgeIds.add(edgeId);
        queue.push(other);
      }
    }
  }

  return { groundedNodeIds, groundedEdgeIds };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  // HH:mm:ss.mmm for realism
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ---- Node factory (palette) ----
function makeNode(kind: NodeKind, position: { x: number; y: number }, id: string): Node {
  const base: MimicData = { kind };

  if (kind === 'source') base.sourceOn = true;
  if (kind === 'cb' || kind === 'ds' || kind === 'es') base.state = 'open';

  const label =
    kind === 'source'
      ? 'Source'
      : kind === 'load'
        ? 'Load'
        : kind === 'bus'
          ? 'Bus'
          : kind === 'cb'
            ? 'CB'
            : kind === 'ds'
              ? 'DS'
              : kind === 'es'
                ? 'ES'
                : kind === 'xfmr'
                  ? 'XFMR'
                  : kind;

  return { id, position, data: { label, mimic: base } };
}

type PendingCommand = {
  cmdId: string;
  nodeId: string;
  kind: NodeKind;
  to: SwitchState;
  startedTs: number;
  completeTimer: number;
  timeoutTimer: number;
};

function AppInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [rules] = useState<Rule[]>([]);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const snapGrid = useMemo<[number, number]>(() => [20, 20], []);

  // Event log + filters
  const [events, setEvents] = useState<EventLogItem[]>([]);
  const [filters, setFilters] = useState<Record<EventCategory, boolean>>({
    info: true,
    warn: true,
    error: true,
    debug: false,
  });

  const appendEvent = useCallback((category: EventCategory, msg: string, tone: EventLogItem['tone'] = 'normal') => {
    setEvents((ev) => [{ ts: Date.now(), category, msg, tone }, ...ev].slice(0, 500));
  }, []);

  // Pending command tracking
  const pendingRef = useRef<Map<string, PendingCommand>>(new Map());

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition, getViewport } = useReactFlow();

const onConnect = useCallback(
  (connection: Connection) => {
    if (!connection.source || !connection.target) return;

    setEdges((eds) => {
      const exists = eds.find(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          (e.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
          (e.targetHandle ?? null) === (connection.targetHandle ?? null),
      );

      if (exists) {
        appendEvent('debug', `EDGE DELETE ${exists.id} (toggle)`, 'muted');
        return eds.filter((e) => e.id !== exists.id);
      }

      const newId = `e-${crypto.randomUUID().slice(0, 8)}`;
      appendEvent('debug', `EDGE ADD ${newId} ${connection.source} -> ${connection.target}`, 'muted');

      return addEdge(
        {
          ...connection,
          id: newId,
          type: 'step',
          style: { strokeWidth: 6 },
        },
        eds,
      );
    });
  },
  [appendEvent, setEdges],
);

  const { nodes: mimicNodes, edges: mimicEdges } = useMemo(() => flowToMimic(nodes, edges), [nodes, edges]);
  const energized = useMemo(() => computeEnergized(mimicNodes, mimicEdges), [mimicNodes, mimicEdges]);
  const grounded = useMemo(() => computeGrounded(mimicNodes, mimicEdges), [mimicNodes, mimicEdges]);

  const styledEdges = useMemo(() => {
    return edges.map((e) => {
      const isEnergized = energized.energizedEdgeIds.has(e.id);
      const isGrounded = grounded.groundedEdgeIds.has(e.id);
      const conflict = isEnergized && isGrounded;

      const base: Edge = { ...e, type: 'step', style: { strokeWidth: 6 } };

      // Colours are placeholders; you can brand these later.
      if (conflict) return { ...base, style: { ...base.style, stroke: '#c00000', strokeDasharray: '10 6' } };
      if (isGrounded) return { ...base, style: { ...base.style, stroke: '#b36b00', strokeDasharray: '10 6' } };
      if (isEnergized) return { ...base, style: { ...base.style, stroke: '#00a3a3' } };

      return { ...base, style: { ...base.style, stroke: '#777' } };
    });
  }, [edges, energized.energizedEdgeIds, grounded.groundedEdgeIds]);

  const defaultEdgeOptions = useMemo(
    () => ({ type: 'step' as const, style: { strokeWidth: 6, stroke: '#777' } }),
    [],
  );

  const addAtCenter = useCallback(
    (kind: NodeKind) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const screenX = rect.left + rect.width / 2;
      const screenY = rect.top + rect.height / 2;

      const pos = screenToFlowPosition({ x: screenX, y: screenY });
      const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;

      setNodes((ns) => ns.concat(makeNode(kind, pos, id)));
      appendEvent('debug', `CREATE ${kind.toUpperCase()} ${id}`, 'muted');
    },
    [appendEvent, screenToFlowPosition, setNodes],
  );

  const onDragOver = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (evt: React.DragEvent) => {
      evt.preventDefault();

      const kind = evt.dataTransfer.getData('application/mimic-node-kind') as NodeKind;
      if (!kind) return;

      const pos = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;

      setNodes((ns) => ns.concat(makeNode(kind, pos, id)));
      appendEvent('debug', `DROP ${kind.toUpperCase()} ${id}`, 'muted');
    },
    [appendEvent, screenToFlowPosition, setNodes],
  );

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
      // Prevent double-issuing commands to same device
      if (pendingRef.current.has(nodeId)) {
        appendEvent('warn', `CMD REJECTED ${kind.toUpperCase()} ${nodeId} (already in progress)`, 'warning');
        return;
      }

      // Timing model
      let completionMs: number;
      let timeoutMs: number;

      if (kind === 'cb') {
        completionMs = Math.round(randomBetween(60, 120)); // 60–120 ms
        timeoutMs = 500; // 0.5s timeout for CB
      } else if (kind === 'ds' || kind === 'es') {
        completionMs = Math.round(randomBetween(4500, 6500)); // ~5s with variance
        timeoutMs = 9000; // 9s timeout
      } else {
        // default for other future switchgear
        completionMs = 1000;
        timeoutMs = 4000;
      }

      const cmdId = `cmd-${crypto.randomUUID().slice(0, 8)}`;
      const cmdText = `CMD ${kind.toUpperCase()} ${nodeId} ${to.toUpperCase()}`;

      // Log command issued (neutral)
      appendEvent('info', cmdText, 'normal');

      const startedTs = Date.now();

      // Optional: small failure probability for realism (tweak as desired)
      // DS/ES a little more likely than CB, but keep small.
      const failProb = kind === 'cb' ? 0.01 : 0.03;
      const willFail = Math.random() < failProb;

      const completeTimer = window.setTimeout(() => {
        // If already timed out/cleared, ignore
        const pending = pendingRef.current.get(nodeId);
        if (!pending || pending.cmdId !== cmdId) return;

        // Clear timeout timer
        window.clearTimeout(pending.timeoutTimer);
        pendingRef.current.delete(nodeId);

        if (willFail) {
          appendEvent('error', `RPT ${kind.toUpperCase()} ${nodeId} FAILED (${to.toUpperCase()})`, 'danger');
          return;
        }

        // Apply state change only on completion
        setNodeSwitchState(nodeId, to);

        // Log confirmation (green highlight)
        appendEvent('info', `RPT ${kind.toUpperCase()} ${nodeId} ${to.toUpperCase()}`, 'success');
      }, completionMs);

      const timeoutTimer = window.setTimeout(() => {
        const pending = pendingRef.current.get(nodeId);
        if (!pending || pending.cmdId !== cmdId) return;

        // Clear completion timer
        window.clearTimeout(pending.completeTimer);
        pendingRef.current.delete(nodeId);

        appendEvent(
          'error',
          `TIMEOUT ${kind.toUpperCase()} ${nodeId} (${to.toUpperCase()}) after ${timeoutMs} ms`,
          'danger',
        );
      }, timeoutMs);

      pendingRef.current.set(nodeId, {
        cmdId,
        nodeId,
        kind,
        to,
        startedTs,
        completeTimer,
        timeoutTimer,
      });
    },
    [appendEvent, setNodeSwitchState],
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const md = getMimicData(node);
      if (!md) return;

      // Switchgear: CB/DS/ES via command simulation
      if (md.kind === 'cb' || md.kind === 'ds' || md.kind === 'es') {
        const current = md.state ?? 'open';
        const to: SwitchState = current === 'closed' ? 'open' : 'closed';

        // Interlocks hook point (rules). For now, we only keep rules in place as future expansion.
        // If you want, we can integrate validateAction() here before scheduling.
        // For realism: if energized + trying to close ES, you can reject immediately here later.

        scheduleSwitchCommand(node.id, md.kind, to);
        return;
      }

      // Source toggle: immediate (you can add a similar command model later if you want)
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
        appendEvent('info', `SOURCE ${node.id} -> ${next ? 'ON' : 'OFF'}`, 'normal');
      }
    },
    [appendEvent, scheduleSwitchCommand, setNodes],
  );

  const filteredEvents = useMemo(
    () => events.filter((e) => filters[e.category]),
    [events, filters],
  );

  const toggleFilter = useCallback((cat: EventCategory) => {
    setFilters((f) => ({ ...f, [cat]: !f[cat] }));
  }, []);

  const eventRowStyle = (e: EventLogItem): React.CSSProperties => {
    if (e.tone === 'success') return { background: '#ecfff1', borderColor: '#bfe8c9' };
    if (e.tone === 'danger') return { background: '#fff0f0', borderColor: '#f0b6b6' };
    if (e.tone === 'warning') return { background: '#fff7e6', borderColor: '#f2d39b' };
    if (e.tone === 'muted') return { background: '#f6f7f9', borderColor: '#e5e7eb' };
    return { background: '#ffffff', borderColor: '#eee' };
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex' }}>
      {/* LEFT: editor */}
      <div style={{ flex: 2, position: 'relative' }}>
        <div
          ref={wrapperRef}
          style={{ width: '100%', height: '100%', position: 'relative' }}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            onConnect={onConnect}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            snapToGrid={snapEnabled}
            snapGrid={snapGrid}
            defaultEdgeOptions={defaultEdgeOptions}
			deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background variant="lines" gap={24} />
            <MiniMap />

            <Controls position="bottom-left" showInteractive>
              <ControlButton
                onClick={() => setSnapEnabled((v) => !v)}
                title={`Snap to grid: ${snapEnabled ? 'ON' : 'OFF'}`}
                aria-label="Toggle snap to grid"
              >
                <GridIcon enabled={snapEnabled} />
              </ControlButton>
            </Controls>
          </ReactFlow>

          <Palette onAddAtCenter={addAtCenter} />
        </div>
      </div>

      {/* RIGHT: SCADA panel */}
      <div style={{ flex: 1, borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
        {/* Top: Control & Measurement */}
        <div style={{ flex: 1, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>SCADA – Control & Measurement</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14 }}>
            <div>
              <div style={{ color: '#666' }}>Snap</div>
              <div>{snapEnabled ? 'ON' : 'OFF'}</div>
            </div>
            <div>
              <div style={{ color: '#666' }}>Energized edges</div>
              <div>{energized.energizedEdgeIds.size}</div>
            </div>
            <div>
              <div style={{ color: '#666' }}>Grounded edges</div>
              <div>{grounded.groundedEdgeIds.size}</div>
            </div>
            <div>
              <div style={{ color: '#666' }}>Conflicts</div>
              <div>{[...energized.energizedEdgeIds].filter((id) => grounded.groundedEdgeIds.has(id)).length}</div>
            </div>
          </div>

          <div style={{ marginTop: 12, color: '#666', fontSize: 13 }}>
            Tip: click nodes to issue commands (DS/ES/CB) or toggle Source.
          </div>
        </div>

        {/* Bottom: Event Log */}
        <div style={{ flex: 1, borderTop: '1px solid #ddd', padding: 12, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontWeight: 600 }}>Event Log</div>
            <div style={{ color: '#666', fontSize: 12 }}>{filteredEvents.length} shown</div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginTop: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            {(['info', 'warn', 'error', 'debug'] as EventCategory[]).map((cat) => (
              <label key={cat} style={{ userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={filters[cat]} onChange={() => toggleFilter(cat)} />
                {cat.toUpperCase()}
              </label>
            ))}
          </div>

          {/* Log table */}
          {filteredEvents.length === 0 ? (
            <div style={{ color: '#666' }}>No events (or all filtered out).</div>
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
                    ...eventRowStyle(e),
                  }}
                >
                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', color: '#333' }}>
                    {formatTime(e.ts)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>{e.msg}</div>
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
