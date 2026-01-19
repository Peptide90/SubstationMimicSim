import { useMemo } from "react";
import type { EdgeProps } from "reactflow";
import { busbarPolyline } from "./busbarRouter";

type Pt = { x: number; y: number };

function isValidPts(pts: any): pts is Pt[] {
  return Array.isArray(pts) && pts.length >= 2 && pts.every((p) => typeof p?.x === "number" && typeof p?.y === "number" && isFinite(p.x) && isFinite(p.y));
}

export function BusbarEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, style, markerEnd, data } = props;

  const pts: Pt[] = useMemo(() => {
    const fixed = (data as any)?.points;
    if (isValidPts(fixed)) return fixed;

    // Fallback to computed polyline based on handle centers
    return busbarPolyline({ x: sourceX, y: sourceY }, { x: targetX, y: targetY });
  }, [data, sourceX, sourceY, targetX, targetY]);

  const d = useMemo(() => {
    if (!pts || pts.length < 2) return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

    return pts
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(" ");
  }, [pts, sourceX, sourceY, targetX, targetY]);

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
