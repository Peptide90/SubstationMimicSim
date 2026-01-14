import React, { useCallback, useRef } from "react";
import ReactFlow, {
  Background,
  ControlButton,
  Controls,
  MiniMap,
  useReactFlow,
} from "reactflow";
import type { Connection, Edge, Node, NodeDragHandler, OnConnectEnd, OnConnectStartParams } from "reactflow";

import { Palette } from "../ui/Palette";

import { BusbarEdge } from "../ui/BusbarEdge";

function getBusbarId(e: Edge): string | undefined {
  return (e.data as any)?.busbarId as string | undefined;
}

function isBusbarEdge(e: Edge): boolean {
  return (e.data as any)?.kind === "busbar";
}

// Orthogonal polyline for hit-testing (approx.)
function buildStepPolyline(source: { x: number; y: number }, target: { x: number; y: number }) {
  const mx = (source.x + target.x) / 2;
  return [
    { x: source.x, y: source.y },
    { x: mx, y: source.y },
    { x: mx, y: target.y },
    { x: target.x, y: target.y },
  ];
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

export function EditorCanvas(props: {
  nodes: Node[];
  edges: Edge[];
  rawEdges: Edge[];
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

  onEdgeDoubleClick: (_: any, edge: Edge) => void;
  onEdgeClick: (_: any, edge: Edge) => void;

  onDragOver: (evt: React.DragEvent) => void;
  onDrop: (evt: React.DragEvent) => void;

  onAddAtCenter: (kind: any) => void;

  // allow tee insertion to mutate state
  setNodes: (updater: (prev: Node[]) => Node[]) => void;
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;
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
    onEdgeDoubleClick,
	onEdgeClick,  
    onDragOver,
    onDrop,
    onAddAtCenter,
    setNodes,
    setEdges,
  } = props;

  const { screenToFlowPosition, getNode } = useReactFlow();

  const connectStartRef = useRef<ConnectStart>({ nodeId: null, handleId: null, handleType: null });
  const connectWasValidRef = useRef<boolean>(false);

  const snapPoint = useCallback(
    (p: { x: number; y: number }) => {
      if (!snapEnabled) return p;
      const gx = 20;
      const gy = 20;
      return { x: Math.round(p.x / gx) * gx, y: Math.round(p.y / gy) * gy };
    },
    [snapEnabled]
  );

  const findNearestBusbar = useCallback((p: { x: number; y: number }) => {
    let best: { edge: Edge; point: { x: number; y: number }; dist2: number } | null = null;

    for (const e of rawEdges) {
      if (!isBusbarEdge(e)) continue;

      const s = getNode(e.source);
      const t = getNode(e.target);
      if (!s || !t) continue;

      const poly = buildStepPolyline(s.position, t.position);
      for (let i = 0; i < poly.length - 1; i++) {
        const cp = closestPointOnSegment(poly[i], poly[i + 1], p);
        if (!best || cp.dist2 < best.dist2) {
          best = { edge: e, point: { x: cp.x, y: cp.y }, dist2: cp.dist2 };
        }
      }
    }

    const threshold = 45;
    if (best && best.dist2 <= threshold * threshold) return best;
    return null;
  }, [rawEdges, getNode]);


  const insertTee = useCallback(
    (fromNodeId: string, fromHandleId: string | null, fromHandleType: "source" | "target" | null, dropFlow: { x: number; y: number }) => {
      const hit = findNearestBusbar(dropFlow);
      if (!hit) return;

      const busbarEdge = hit.edge;

      // Place junction on the BUSBAR, not where the mouse was.
      let jPos = snapPoint(hit.point);
	  
	  const jPos = snapPoint(hit.point); // closest point ON the busbar

      // Clamp away from corners: at least half-grid from the polyline vertices.
      const half = 10; // half of 20px grid
      jPos = { x: Math.round(jPos.x), y: Math.round(jPos.y) };

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

      setEdges((prev) => {
        const remaining = prev.filter((e) => e.id !== busbarEdge.id);

        // Split into two segments (keep same busbarId so delete works)
        const segA: Edge = {
          id: `${bbid}-${crypto.randomUUID().slice(0, 4)}a`,
          source: busbarEdge.source,
          target: jId,
          sourceHandle: busbarEdge.sourceHandle,
          targetHandle: "J",
          type: "step",
          style: { strokeWidth: 6, stroke: "#64748b", strokeLinecap: "square", strokeLinejoin: "miter" },
          data: { kind: "busbar", busbarId: bbid },
        };

        const segB: Edge = {
          id: `${bbid}-${crypto.randomUUID().slice(0, 4)}b`,
          source: jId,
          target: busbarEdge.target,
          sourceHandle: "J",
          targetHandle: busbarEdge.targetHandle,
          type: "step",
          style: { strokeWidth: 6, stroke: "#64748b", strokeLinecap: "square", strokeLinejoin: "miter" },
          data: { kind: "busbar", busbarId: bbid },
        };

        // Branch direction depends on what you dragged from:
        // - fromHandleType === "source" => from -> junction
        // - fromHandleType === "target" => junction -> from   (this fixes ES)
        const branchBusbarId = `bb-${crypto.randomUUID().slice(0, 6)}`;
        const branchBase: Edge = {
          id: `${branchBusbarId}-${crypto.randomUUID().slice(0, 4)}`,
          type: "step",
          style: { strokeWidth: 6, stroke: "#64748b", strokeLinecap: "square", strokeLinejoin: "miter" },
          data: { kind: "busbar", busbarId: branchBusbarId },
        } as any;

        const safeHandle = fromHandleId ?? "J";

        const branch =
          fromHandleType === "target"
            ? ({
                ...branchBase,
                source: jId,
                target: fromNodeId,
                sourceHandle: "J",
                targetHandle: safeHandle,
              } as Edge)
            : ({
                ...branchBase,
                source: fromNodeId,
                target: jId,
                sourceHandle: safeHandle,
                targetHandle: "J",
              } as Edge);

        return remaining.concat(segA, segB, branch);
      });
    },
    [findNearestBusbarEdge, setEdges, setNodes, snapPoint]
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

      // Normal handle->handle connect happened; do nothing.
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
		  edgeTypes={edgeTypes}
          nodeTypes={nodeTypes}
          isValidConnection={isValidConnection}
          onConnect={onConnectWrapped}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeClick={onNodeClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          panOnDrag={[1, 2]}
          nodesDraggable={!locked}
          nodesConnectable={!locked}
          edgesUpdatable={!locked}
          elementsSelectable
          selectionOnDrag={!locked}
          snapToGrid={snapEnabled}
          snapGrid={[20, 20]}
		  onEdgeClick={onEdgeClick}
        >
          <Background variant="lines" gap={24} />
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
