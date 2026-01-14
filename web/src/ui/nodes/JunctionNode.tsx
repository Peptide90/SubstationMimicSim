import React from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";

export function JunctionNode(_props: NodeProps) {
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
        cursor: "move",
      }}
    >
      {/* Target handle */}
      <Handle
        type="target"
        id="J"
        position={Position.Top}
        style={{
          width: 18,
          height: 18,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
      {/* Source handle */}
      <Handle
        type="source"
        id="J"
        position={Position.Top}
        style={{
          width: 18,
          height: 18,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
