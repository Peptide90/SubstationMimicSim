import React from "react";
import type { EdgeProps } from "reactflow";
import { busbarPolyline } from "./busbarRouter";

export function BusbarEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, style, markerEnd } = props;

  const pts = busbarPolyline(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY }
  );

  const d = pts
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  return (
    <path
      id={id}
      d={d}
      fill="none"
      style={{
        ...style,
        strokeLinejoin: "miter",
        strokeLinecap: "square",
      }}
      markerEnd={markerEnd}
    />
  );
}
