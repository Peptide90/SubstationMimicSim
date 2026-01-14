import React from "react";
import type { EdgeProps } from "reactflow";
import { busbarPolyline } from "./busbarRouter";

function clampMin(v: number, minAbs: number) {
  if (Math.abs(v) < minAbs) return v >= 0 ? minAbs : -minAbs;
  return v;
}

export function BusbarEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, style, markerEnd } = props;

  const minBend = 10; // half-grid (with 20px grid)

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  // If almost horizontal or vertical, draw a simple 2-segment path.
  if (Math.abs(dy) < 1) {
    const d = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    return <path id={id} d={d} fill="none" style={style} markerEnd={markerEnd} />;
  }
  if (Math.abs(dx) < 1) {
    const d = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    return <path id={id} d={d} fill="none" style={style} markerEnd={markerEnd} />;
  }

  // Standard orthogonal with a mid-X trunk.
  let midX = sourceX + dx / 2;

  // Enforce minimum bend length so we don't get tiny squiggles:
  // make sure the first horizontal segment and last horizontal segment aren't micro.
  if (Math.abs(midX - sourceX) < minBend) midX = sourceX + clampMin(dx / 2, minBend);
  if (Math.abs(targetX - midX) < minBend) midX = targetX - clampMin(dx / 2, minBend);

  const d = `M ${sourceX} ${sourceY}
             L ${midX} ${sourceY}
             L ${midX} ${targetY}
             L ${targetX} ${targetY
			 
  const pts = busbarPolyline({ x: sourceX, y: sourceY }, { x: targetX, y: targetY });
  const d = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");	 

  return <path id={id} d={d} fill="none" style={style} markerEnd={markerEnd} />;
}
