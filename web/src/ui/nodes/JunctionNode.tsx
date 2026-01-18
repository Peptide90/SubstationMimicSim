import React from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";

export function JunctionNode(_props: NodeProps) {
  const size = 18;

  const h: React.CSSProperties = {
    width: size,
    height: size,
    opacity: 0,
    pointerEvents: "none",
  };

  return (
    <div
      title="Junction"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: "2px solid #94a3b8",
        background: "#0b1220",
        boxSizing: "border-box",
        cursor: "move",
      }}
    >
      {/* Omni handle id used by tee insertion */}
      <Handle type="target" id="J" position={Position.Top} style={h} />
      <Handle type="source" id="J" position={Position.Top} style={h} />

      {/* Cardinal handles used by templates / manual wiring */}
      <Handle type="target" id="L" position={Position.Left} style={h} />
      <Handle type="target" id="R" position={Position.Right} style={h} />
      <Handle type="target" id="T" position={Position.Top} style={h} />
      <Handle type="target" id="B" position={Position.Bottom} style={h} />

      <Handle type="source" id="L" position={Position.Left} style={h} />
      <Handle type="source" id="R" position={Position.Right} style={h} />
      <Handle type="source" id="T" position={Position.Top} style={h} />
      <Handle type="source" id="B" position={Position.Bottom} style={h} />
    </div>
  );
}
