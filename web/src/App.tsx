import "reactflow/dist/style.css";

import { useCallback, useMemo, useRef, useState } from "react";
import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, addEdge } from "reactflow";
import type { Connection, Edge, Node, NodeDragHandler } from "reactflow";

import { computeEnergized } from "./core/energize";
import type { NodeKind, SwitchState } from "./core/model";

import { TopToolbar } from "./components/TopToolbar";
import { EditorCanvas } from "./components/EditorCanvas";
import { ScadaPanel } from "./components/ScadaPanel";
import type { EventCategory, EventLogItem } from "./components/EventLog";

import { InterlockingModal } from "./components/modals/InterlockingModal";
import type { InterlockRule } from "./components/modals/InterlockingModal";
import { LabellingModal } from "./components/modals/LabellingModal";
import { SaveLoadModal } from "./components/modals/SaveLoadModal";

import { JunctionNode } from "./ui/nodes/JunctionNode";
import { ScadaNode } from "./ui/nodes/ScadaNode";

import { BusbarModal } from "./components/modals/BusbarModal";

import {
  computeBp109Label,
  defaultBp109Meta,
  schemaDefaultPrefix,
} from "./app/labeling/bp109";

import type {
  BP109Meta,
  LabelMode,
  LabelScheme,
  BayType,
} from "./app/labeling/bp109";


// ---------- minimal helpers (kept in App to avoid more files now) ----------
type MimicData = { kind: NodeKind; state?: SwitchState; sourceOn?: boolean; label?: string };

function getMimicData(n: Node): MimicData | null {
  const d = n.data as any;
  const mimic = (d?.mimic ?? d) as MimicData | undefined;
  if (!mimic?.kind) return null;
  return mimic;
}

function flowToMimicLocal(nodes: Node[], edges: Edge[]) {
  const mimicNodes = nodes
    .map((n) => {
      const md = getMimicData(n);
      if (!md) return null;
      return { id: n.id, kind: md.kind, label: md.label ?? (n.data as any)?.label, state: md.state, sourceOn: md.sourceOn };
    })
    .filter(Boolean) as any[];

  const mimicEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    kind: (e.data as any)?.kind,
    busbarId: (e.data as any)?.busbarId,
  }));

  return { nodes: mimicNodes, edges: mimicEdges };
}

