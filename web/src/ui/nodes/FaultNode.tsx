import React from "react";
import type { NodeProps } from "reactflow";

export function FaultNode(props: NodeProps) {
  const data = props.data as any;
  const label = data?.label ?? "FAULT";

  return (
    <div
      title={label}
      style={{
        width: 14,
        height: 14,
        borderRadius: 999,
        background: "#facc15",
        border: "2px solid #92400e",
        boxSizing: "border-box",
        pointerEvents: "auto",
      }}
    />
  );
}
