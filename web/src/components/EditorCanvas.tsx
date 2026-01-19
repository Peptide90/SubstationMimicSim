import { useCallback, useMemo, useRef } from "react";
import { useStore } from "reactflow";
import ReactFlow, { Background, BackgroundVariant, ControlButton, Controls, MiniMap, useReactFlow } from "reactflow";
import type { Connection, Edge, Node, NodeDragHandler, OnConnectEnd, OnConnectStartParams } from "reactflow";
import type { DragEvent } from "react";

import { Palette } from "../ui/Palette";
import { BusbarEdge } from "../ui/BusbarEdge";
import { busbarPolyline } from "../ui/busbarRouter";

function isBusbarEdge(e: Edge): boolean {
  return (e.data as any)?.kind === "busbar";
}

function getBusbarId(e: Edge): string | undefined {
  return (e.data as any)?.busbarId as string | undefined;
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

type ConnectStart = {
  nodeId: string | null;
  handleId: string | null;
  handleType: "source" | "target" | null;
};

function pointOnSegment(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }, eps = 0.5) {
  // Assumes axis-aligned segments (true for our polylines)
  const minX = Math.min(a.x, b.x) - eps;
  const maxX = Math.max(a.x, b.x) + eps;
  const minY = Math.min(a.y, b.y) - eps;
  const maxY = Math.max(a.y, b.y) + eps;

  // Colinear for horizontal/vertical
  const isH = Math.abs(a.y - b.y) < eps;
  const isV = Math.abs(a.x - b.x) < eps;

  if (isH && Math.abs(p.y - a.y) < eps && p.x >= minX && p.x <= maxX) return true;
  if (isV && Math.abs(p.x - a.x) < eps && p.y >= minY && p.y <= maxY) return true;
  return false;
}

function splitPolyline(poly: { x: number; y: number }[], split: { x: number; y: number }) {
  const outA: { x: number; y: number }[] = [];
  const outB: { x: number; y: number }[] = [];

  let inserted = false;

  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];

    outA.push(a);

    if (!inserted && pointOnSegment(a, b, split)) {
      outA.push(split);
      outB.push(split);
      inserted = true;
    }

    if (inserted) outB.push(b);
  }

  // Fallback: if we didn't insert, just split at end
  if (!inserted) {
    return { a: poly.slice(), b: [split, poly[poly.length - 1]] };
  }

  return { a: outA, b: outB };
}


