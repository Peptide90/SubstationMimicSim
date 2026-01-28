import "reactflow/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, addEdge } from "reactflow";
import type { Connection, Edge, Node, NodeDragHandler } from "reactflow";

import { computeEnergized } from "./core/energize";
import type { NodeKind, SwitchState } from "./core/model";

import { TopToolbar } from "./components/TopToolbar";
import { EditorCanvas } from "./components/EditorCanvas";
import { ScadaPanel } from "./components/ScadaPanel";

import { InterlockingModal } from "./components/modals/InterlockingModal";
import { LabellingModal } from "./components/modals/LabellingModal";
import { SaveLoadModal } from "./components/modals/SaveLoadModal";

import { JunctionNode } from "./ui/nodes/JunctionNode";
import { ScadaNode } from "./ui/nodes/ScadaNode";
import { InterfaceNode } from "./ui/nodes/InterfaceNode";

import { BusbarModal } from "./components/modals/BusbarModal";

import { PowerFlowModal } from "./components/modals/PowerFlowModal";
import { ConfirmModal } from "./components/modals/ConfirmModal";
import { HelpModal } from "./components/modals/HelpModal";
import { MainMenu } from "./components/MainMenu";
import { MultiplayerApp } from "./mp/MultiplayerApp";
import { ChallengeApp } from "./app/challenges/ChallengeApp";

import { ContextMenu } from "./components/ContextMenu";

import { FaultNode } from "./ui/nodes/FaultNode";

import { computeBp109Label, defaultBp109Meta } from "./app/labeling/bp109";

import { useEventLog } from "./app/hooks/useEventLog";
import { useSwitchCommands } from "./app/hooks/useSwitchCommands";
import { useProtection } from "./app/hooks/useProtection";
import { useFaults } from "./app/hooks/useFaults";
import { loadInitialProject, useTemplates } from "./app/hooks/useTemplates";
import { useContextMenu } from "./app/hooks/useContextMenu";
import { BUILD_TAG } from "./app/constants/branding";
import { makeSandboxConfig } from "./app/mimic/EditorModeConfig";
import { flowToMimicLocal, getMimicData, makeBusbarEdge, makeNode } from "./app/mimic/graphUtils";
import { loadChallengeProgress } from "./app/challenges/storage";


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


