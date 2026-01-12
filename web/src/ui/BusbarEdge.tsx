import React from 'react';
import type { EdgeProps } from 'reactflow';

// A rigid right-angle busbar path with an optional offset applied to the "trunk".
// Offset is used to avoid overlaps at tees.
export function BusbarEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    markerEnd,
    style,
    data,
  } = props;

  const offset = (data as any)?.offset ?? 0;

  // Simple orthogonal router: horizontal -> vertical -> horizontal.
  // Apply offset to the mid “trunk” x to separate branches.
  const midX = (sourceX + targetX) / 2 + offset;

  const d = `M ${sourceX} ${sourceY}
             L ${midX} ${sourceY}
             L ${midX} ${targetY}
             L ${targetX} ${targetY}`;

  return (
    <g className="react-flow__edge">
      <path
        id={id}
        d={d}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={markerEnd}
        style={style}
      />
    </g>
  );
}
