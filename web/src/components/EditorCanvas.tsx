import React from "react";
import ReactFlow, {
  addEdge,
  Background,
  ControlButton,
  Controls,
  MiniMap,
} from "reactflow";
import type { Connection, Edge, Node, NodeDragHandler } from "reactflow";

import { Palette } from "../ui/Palette";

export function EditorCanvas(props: {
  nodes: Node[];
  edges: Edge[];
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

  onDragOver: (evt: React.DragEvent) => void;
  onDrop: (evt: React.DragEvent) => void;

  onAddAtCenter: (kind: any) => void;
}) {
  const {
    nodes,
    edges,
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
    onDragOver,
    onDrop,
    onAddAtCenter,
  } = props;

  return (
    <div style={{ flex: 2, position: "relative" }}>
      <div style={{ width: "100%", height: "100%" }} onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
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
          deleteKeyCode={["Backspace", "Delete"]}
          panOnDrag={[1, 2]}
          nodesDraggable={!locked}
          nodesConnectable={!locked}
          edgesUpdatable={!locked}
          elementsSelectable
          selectionOnDrag={!locked}   // selection tool: drag on empty canvas -> box select
          snapToGrid={snapEnabled}
          snapGrid={[20, 20]}
        >
          <Background variant="lines" gap={24} />
          <MiniMap />

          {/* bottom-left controls: snap + lock */}
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

        {/* Palette */}
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1000 }}>
          <Palette onAddAtCenter={onAddAtCenter} />
        </div>
      </div>
    </div>
  );
}