function makeBusbarEdge(source: string, target: string, sourceHandle?: string, targetHandle?: string, busbarId?: string): Edge {
  const bbid = busbarId ?? `bb-${crypto.randomUUID().slice(0, 6)}`;
  return {
    id: `${bbid}-${crypto.randomUUID().slice(0, 4)}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "busbar",
    style: { strokeWidth: 6, stroke: "#64748b" },
    data: { kind: "busbar", busbarId: bbid },
  };
}

function makeNode(
  kind: NodeKind,
  id: string,
  x: number,
  y: number,
  state?: SwitchState,
  sourceOn?: boolean
): Node {
  const mimic = { kind, state, sourceOn, label: id };
  return {
    id,
    type: kind === "junction" ? "junction" : "scada",
    position: { x, y },
    data: { label: id, mimic },
    draggable: kind !== "junction",
    selectable: true,
  };
}

function isConducting(kind: NodeKind, state?: SwitchState, sourceOn?: boolean): boolean {
  if (kind === "source") return sourceOn === true;
  if (kind === "cb" || kind === "ds") return state === "closed";
  if (kind === "es") return false;
  return true;
}

function computeGroundedVisual(nodes: any[], edges: any[]) {
  const nodeById = new Map(nodes.map((n: any) => [n.id, n]));
  const adj = new Map<string, Array<{ other: string; edgeId: string }>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push({ other: e.target, edgeId: e.id });
    adj.get(e.target)!.push({ other: e.source, edgeId: e.id });
  }

  const groundedNodeIds = new Set<string>();
  const groundedEdgeIds = new Set<string>();
  const queue: string[] = nodes.filter((n: any) => n.kind === "es" && n.state === "closed").map((n: any) => n.id);

  while (queue.length) {
    const id = queue.shift()!;
    if (groundedNodeIds.has(id)) continue;
    const node = nodeById.get(id);
    if (!node || node.kind === "source") continue;

    groundedNodeIds.add(id);

    for (const { other, edgeId } of adj.get(id) ?? []) {
      const otherNode = nodeById.get(other);
      if (!otherNode) continue;

      groundedEdgeIds.add(edgeId);
      if (otherNode.kind === "source") continue;

      if (otherNode.kind === "es") {
        groundedNodeIds.add(otherNode.id);
        continue;
      }
      if ((otherNode.kind === "ds" || otherNode.kind === "cb") && otherNode.state !== "closed") {
        groundedNodeIds.add(otherNode.id);
        continue;
      }
      if (isConducting(otherNode.kind, otherNode.state, otherNode.sourceOn)) queue.push(other);
    }
  }

  return { groundedNodeIds, groundedEdgeIds };
}

function templateTest() {
  const makeNode = (kind: NodeKind, id: string, x: number, y: number, state?: SwitchState, sourceOn?: boolean): Node => {
    const mimic = { kind, state, sourceOn, label: id };
    return {
      id,
      type: kind === "junction" ? "junction" : "scada",
      position: { x, y },
      data: { label: id, mimic },
      draggable: kind !== "junction",
    };
  };

  const nodes: Node[] = [
    makeNode("source", "SRC", 80, 140, undefined, true),
    makeNode("junction", "J1", 260, 140),
    makeNode("es", "ES1", 260, 280, "open"),
    makeNode("ds", "DS1", 420, 140, "closed"),
    makeNode("cb", "CB1", 580, 140, "closed"),
    makeNode("ds", "DS2", 740, 140, "closed"),
    makeNode("junction", "J2", 900, 140),
    makeNode("es", "ES2", 900, 280, "open"),
    makeNode("load", "LOAD", 1080, 140),
  ];

  const edges: Edge[] = [
    makeBusbarEdge("SRC", "J1", "R", "L"),
    makeBusbarEdge("J1", "DS1", "R", "L"),
    makeBusbarEdge("DS1", "CB1", "R", "L"),
    makeBusbarEdge("CB1", "DS2", "R", "L"),
    makeBusbarEdge("DS2", "J2", "R", "L"),
    makeBusbarEdge("J2", "LOAD", "R", "L"),
    makeBusbarEdge("J1", "ES1", "B", "T"),
    makeBusbarEdge("J2", "ES2", "B", "T"),
  ];

  return { nodes, edges, name: "Test: SRC → ES || DS → CB → DS || ES → LOAD", description: "Source through DS/CB chain with parallel earth switches at each end." };
}

// ---------- AppInner ----------
function AppInner() {
  const { screenToFlowPosition } = useReactFlow();

  const tpl = useMemo(() => templateTest(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(tpl.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(tpl.edges);

  const nodeTypes = useMemo(() => ({ junction: JunctionNode, scada: ScadaNode }), []);
  
  const edgeClickTimerRef = useRef<number | null>(null);
  const edgeClickIgnoreRef = useRef(false);

  // UI states
  const [locked, setLocked] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  const [openInterlocking, setOpenInterlocking] = useState(false);
  const [openLabelling, setOpenLabelling] = useState(false);
  const [openSaveLoad, setOpenSaveLoad] = useState(false);

  // Event log
  const [events, setEvents] = useState<EventLogItem[]>([]);
  const [filters, setFilters] = useState<Record<EventCategory, boolean>>({ info: true, warn: true, error: true, debug: false });
  const appendEvent = useCallback((category: EventCategory, msg: string) => {
    setEvents((ev) => [{ ts: Date.now(), category, msg }, ...ev].slice(0, 500));
  }, []);

  // Selection/operate gating
  const lastDragEndTsRef = useRef<number>(0);

  const onNodeDragStart: NodeDragHandler = useCallback(() => {
    // do nothing; we gate based on drag-end time
  }, []);

  const onNodeDragStop: NodeDragHandler = useCallback(() => {
    lastDragEndTsRef.current = Date.now();
  }, []);


  // Labeling state
  const [labelScheme, setLabelScheme] = useState<LabelScheme>("DEFAULT");
  const [labelMode, setLabelMode] = useState<LabelMode>("AUTO");
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [bayTypeOverrides, setBayTypeOverrides] = useState<Record<string, BayType>>({});
  const [bp109MetaById, setBp109MetaById] = useState<Record<string, BP109Meta>>({});

  const ensureBp109Meta = useCallback((nodeId: string, kind: NodeKind) => {
    setBp109MetaById((m) => (m[nodeId] ? m : { ...m, [nodeId]: defaultBp109Meta(kind) }));
  }, []);

  // Interlocks state
  const [interlocks, setInterlocks] = useState<InterlockRule[]>([]);

  // Save metadata
  const [saveTitle, setSaveTitle] = useState(tpl.name);
  const [saveDescription, setSaveDescription] = useState(tpl.description);

  // Derived maps
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Label computation
  const computeAutoLabel = useCallback((nodeId: string) => {
    const node = nodeById.get(nodeId);
    if (!node) return nodeId;
    const md = getMimicData(node);
    if (!md || md.kind === "junction") return nodeId;

    const base = (node.data as any)?.label ?? node.id;

    if (labelScheme === "DEFAULT") return base;

    const meta = bp109MetaById[nodeId];
    if (!meta) return base;
    return computeBp109Label(meta);
  }, [bp109MetaById, labelScheme, nodeById]);

  const getDisplayLabel = useCallback((nodeId: string) => {
    if (labelMode === "FREEFORM") {
      const o = (labelOverrides[nodeId] ?? "").trim();
      if (o.length > 0) return o;
    }
    return computeAutoLabel(nodeId);
  }, [computeAutoLabel, labelMode, labelOverrides]);

  const applyLabelsToNodes = useCallback(() => {
    setNodes((ns) =>
      ns.map((n) => {
        const md = getMimicData(n);
        if (!md || md.kind === "junction") return n;
        const label = getDisplayLabel(n.id);
        return { ...n, data: { ...(n.data as any), label } };
      })
    );
  }, [getDisplayLabel, setNodes]);

  useMemo(() => {
    applyLabelsToNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelScheme, labelMode, labelOverrides, bayTypeOverrides, bp109MetaById]);

  // Connect validation
const getDegree = (nodeId: string) =>
  edges.reduce((acc, e) => acc + ((e.source === nodeId || e.target === nodeId) ? 1 : 0), 0);

const isValidConnection = useCallback(
  (c: Connection) => {
    if (!c.source || !c.target) return false;

    const sourceNode = nodeById.get(c.source);
    const targetNode = nodeById.get(c.target);
    if (!sourceNode || !targetNode) return false;

    const sourceKind = getMimicData(sourceNode)?.kind;
    const targetKind = getMimicData(targetNode)?.kind;
    if (!sourceKind || !targetKind) return false;

  // Interface nodes: exactly one connection total, allow any side.
  // (This must run BEFORE axis locking logic.)
    if (targetKind === "load") {
      return getDegree(c.target) === 0;
    }
    if (sourceKind === "source") {
      return getDegree(c.source) === 0;
    }
    if (targetKind === "source") {
      return getDegree(c.target) === 0;
    }
    if (sourceKind === "load") {
      return getDegree(c.source) === 0;
    }

  // ES must be a single-connection branch device (prevents ES being used inline)
    if (sourceKind === "es" && getDegree(c.source) >= 1) return false;
    if (targetKind === "es" && getDegree(c.target) >= 1) return false;

    // Axis locking on the TARGET:
    const used = new Set<string>();
    for (const e of edges) {
      if (e.source === c.target && e.sourceHandle) used.add(e.sourceHandle);
      if (e.target === c.target && e.targetHandle) used.add(e.targetHandle);
    }
    const hasH = used.has("L") || used.has("R");
    const hasV = used.has("T") || used.has("B");

    if (hasH) return c.targetHandle === "L" || c.targetHandle === "R";
    if (hasV) return c.targetHandle === "T" || c.targetHandle === "B";

    return true;
  },
  [edges, nodeById]
);


  // Energization/grounding
  const { nodes: mimicNodes, edges: mimicEdges } = useMemo(() => flowToMimicLocal(nodes, edges), [nodes, edges]);
  const energized = useMemo(() => computeEnergized(mimicNodes as any, mimicEdges as any), [mimicNodes, mimicEdges]);
  const grounded = useMemo(() => computeGroundedVisual(mimicNodes as any, mimicEdges as any), [mimicNodes, mimicEdges]);

  const styledEdges = useMemo(() => {
    return edges.map((e) => {
      const isE = energized.energizedEdgeIds.has(e.id);
      const isG = grounded.groundedEdgeIds.has(e.id);
      const conflict = isE && isG;

      const base: Edge = { ...e, type: "step", style: { strokeWidth: 6 } };
      if (conflict) return { ...base, style: { ...base.style, stroke: "#ff4d4d", strokeDasharray: "10 6" } };
      if (isG) return { ...base, style: { ...base.style, stroke: "#ffb020", strokeDasharray: "10 6" } };
      if (isE) return { ...base, style: { ...base.style, stroke: "#00e5ff" } };
      return { ...base, style: { ...base.style, stroke: "#64748b" } };
    });
  }, [edges, energized.energizedEdgeIds, grounded.groundedEdgeIds]);

  // Orphan junction cleanup
  const cleanupOrphanJunctions = useCallback((nextEdges: Edge[]) => {
    const connected = new Set<string>();
    for (const e of nextEdges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    setNodes((ns) => ns.filter((n) => getMimicData(n)?.kind !== "junction" || connected.has(n.id)));
  }, [setNodes]);

  // Busbar delete (double-click)
  const onEdgeDoubleClick = useCallback((_evt: any, edge: Edge) => {
    const bbid = (edge.data as any)?.busbarId as string | undefined;
    if (!bbid) return;

    // Cancel pending single-click selection
    if (edgeClickTimerRef.current) {
      window.clearTimeout(edgeClickTimerRef.current);
      edgeClickTimerRef.current = null;
    }
    // Prevent click from re-selecting after delete
    edgeClickIgnoreRef.current = true;

    setSelectedEdge(null);

    setEdges((eds) => {
      const next = eds.filter((e) => (e.data as any)?.busbarId !== bbid);
      // cleanup orphan junctions after deletion
      window.setTimeout(() => cleanupOrphanJunctions(next), 0);
      return next;
    });
  }, [cleanupOrphanJunctions, setEdges]);


  
  // Edge click handling
  const onEdgeClick = useCallback((_evt: any, edge: Edge) => {
    if ((edge.data as any)?.kind !== "busbar") return;

    // If a double-click just happened, ignore this click.
    if (edgeClickIgnoreRef.current) {
      edgeClickIgnoreRef.current = false;
      return;
    }

    // Debounce selection so double-click can win.
    if (edgeClickTimerRef.current) window.clearTimeout(edgeClickTimerRef.current);

    edgeClickTimerRef.current = window.setTimeout(() => {
      setSelectedEdge(edge);
     edgeClickTimerRef.current = null;
    }, 220);
  }, []);


  const updateEdgeData = useCallback(
    (edgeId: string, patch: any) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId ? { ...e, data: { ...(e.data as any), ...patch } } : e
        )
      );
    },
    []
  );

  // DnD from palette
  const onDragOver = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    const kind = evt.dataTransfer.getData("application/mimic-node-kind") as NodeKind;
    if (!kind) return;
    const pos = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
    const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;
    setNodes((ns) => ns.concat(makeNode(kind, id, pos.x, pos.y, (kind === "cb" || kind === "ds" || kind === "es") ? "open" : undefined)));
    ensureBp109Meta(id, kind);
    appendEvent("debug", `DROP ${kind.toUpperCase()} ${id}`);
  }, [appendEvent, ensureBp109Meta, screenToFlowPosition, setNodes]);

  const onAddAtCenter = useCallback((kind: NodeKind) => {
    const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;
    setNodes((ns) => ns.concat(makeNode(kind, id, 260, 160, (kind === "cb" || kind === "ds" || kind === "es") ? "open" : undefined)));
    ensureBp109Meta(id, kind);
    appendEvent("debug", `CREATE ${kind.toUpperCase()} ${id}`);
  }, [appendEvent, ensureBp109Meta, setNodes]);

  // Connect handler
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    if (locked) return;
    const newEdge = makeBusbarEdge(c.source, c.target, c.sourceHandle ?? undefined, c.targetHandle ?? undefined);
    setEdges((eds) => addEdge(newEdge, eds));
    appendEvent("debug", `BUSBAR ADD ${newEdge.id}`);
  }, [appendEvent, locked, setEdges]);

  // Interlock check
  const checkInterlock = useCallback((actionNodeId: string, actionTo: SwitchState): string | null => {
    const nodesMap = new Map(nodes.map((n) => [n.id, n]));
    for (const r of interlocks) {
      if (r.actionNodeId !== actionNodeId) continue;
      if (r.actionTo !== actionTo) continue;
      const condNode = nodesMap.get(r.condNodeId);
      const condState = getMimicData(condNode as any)?.state ?? "open";
      if (condState === r.condState) {
        return `Interlock: Block ${actionNodeId} -> ${actionTo.toUpperCase()} when ${r.condNodeId} is ${r.condState.toUpperCase()}`;
      }
    }
    return null;
  }, [interlocks, nodes]);

  // Command simulation
  const pendingRef = useRef<Map<string, any>>(new Map());
  const setNodeSwitchState = useCallback((nodeId: string, to: SwitchState) => {
    setNodes((ns) => ns.map((n) => {
      if (n.id !== nodeId) return n;
      const md = getMimicData(n);
      if (!md) return n;
      return { ...n, data: { ...(n.data as any), mimic: { ...md, state: to } } };
    }));
  }, [setNodes]);

  const scheduleSwitchCommand = useCallback((nodeId: string, kind: NodeKind, to: SwitchState) => {
    const blocked = checkInterlock(nodeId, to);
    if (blocked) { appendEvent("warn", blocked); return; }

    if (pendingRef.current.has(nodeId)) { appendEvent("warn", `CMD REJECTED ${kind.toUpperCase()} ${nodeId} (already in progress)`); return; }

    let completionMs = 1000;
    let timeoutMs = 4000;
    if (kind === "cb") { completionMs = Math.round(60 + Math.random() * 60); timeoutMs = 500; }
    else if (kind === "ds" || kind === "es") { completionMs = Math.round(2000 + Math.random() * 1000); timeoutMs = 6000; }

    const cmdId = `cmd-${crypto.randomUUID().slice(0, 6)}`;
    appendEvent("info", `CMD ${kind.toUpperCase()} ${nodeId} ${to.toUpperCase()}`);

    const willFail = Math.random() < (kind === "cb" ? 0.01 : 0.03);

    const completeTimer = window.setTimeout(() => {
      const pending = pendingRef.current.get(nodeId);
      if (!pending || pending.cmdId !== cmdId) return;
      window.clearTimeout(pending.timeoutTimer);
      pendingRef.current.delete(nodeId);
      if (willFail) { appendEvent("error", `RPT ${kind.toUpperCase()} ${nodeId} FAILED (${to.toUpperCase()})`); return; }
      setNodeSwitchState(nodeId, to);
      appendEvent("info", `RPT ${kind.toUpperCase()} ${nodeId} ${to.toUpperCase()}`);
    }, completionMs);

    const timeoutTimer = window.setTimeout(() => {
      const pending = pendingRef.current.get(nodeId);
      if (!pending || pending.cmdId !== cmdId) return;
      window.clearTimeout(pending.completeTimer);
      pendingRef.current.delete(nodeId);
      appendEvent("error", `TIMEOUT ${kind.toUpperCase()} ${nodeId} (${to.toUpperCase()}) after ${timeoutMs} ms`);
    }, timeoutMs);

    pendingRef.current.set(nodeId, { cmdId, completeTimer, timeoutTimer });
  }, [appendEvent, checkInterlock, setNodeSwitchState]);

  const onNodeClick = useCallback((_evt: any, node: Node) => {
    // If we just finished dragging, ignore clicks for a short window
    if (Date.now() - lastDragEndTsRef.current < 180) return;

    const md = getMimicData(node);
    if (!md || md.kind === "junction") return;

    if (md.kind === "cb" || md.kind === "ds" || md.kind === "es") {
      const current = md.state ?? "open";
      const to: SwitchState = current === "closed" ? "open" : "closed";
      scheduleSwitchCommand(node.id, md.kind, to);
    }
  }, [scheduleSwitchCommand]);


  // SCADA switchgear list
  const switchgear = useMemo(() => {
    const byKind: Record<"es"|"ds"|"cb", Array<{ id: string; state: "open"|"closed"; label: string }>> = { es: [], ds: [], cb: [] };
    for (const n of nodes) {
      const md = getMimicData(n);
      if (!md) continue;
      if (md.kind !== "es" && md.kind !== "ds" && md.kind !== "cb") continue;
      byKind[md.kind].push({ id: n.id, state: (md.state ?? "open") as any, label: (n.data as any)?.label ?? n.id });
    }
    (Object.keys(byKind) as Array<"es"|"ds"|"cb">).forEach((k) => byKind[k].sort((a,b)=>a.label.localeCompare(b.label)));
    return byKind;
  }, [nodes]);

  const onToggleSwitch = useCallback((id: string) => {
    const node = nodeById.get(id);
    if (!node) return;
    const md = getMimicData(node);
    if (!md) return;
    const current = md.state ?? "open";
    const to: SwitchState = current === "closed" ? "open" : "closed";
    scheduleSwitchCommand(id, md.kind, to);
  }, [nodeById, scheduleSwitchCommand]);

  // Event log filters
  const onToggleFilter = useCallback((cat: EventCategory) => setFilters((f) => ({ ...f, [cat]: !f[cat] })), []);

  // Modals
  const switchgearIds = useMemo(() => Object.values(switchgear).flat().map((x) => x.id).sort(), [switchgear]);

  // Save/Load
  const serializeProject = useCallback(() => {
    return JSON.stringify({
      schemaVersion: "1.0",
      metadata: { title: saveTitle, description: saveDescription },
      nodes,
      edges,
      labelScheme,
      labelMode,
      labelOverrides,
      bayTypeOverrides,
      bp109MetaById,
      interlocks,
    }, null, 2);
  }, [bayTypeOverrides, bp109MetaById, edges, interlocks, labelMode, labelOverrides, labelScheme, nodes, saveDescription, saveTitle]);

  const onDownload = useCallback(() => {
    const json = serializeProject();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${saveTitle.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40) || "mimic-template"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    appendEvent("debug", "Saved template JSON");
  }, [appendEvent, saveTitle, serializeProject]);

  const onLoadFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed?.nodes || !parsed?.edges) { appendEvent("error", "Load failed: invalid file format"); return; }
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
    appendEvent("debug", `Loaded ${file.name}`);
  }, [appendEvent, setEdges, setNodes]);

  const templates = useMemo(() => [tpl], [tpl]);
  const onLoadTemplate = useCallback((name: string) => {
    if (name === tpl.name) {
      const t = templateTest();
      setNodes(t.nodes);
      setEdges(t.edges);
      setSaveTitle(t.name);
      setSaveDescription(t.description);
      appendEvent("debug", `Loaded template: ${t.name}`);
      setOpenSaveLoad(false);
    }
  }, [appendEvent, tpl.description, tpl.name]);

  // Build tag
  const buildTag = "SPLIT-001";

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#060b12" }}>
      <TopToolbar
        buildTag={buildTag}
        onOpenInterlocking={() => setOpenInterlocking(true)}
        onOpenLabelling={() => setOpenLabelling(true)}
        onOpenSaveLoad={() => setOpenSaveLoad(true)}
      />

      <div style={{ display: "flex", height: "100vh", paddingTop: 52 }}>
        <EditorCanvas
          nodes={nodes}
          edges={styledEdges}
		  rawEdges={edges}
		  setNodes={setNodes}
          setEdges={setEdges}
          nodeTypes={nodeTypes}
          locked={locked}
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((v) => !v)}
          onToggleLock={() => setLocked((v) => !v)}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          isValidConnection={isValidConnection}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onAddAtCenter={onAddAtCenter}
		  onEdgeClick={onEdgeClick}
        />

        <ScadaPanel
          energizedEdgeCount={energized.energizedEdgeIds.size}
          groundedEdgeCount={grounded.groundedEdgeIds.size}
          switchgear={switchgear}
          onToggleSwitch={onToggleSwitch}
          events={events}
          filters={filters}
          onToggleFilter={onToggleFilter}
        />
      </div>

      <InterlockingModal
        open={openInterlocking}
        onClose={() => setOpenInterlocking(false)}
        switchgearIds={switchgearIds}
        rules={interlocks}
        setRules={setInterlocks}
        appendDebug={(m) => appendEvent("debug", m)}
      />

      <LabellingModal
        open={openLabelling}
        onClose={() => setOpenLabelling(false)}
        nodes={nodes}
        getKind={(n) => getMimicData(n)?.kind ?? null}
        labelScheme={labelScheme}
        setLabelScheme={setLabelScheme}
        labelMode={labelMode}
        setLabelMode={setLabelMode}
        labelOverrides={labelOverrides}
        setLabelOverrides={(fn) => setLabelOverrides(fn)}
        bayTypeOverrides={bayTypeOverrides}
        setBayTypeOverrides={(fn) => setBayTypeOverrides(fn)}
        bp109MetaById={bp109MetaById}
        setBp109MetaById={(fn) => setBp109MetaById(fn)}
        getDisplayLabel={getDisplayLabel}
        ensureBp109Meta={(nodeId, kind) => ensureBp109Meta(nodeId, kind)}
      />

      <SaveLoadModal
        open={openSaveLoad}
        onClose={() => setOpenSaveLoad(false)}
        saveTitle={saveTitle}
        setSaveTitle={setSaveTitle}
        saveDescription={saveDescription}
        setSaveDescription={setSaveDescription}
        onDownload={onDownload}
        onLoadFile={onLoadFile}
        templates={templates}
        onLoadTemplate={onLoadTemplate}
      />
	  
	  <BusbarModal
	    open={!!selectedEdge}
	    edge={selectedEdge}
	    onClose={() => setSelectedEdge(null)}
	    onUpdateEdgeData={updateEdgeData}
	  />
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