export function EditorCanvas(props: {
  nodes: Node[];
  edges: Edge[];      // DISPLAY edges (styled)
  rawEdges: Edge[];   // CANONICAL edges (used for tee splitting)
  nodeTypes: Record<string, any>;

  locked: boolean;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onToggleLock: () => void;

  onNodesChange: any;
  onEdgesChange: any;

  isValidConnection: (c: Connection) => boolean;
  onConnect: (c: Connection) => void;

  onNodeClick: (_: any, node: Node) => void;
  onNodeDragStart: NodeDragHandler;
  onNodeDragStop: NodeDragHandler;
  onNodeDoubleClick: (_: any, node: Node) => void;

  onEdgeClick: (_: any, edge: Edge) => void;
  onEdgeDoubleClick: (_: any, edge: Edge) => void;

  onDragOver: (evt: DragEvent) => void;
  onDrop: (evt: DragEvent) => void;

  onAddAtCenter: (kind: any) => void;

  setNodes: (updater: (prev: Node[]) => Node[]) => void;
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;
  
  onEdgeContextMenu: (edge: Edge, pos: { x: number; y: number }) => void;
  onNodeContextMenu: (node: Node, pos: { x: number; y: number }) => void;
  onPaneContextMenu: (pos: { x: number; y: number }) => void;
  onPaneClick: () => void;

}) {
  const {
    nodes,
    edges,
    rawEdges,
    nodeTypes,
    locked,
    snapEnabled,
    onToggleSnap,
    onToggleLock,
    onNodesChange,
    onEdgesChange,
    isValidConnection,
    onConnect,
    onNodeClick,
    onNodeDragStart,
    onNodeDragStop,
	onNodeDoubleClick,
    onEdgeClick,
    onEdgeDoubleClick,
    onDragOver,
    onDrop,
    onAddAtCenter,
    setNodes,
    setEdges,
	onEdgeContextMenu,
	onNodeContextMenu,
	onPaneContextMenu,
	onPaneClick,
  } = props;

  const { screenToFlowPosition } = useReactFlow();

  // Wire custom edge types (busbar renderer)
  const edgeTypes = useMemo(() => ({ busbar: BusbarEdge }), []);

  // Track a connect gesture to decide whether to tee insert
  const connectStartRef = useRef<ConnectStart>({ nodeId: null, handleId: null, handleType: null });
  const connectWasValidRef = useRef(false);

  const nodeInternals = useStore((s: any) => s.nodeInternals);

  const getHandleCenter = useCallback(
    (nodeId: string, handleId: string | null | undefined) => {
      const n = nodeInternals?.get?.(nodeId);
      if (!n) return null;

      // Absolute node position React Flow uses for rendering
      const abs = n.positionAbsolute ?? n.position ?? { x: 0, y: 0 };

      // handleBounds can exist in different shapes depending on RF version
      const hb = n.internals?.handleBounds ?? n.handleBounds;
      if (!hb || !handleId) {
        // fallback: use node center
        return { x: abs.x + (n.width ?? 0) / 2, y: abs.y + (n.height ?? 0) / 2 };
      }

      const all = [...(hb.source ?? []), ...(hb.target ?? [])];
      const h = all.find((x: any) => x.id === handleId);
      if (!h) {
        return { x: abs.x + (n.width ?? 0) / 2, y: abs.y + (n.height ?? 0) / 2 };
      }

      // Handle bounds are relative to node; convert to absolute center
      return {
        x: abs.x + h.x + h.width / 2,
        y: abs.y + h.y + h.height / 2,
      };
    },
    [nodeInternals]
  );

  const findNearestBusbar = useCallback(
    (p: { x: number; y: number }) => {
      let best: { edge: Edge; point: { x: number; y: number }; a: { x: number; y: number }; b: { x: number; y: number }; dist2: number } | null = null;

      for (const e of rawEdges) {
        if (!isBusbarEdge(e)) continue;

        const sPt = getHandleCenter(e.source, e.sourceHandle);
        const tPt = getHandleCenter(e.target, e.targetHandle);
        if (!sPt || !tPt) continue;

        const poly = busbarPolyline(sPt, tPt);

        for (let i = 0; i < poly.length - 1; i++) {
          const cp = closestPointOnSegment(poly[i], poly[i + 1], p);
          if (!best || cp.dist2 < best.dist2) {
            best = {
			  edge: e,
			  point: { x: cp.x, y: cp.y },
			  a: poly[i],
			  b: poly[i + 1],
			  dist2: cp.dist2
			};
          }
        }
      }

      const threshold = 45;
      if (best && best.dist2 <= threshold * threshold) return best;
      return null;
    },
    [rawEdges, getHandleCenter]
  );

  const insertTee = useCallback(
    (fromNodeId: string, fromHandleId: string | null, fromHandleType: "source" | "target" | null, dropFlow: { x: number; y: number }) => {
      const hit = findNearestBusbar(dropFlow);
      if (!hit) return;

      const busbarEdge = hit.edge;
      const bbid = getBusbarId(busbarEdge);
      if (!bbid) return;

	  // Place junction center exactly on the busbar hit point.
	  const J = 18; // must match JunctionNode.tsx size
	  const center = { x: hit.point.x, y: hit.point.y };
   	  const jPos = { x: center.x - J / 2, y: center.y - J / 2 };

      const jId = `J-${bbid}-${crypto.randomUUID().slice(0, 4)}`;

      setNodes((prev) =>
        prev.concat({
          id: jId,
          type: "junction",
          position: jPos,
          data: { label: jId, mimic: { kind: "junction" } },
          draggable: true,
          selectable: true,
        })
      );

	  const sPt = getHandleCenter(busbarEdge.source, busbarEdge.sourceHandle)!;
	  const tPt = getHandleCenter(busbarEdge.target, busbarEdge.targetHandle)!;

	  const poly = busbarPolyline(sPt, tPt);

  setEdges((prev) => {
    const remaining = prev.filter((e) => e.id !== busbarEdge.id);

    const splitPoint = { x: center.x, y: center.y };
    const { a, b } = splitPolyline(poly, splitPoint);
	if (a.length < 2 || b.length < 2) return remaining; // or fall back to no-split

    const segA: Edge = {
      id: `${bbid}-${crypto.randomUUID().slice(0, 4)}a`,
      source: busbarEdge.source,
      target: jId,
      sourceHandle: busbarEdge.sourceHandle,
      targetHandle: "J",
      type: "busbar",
      data: {
        ...(busbarEdge.data as any),
        kind: "busbar",
        busbarId: bbid,
        points: a,
      },
    };

    const segB: Edge = {
      id: `${bbid}-${crypto.randomUUID().slice(0, 4)}b`,
      source: jId,
      target: busbarEdge.target,
      sourceHandle: "J",
      targetHandle: busbarEdge.targetHandle,
      type: "busbar",
      data: {
        ...(busbarEdge.data as any),
        kind: "busbar",
        busbarId: bbid,
        points: b,
      },
    };

    // Branch edge direction depends on whether drag started on a source or target handle
    const branchBusbarId = `bb-${crypto.randomUUID().slice(0, 6)}`;
    const safeHandle = fromHandleId ?? "R";

    const branch: Edge =
      fromHandleType === "target"
        ? {
            id: `${branchBusbarId}-${crypto.randomUUID().slice(0, 4)}`,
            source: jId,
            target: fromNodeId,
            sourceHandle: "J",
            targetHandle: safeHandle,
            type: "busbar",
            data: { kind: "busbar", busbarId: branchBusbarId },
          }
        : {
            id: `${branchBusbarId}-${crypto.randomUUID().slice(0, 4)}`,
            source: fromNodeId,
            target: jId,
            sourceHandle: safeHandle,
            targetHandle: "J",
            type: "busbar",
            data: { kind: "busbar", busbarId: branchBusbarId },
          };

    return remaining.concat(segA, segB, branch);
  });
    },
    [findNearestBusbar, setEdges, setNodes]
  );


  const onConnectStart = useCallback(
    (_evt: unknown, params: OnConnectStartParams) => {
      if (locked) return;
      connectStartRef.current = {
        nodeId: params.nodeId ?? null,
        handleId: (params as any).handleId ?? null,
        handleType: (params as any).handleType ?? null,
      };
      connectWasValidRef.current = false;
    },
    [locked]
  );

  const onConnectWrapped = useCallback(
    (c: Connection) => {
      if (locked) return;
      connectWasValidRef.current = true;
      onConnect(c);
    },
    [locked, onConnect]
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (evt) => {
      if (locked) return;

      const { nodeId, handleId, handleType } = connectStartRef.current;
      connectStartRef.current = { nodeId: null, handleId: null, handleType: null };

      if (!nodeId) return;

      // If normal connect occurred, do nothing.
      if (connectWasValidRef.current) {
        connectWasValidRef.current = false;
        return;
      }

      if (!("clientX" in evt)) return;
      const dropFlow = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      insertTee(nodeId, handleId, handleType, dropFlow);
    },
    [insertTee, locked, screenToFlowPosition]
  );

  return (
    <div style={{ flex: 2, position: "relative" }}>
      <div style={{ width: "100%", height: "100%" }} onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          isValidConnection={isValidConnection}
          onConnect={onConnectWrapped}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgeClick={onEdgeClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeClick={onNodeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
		  onNodeDoubleClick={onNodeDoubleClick}
          fitView
          deleteKeyCode={locked ? [] : ["Backspace", "Delete"]}
          panOnDrag={[1, 2]}
          nodesDraggable={!locked}
          nodesConnectable={!locked}
          edgesUpdatable={!locked}
          elementsSelectable
          selectionOnDrag={!locked}
          snapToGrid={snapEnabled}
          snapGrid={[20, 20]}
		  onEdgeContextMenu={(evt, edge) => {
		    evt.preventDefault();
		    onEdgeContextMenu(edge, { x: evt.clientX, y: evt.clientY });
		  }}
		  onNodeContextMenu={(evt, node) => {
		    evt.preventDefault();
		    onNodeContextMenu(node, { x: evt.clientX, y: evt.clientY });
		  }}
		  onPaneContextMenu={(evt) => {
		    evt.preventDefault();
		    onPaneContextMenu({ x: evt.clientX, y: evt.clientY });
		  }}
		  onPaneClick={() => onPaneClick()}
        >
          <Background variant={BackgroundVariant.Lines} gap={24} />
          <MiniMap />

          <Controls showInteractive={false} position="bottom-left">
            <ControlButton onClick={onToggleSnap} title={`Snap: ${snapEnabled ? "ON" : "OFF"}`}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <rect x="2" y="2" width="4" height="4" fill={snapEnabled ? "currentColor" : "none"} stroke="currentColor" />
                <rect x="7" y="2" width="4" height="4" fill={snapEnabled ? "currentColor" : "none"} stroke="currentColor" />
                <rect x="12" y="2" width="4" height="4" fill={snapEnabled ? "currentColor" : "none"} stroke="currentColor" />
                <rect x="2" y="7" width="4" height="4" fill={snapEnabled ? "currentColor" : "none"} stroke="currentColor" />
                <rect x="7" y="7" width="4" height="4" fill={snapEnabled ? "currentColor" : "none"} stroke="currentColor" />
                <rect x="12" y="7" width="4" height="4" fill={snapEnabled ? "currentColor" : "none"} stroke="currentColor" />
                <rect x="2" y="12" width="4" height="4" fill={snapEnabled ? "currentColor" : "none"} stroke="currentColor" />
                <rect x="7" y="12" width="4" height="4" fill={snapEnabled ? "currentColor" : "none"} stroke="currentColor" />
                <rect x="12" y="12" width="4" height="4" fill={snapEnabled ? "currentColor" : "none"} stroke="currentColor" />
              </svg>
            </ControlButton>

            <ControlButton onClick={onToggleLock} title={locked ? "Unlock editing" : "Lock editing"}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                {locked ? (
                  <path
                    fill="currentColor"
                    d="M12 1a5 5 0 0 0-5 5v4H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 9V6a3 3 0 1 1 6 0v4H9Z"
                  />
                ) : (
                  <path
                    fill="currentColor"
                    d="M17 8V6a5 5 0 0 0-10 0h2a3 3 0 1 1 6 0v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11a3 3 0 0 0 3-3v-9a2 2 0 0 0-2-2h-1Z"
                  />
                )}
              </svg>
            </ControlButton>
          </Controls>
        </ReactFlow>

        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1000 }}>
          <Palette onAddAtCenter={onAddAtCenter} />
        </div>
      </div>
    </div>
  );
}