// ---------- AppInner ----------
function AppInner({ buildTag, onRequestMenu }: { buildTag: string; onRequestMenu: () => void }) {
  const { screenToFlowPosition } = useReactFlow();
  const initialProject = useMemo(() => loadInitialProject(), []);
  const modeConfig = useMemo(() => {
    const progress = loadChallengeProgress();
    const ctUnlocked = progress["tutorial-ct"]?.completed;
    const baseKinds = ["iface", "ds", "cb", "es", "tx", "junction"] as const;
    const allowedKinds = ctUnlocked ? [...baseKinds, "ct", "vt"] : [...baseKinds];
    return { ...makeSandboxConfig(), palette: { enabled: true, allowedKinds } };
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialProject.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialProject.edges);
  const [confirmMenuOpen, setConfirmMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  
  const GRID = 20;
  const snap = (v: number) => Math.round(v / GRID) * GRID;

  const onNodesChangeSnapped = useCallback((changes: any) => {
    // apply React Flow changes first
    onNodesChange(changes);

    const movedIds = new Set<string>();
    for (const change of changes as Array<{ id?: string; type?: string; dragging?: boolean }>) {
      if (!change?.id) continue;
      if (change.type === "position" && change.dragging) movedIds.add(change.id);
    }
    if (movedIds.size === 0) return;

    // then snap only moved nodes to grid to keep busbars straight without shifting others
    setNodes((ns) =>
      ns.map((n) =>
        movedIds.has(n.id)
          ? { ...n, position: { x: snap(n.position.x), y: snap(n.position.y) } }
          : n
      )
    );
  }, [onNodesChange, setNodes]);


  const nodeTypes = useMemo(() => ({
  junction: JunctionNode,
  scada: ScadaNode,
  iface: InterfaceNode,
  fault: FaultNode,
  }), []);
  
  const edgeClickTimerRef = useRef<number | null>(null);
  const edgeClickIgnoreRef = useRef(false);

  // stop scrolling body
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);


  // UI states
  const [locked, setLocked] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  // Modals
  const [openInterlocking, setOpenInterlocking] = useState(false);
  const [openLabelling, setOpenLabelling] = useState(false);
  const [openSaveLoad, setOpenSaveLoad] = useState(false);
  
  // Power Flow modal
  const [openPowerFlow, setOpenPowerFlow] = useState(false);
  const [focusedInterfaceId, setFocusedInterfaceId] = useState<string | null>(null);
  const [interfaceMetaById, setInterfaceMetaById] = useState(initialProject.interfaceMetaById ?? {});

  // Event log
  const { events, filters, appendEvent, onToggleFilter, onAcknowledgeEvent } = useEventLog();

  // Selection/operate gating
  const lastDragEndTsRef = useRef<number>(0);

  const onNodeDragStart: NodeDragHandler = useCallback(() => {
    // do nothing; we gate based on drag-end time
  }, []);

  const onNodeDragStop: NodeDragHandler = useCallback((_e, n) => {
    if (!n) return;
    lastDragEndTsRef.current = Date.now();
    setNodes((ns) =>
      ns.some((x) => x.id === n.id)
        ? ns.map((x) =>
            x.id !== n.id ? x : { ...x, position: { x: snap(x.position.x), y: snap(x.position.y) } }
          )
        : ns
    );
  }, [setNodes]);

  // Interface Labeling
  const nodesForView = useMemo(() => {
    return nodes.map((n) => {
      const md = getMimicData(n);
      if (md?.kind !== "iface") return n;

      const meta = interfaceMetaById[n.id];
      const role = meta?.role ?? "neutral";

      const iface = (n.data as any)?.iface ?? { substationId: "SUB", terminalId: "X1", linkTo: "" };

      return {
        ...n,
        data: {
          ...(n.data as any),
          ifaceRole: role,
          iface,
          onOpenPowerFlow: (id: string) => {
            setFocusedInterfaceId(id);
            setOpenPowerFlow(true);
          },
        },
      };
    });
  }, [nodes, interfaceMetaById, setFocusedInterfaceId, setOpenPowerFlow]);


  // Labeling state
  const [labelScheme, setLabelScheme] = useState(initialProject.labelScheme ?? "DEFAULT");
  const [labelMode, setLabelMode] = useState(initialProject.labelMode ?? "AUTO");
  const [labelOverrides, setLabelOverrides] = useState(initialProject.labelOverrides ?? {});
  const [bayTypeOverrides, setBayTypeOverrides] = useState(initialProject.bayTypeOverrides ?? {});
  const [bp109MetaById, setBp109MetaById] = useState(initialProject.bp109MetaById ?? {});

  const ensureBp109Meta = useCallback((nodeId: string, kind: NodeKind) => {
    setBp109MetaById((m) => (m[nodeId] ? m : { ...m, [nodeId]: defaultBp109Meta(kind) }));
  }, []);

  // Interlocks state
  const [interlocks, setInterlocks] = useState(initialProject.interlocks ?? []);

  const {
    saveTitle,
    setSaveTitle,
    saveDescription,
    setSaveDescription,
    templates,
    onLoadTemplate,
    onLoadFile,
    onDownload,
  } = useTemplates({
    appendEvent,
    bayTypeOverrides,
    bp109MetaById,
    edges,
    interlocks,
    labelMode,
    labelOverrides,
    labelScheme,
    nodes,
    setBayTypeOverrides,
    setBp109MetaById,
    setEdges,
    setInterlocks,
    setInterfaceMetaById,
    setLabelMode,
    setLabelOverrides,
    setLabelScheme,
    setNodes,
    initialProject,
  });

  const onLoadTemplateWithClose = useCallback((id: string) => {
    onLoadTemplate(id);
    setOpenSaveLoad(false);
  }, [onLoadTemplate, setOpenSaveLoad]);

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

  // Interface node: single termination (max 1 connection total)
    if (sourceKind === "iface" && getDegree(c.source) >= 1) return false;
    if (targetKind === "iface" && getDegree(c.target) >= 1) return false;
	
	if (targetKind === "iface") return true;

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
  const energized = useMemo(() => {
  // Convert iface nodes into source semantics for energization root selection
  const nodesForEnergize = mimicNodes.map((n: any) => {
    if (n.kind !== "iface") return n;

    const meta = interfaceMetaById[n.id];
    const enabled = meta?.enabled !== false;
    const role = meta?.role ?? "neutral";

    // Treat "source" role as energizing root
    const sourceOn = enabled && role === "source";

    return { ...n, kind: "source", sourceOn };
  });

  return computeEnergized(nodesForEnergize as any, mimicEdges as any);
}, [mimicNodes, mimicEdges, interfaceMetaById]);

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
    if (locked) return;
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
  }, [cleanupOrphanJunctions, locked, setEdges]);


  
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
    if (locked) return;
    const kind = evt.dataTransfer.getData("application/mimic-node-kind") as NodeKind;
    if (!kind) return;
    const pos = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
    const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;
    setNodes((ns) =>
      ns.concat(
        makeNode(kind, id, pos.x, pos.y, { state: kind === "cb" || kind === "ds" || kind === "es" ? "open" : undefined })
      )
    );
    ensureBp109Meta(id, kind);
    appendEvent("debug", `DROP ${kind.toUpperCase()} ${id}`, { source: "player" });
  }, [appendEvent, ensureBp109Meta, locked, screenToFlowPosition, setNodes]);

  const onAddAtCenter = useCallback((kind: NodeKind) => {
    if (locked) return;
    const id = `${kind}-${crypto.randomUUID().slice(0, 6)}`;
    setNodes((ns) =>
      ns.concat(
        makeNode(kind, id, 260, 160, { state: kind === "cb" || kind === "ds" || kind === "es" ? "open" : undefined })
      )
    );
    ensureBp109Meta(id, kind);
    appendEvent("debug", `CREATE ${kind.toUpperCase()} ${id}`, { source: "player" });
  }, [appendEvent, ensureBp109Meta, locked, setNodes]);

  // Connect handler
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    if (locked) return;
    const newEdge = makeBusbarEdge(c.source, c.target, c.sourceHandle ?? undefined, c.targetHandle ?? undefined);
    setEdges((eds) => addEdge(newEdge, eds));
    appendEvent("debug", `BUSBAR ADD ${newEdge.id}`, { source: "player" });
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
  const onSwitchCompleteRef = useRef<((nodeId: string, kind: NodeKind, to: SwitchState) => void) | null>(null);

  const { scheduleSwitchCommand } = useSwitchCommands({
    appendEvent,
    checkInterlock,
    getMimicData,
    onSwitchComplete: (nodeId, kind, to) => onSwitchCompleteRef.current?.(nodeId, kind, to),
    setNodes,
  });

  const { activeFaultsOnBusbar, checkTripOnClose, createFaultOnEdge, clearFaultById, resetCondition } = useFaults({
    appendEvent,
    edges,
    getMimicData,
    nodes,
    scheduleSwitchCommand,
    setNodes,
  });

  onSwitchCompleteRef.current = (nodeId, kind, to) => {
    if (kind === "cb" && to === "closed") {
      checkTripOnClose(nodeId);
    }
  };

  const onNodeClick = useCallback((_evt: any, node: Node) => {
    // If we just finished dragging, ignore clicks for a short window
    if (Date.now() - lastDragEndTsRef.current < 180) return;

    const md = getMimicData(node);
    if (!md || md.kind === "junction") return;

    // Interface click opens Power Flow modal focused on this interface
    if (md.kind === "iface") {
      setFocusedInterfaceId(node.id);
      setOpenPowerFlow(true);
      return;
    }

    if (md.kind === "cb" || md.kind === "ds" || md.kind === "es") {
      const current = md.state ?? "open";
      const to: SwitchState = current === "closed" ? "open" : "closed";
      scheduleSwitchCommand(node.id, md.kind, to);
    }
  }, [ scheduleSwitchCommand, setFocusedInterfaceId, setOpenPowerFlow ]);

  const onNodeDoubleClick = useCallback((_evt: any, node: Node) => {
    const md = getMimicData(node);
    if (!md || md.kind === "junction") return;

    // Interface: open Power Flow modal
    if (md.kind === "iface") {
      setFocusedInterfaceId(node.id);
      setOpenPowerFlow(true);
      return;
    }

    // Switchgear: operate
    if (md.kind === "cb" || md.kind === "ds" || md.kind === "es") {
      const current = md.state ?? "open";
      const to: SwitchState = current === "closed" ? "open" : "closed";
      scheduleSwitchCommand(node.id, md.kind, to);
    }
  }, [scheduleSwitchCommand, setFocusedInterfaceId, setOpenPowerFlow]);

  // SCADA switchgear list
  const switchgear = useMemo(() => {
    const byKind: Record<
      "es" | "ds" | "cb",
      Array<{
        id: string;
        state: "open" | "closed";
        label: string;
        darEnabled?: boolean;
        darLockout?: boolean;
        failActive?: boolean;
      }>
    > = { es: [], ds: [], cb: [] };
    for (const n of nodes) {
      const md = getMimicData(n);
      if (!md) continue;
      if (md.kind !== "es" && md.kind !== "ds" && md.kind !== "cb") continue;
      if (md.kind === "cb") {
        const protection = (n.data as any)?.protection ?? {};
        byKind[md.kind].push({
          id: n.id,
          state: (md.state ?? "open") as any,
          label: (n.data as any)?.label ?? n.id,
          darEnabled: protection.dar === true,
          darLockout: protection.lockout === true,
          failActive: (n.data as any)?.faulted === true || (n.data as any)?.destroyed === true,
        });
      } else {
        byKind[md.kind].push({ id: n.id, state: (md.state ?? "open") as any, label: (n.data as any)?.label ?? n.id });
      }
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

  // Protection toggles
  const { toggleDarOnCb, toggleAutoIsolateOnDs } = useProtection({
    appendEvent,
    setNodes,
  });

  const CT_PURPOSES = ["LINE", "BUSBAR", "TX_DIFF", "DISTANCE"] as const;
  const VT_REFERENCES = ["BUS", "LINE", "TX"] as const;

  const cycleCtPurpose = useCallback(
    (id: string) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const current = (n.data as any)?.ctPurpose ?? CT_PURPOSES[0];
          const idx = CT_PURPOSES.indexOf(current);
          const next = CT_PURPOSES[(idx + 1) % CT_PURPOSES.length];
          return { ...n, data: { ...(n.data as any), ctPurpose: next } };
        })
      );
    },
    [setNodes]
  );

  const cycleVtReference = useCallback(
    (id: string) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const current = (n.data as any)?.vtReference ?? VT_REFERENCES[0];
          const idx = VT_REFERENCES.indexOf(current);
          const next = VT_REFERENCES[(idx + 1) % VT_REFERENCES.length];
          return { ...n, data: { ...(n.data as any), vtReference: next } };
        })
      );
    },
    [setNodes]
  );


  const getNodeKind = useCallback((n: Node) => {
    const md = getMimicData(n);
    return md?.kind ?? null;
  }, []);

  const {
    ctxMenu,
    onEdgeContextMenu,
    onNodeContextMenu,
    onPaneContextMenu,
    onPaneClick,
    getEdgeById,
    getNodeById,
    getNodeKind: getNodeKindForMenu,
  } = useContextMenu({ edges, nodeById, getNodeKind });

  // Switch-complete handler needs checkTripOnClose from useFaults.

  // Modals
  const switchgearIds = useMemo(() => Object.values(switchgear).flat().map((x) => x.id).sort(), [switchgear]);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#060b12" }}>
      <TopToolbar
        buildTag={buildTag}
        onOpenMenu={() => setConfirmMenuOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenInterlocking={() => setOpenInterlocking(true)}
        onOpenLabelling={() => setOpenLabelling(true)}
        onOpenSaveLoad={() => setOpenSaveLoad(true)}
	    onOpenPowerFlow={() => setOpenPowerFlow(true)}
        disableInterlocking={modeConfig.disableInterlocking}
        disableLabelling={modeConfig.disableLabelling}
        disableSaveLoad={modeConfig.disableSaveLoad}
        disablePowerFlow={modeConfig.disablePowerFlow}
      />

      <div style={{ display: "flex", height: "100vh", paddingTop: 52 }}>
        <EditorCanvas
          nodes={nodesForView}
          edges={styledEdges}
		  rawEdges={edges}
		  setNodes={setNodes}
          setEdges={setEdges}
          nodeTypes={nodeTypes}
          locked={locked}
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((v) => !v)}
          onToggleLock={() => setLocked((v) => !v)}
          onNodesChange={onNodesChangeSnapped}
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
		  onNodeDoubleClick={onNodeDoubleClick}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeContextMenu={onNodeContextMenu}
		  onPaneContextMenu={onPaneContextMenu}
		  onPaneClick={onPaneClick}
          modeConfig={modeConfig}
        />

        <ScadaPanel
          energizedEdgeCount={energized.energizedEdgeIds.size}
          groundedEdgeCount={grounded.groundedEdgeIds.size}
          switchgear={switchgear}
          onToggleSwitch={onToggleSwitch}
          onToggleDar={toggleDarOnCb}
          onResetCondition={resetCondition}
          events={events}
          filters={filters}
          onToggleFilter={onToggleFilter}
          onAcknowledgeEvent={onAcknowledgeEvent}
        />
      </div>

      <InterlockingModal
        open={openInterlocking}
        onClose={() => setOpenInterlocking(false)}
        switchgearIds={switchgearIds}
        rules={interlocks}
        setRules={setInterlocks}
        appendDebug={(m) => appendEvent("debug", m, { source: "player" })}
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
        onLoadTemplate={onLoadTemplateWithClose}
      />
	  
	  <BusbarModal
	    open={!!selectedEdge}
	    edge={selectedEdge}
	    onClose={() => setSelectedEdge(null)}
	    onUpdateEdgeData={updateEdgeData}
	  />
	  
	  <PowerFlowModal
	    open={openPowerFlow}
	    onClose={() => setOpenPowerFlow(false)}
	    interfaces={nodes
		  .filter((n) => getMimicData(n)?.kind === "iface")
		  .map((n) => ({ id: n.id, label: (n.data as any)?.label ?? n.id }))}
	    focusedId={focusedInterfaceId}
	    metaById={interfaceMetaById}
	    setMetaById={setInterfaceMetaById}
	  />
	  
	  <ContextMenu
	  	ctxMenu={ctxMenu}
	  	onClose={onPaneClick}
	  	getNodeById={getNodeById}
	  	getNodeKind={getNodeKindForMenu}
	  	getBusbarIdForEdgeId={(edgeId) => {
	  		const e = getEdgeById(edgeId);
	  		return e ? ((e.data as any)?.busbarId ?? null) : null;
	  	}}
	  	hasActivePersistentFaultOnBusbar={(busbarId) => activeFaultsOnBusbar(busbarId).length > 0}
	  	onCreateFaultOnEdge={(edgeId, screenPos, persistent, severity) => {
	  		const flowPos = screenToFlowPosition(screenPos);
	  		createFaultOnEdge(edgeId, flowPos, { persistent, severity });
	  	}}
	  	onClearPersistentFaultOnBusbar={(busbarId) => {
	  		const list = activeFaultsOnBusbar(busbarId);
	  		for (const f of list) clearFaultById(f.id, "player");
	  	}}
	  	onToggleDar={toggleDarOnCb}
	  	onToggleAutoIsolate={toggleAutoIsolateOnDs}
	  	onCycleCtPurpose={cycleCtPurpose}
	  	onCycleVtReference={cycleVtReference}
	  	onResetCondition={resetCondition}
	  />
      <ConfirmModal
        open={confirmMenuOpen}
        title="Return to main menu?"
        description="Returning to the main menu will discard any unsaved work. Make sure you save before leaving."
        confirmLabel="Return to menu"
        cancelLabel="Stay here"
        onCancel={() => setConfirmMenuOpen(false)}
        onConfirm={() => {
          setConfirmMenuOpen(false);
          onRequestMenu();
        }}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)}>
        <p style={{ marginTop: 0 }}>
          Build your substation by placing nodes, wiring them with busbars, and testing behaviors in the SCADA panel.
        </p>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0", marginBottom: 8 }}>Controls</div>
          <ul style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 8 }}>
            <li>
              <strong>Place nodes:</strong> drag components from the palette onto the canvas to add sources, breakers,
              disconnectors, and junctions.
            </li>
            <li>
              <strong>Drag busbars:</strong> connect handles between nodes to draw busbars. Dragging one node handle onto
              another busbar creates a junction.
            </li>
            <li>
              <strong>Busbar editing:</strong> single-click a busbar to open its properties; double-click deletes it.
            </li>
            <li>
              <strong>Operate switchgear:</strong> double-click switchgear to open/close it.
            </li>
            <li>
              <strong>Right-click options:</strong> right-click nodes for additional options and fault actions.
            </li>
            <li>
              <strong>Multi-select:</strong> click and drag on the canvas to select multiple nodes/junctions, then press
              delete to remove them.
            </li>
            <li>
              <strong>Canvas controls:</strong> the bottom-left controls manage zoom, snapping, and lock options.
            </li>
            <li>
              <strong>Interlocking:</strong> configure interlocking rules for switchgear behavior and safety logic.
            </li>
            <li>
              <strong>Power flow:</strong> review interface metadata and view power flow settings per interface.
            </li>
            <li>
              <strong>Labelling:</strong> set label schemes, overrides, and naming standards for the diagram.
            </li>
            <li>
              <strong>Save/Load:</strong> the Save/Load menu includes templates, plus the option to name and describe
              your build and save it locally for later loading. No session data is collected.
            </li>
          </ul>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0", marginBottom: 8 }}>Technical</div>
          <ul style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 8 }}>
            <li>
              <strong>Components:</strong> sources energize the network, breakers interrupt current, disconnectors
              isolate sections, and earth switches apply grounding.
            </li>
            <li>
              <strong>DAR:</strong> Delayed Auto Reclose (DAR) attempts to automatically reclose a breaker after a trip
              if conditions permit.
            </li>
            <li>
              <strong>Auto Isolation:</strong> automatically isolates sections around a detected fault to protect the
              rest of the network.
            </li>
            <li>
              <strong>Persistent faults:</strong> remain active until cleared and can be used to simulate sustained
              failure scenarios.
            </li>
            <li>
              <strong>Status colors:</strong> energized paths glow brighter, grounded sections show grounded styling, and
              faulted/destroyed nodes indicate abnormal states.
            </li>
          </ul>
        </div>
      </HelpModal>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<"menu" | "editor" | "mp" | "challenges">("menu");

  return (
    <ReactFlowProvider>
      {view === "menu" ? (
        <MainMenu
          buildTag={BUILD_TAG}
          onStartSolo={() => setView("editor")}
          onStartChallenges={() => setView("challenges")}
          onStartMultiplayer={() => setView("mp")}
        />
      ) : null}
      {view === "editor" ? (
        <AppInner buildTag={BUILD_TAG} onRequestMenu={() => setView("menu")} />
      ) : null}
      {view === "challenges" ? (
        <ChallengeApp buildTag={BUILD_TAG} onExit={() => setView("menu")} />
      ) : null}
      {view === "mp" ? <MultiplayerApp onExit={() => setView("menu")} /> : null}
    </ReactFlowProvider>
  );
}
