import React from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";

export function JunctionNode(props: NodeProps) {
  // Big clickable dot
  return (
    <div
      title="Junction"
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        border: "2px solid #94a3b8",
        background: "#0b1220",
        boxSizing: "border-box",
      }}
    >
      {/* Overlay source and target handles at the SAME spot (center). Invisible but connectable. */}
      <Handle
        type="target"
        id="J"
        position={Position.Left}
        style={{
          width: 18,
          height: 18,
          left: 0,
          top: 0,
          transform: "none",
          opacity: 0,            // invisible
          border: "none",
          background: "transparent",
        }}
      />
      <Handle
        type="source"
        id="J"
        position={Position.Left}
        style={{
          width: 18,
          height: 18,
          left: 0,
          top: 0,
          transform: "none",
          opacity: 0,            // invisible
          border: "none",
          background: "transparent",
        }}
      />
    </div>
  );
}
