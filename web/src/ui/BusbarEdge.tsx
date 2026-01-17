import React, { useMemo } from "react";
import type { EdgeProps, Edge } from "reactflow";
import { useStore } from "reactflow";
import { busbarPolyline } from "./busbarRouter";

type Pt = { x: number; y: number };

function isBusbar(e: any): boolean {
  return e?.data?.kind === "busbar";
}

function segIntersects(hA: Pt, hB: Pt, vA: Pt, vB: Pt): Pt | null {
  // h: horizontal, v: vertical
  const y = hA.y;
  const x = vA.x;

  const hMinX = Math.min(hA.x, hB.x);
  const hMaxX = Math.max(hA.x, hB.x);
  const vMinY = Math.min(vA.y, vB.y);
  const vMaxY = Math.max(vA.y, vB.y);

  if (x > hMinX && x < hMaxX && y > vMinY && y < vMaxY) return { x, y };
  return null;
}

function collectIntersections(a: Pt[], b: Pt[]): Pt[] {
  const hits: Pt[] = [];

  for (let i = 0; i < a.length - 1; i++) {
    const a1 = a[i], a2 = a[i + 1];
    const aH = Math.abs(a1.y - a2.y) < 0.5;
    const aV = Math.abs(a1.x - a2.x) < 0.5;

    for (let j = 0; j < b.length - 1; j++) {
      const b1 = b[j], b2 = b[j + 1];
      const bH = Math.abs(b1.y - b2.y) < 0.5;
      const bV = Math.abs(b1.x - b2.x) < 0.5;

      let hit: Pt | null = null;

      if (aH && bV) hit = segIntersects(a1, a2, b1, b2);
      else if (aV && bH) hit = segIntersects(b1, b2, a1, a2);

      if (hit) hits.push(hit);
    }
  }

  return hits;
}

function samePoint(p: Pt, q: Pt, eps = 1): boolean {
  return Math.abs(p.x - q.x) <= eps && Math.abs(p.y - q.y) <= eps;
}

function buildPathWithGaps(pts: Pt[], gaps: Pt[], gapSize = 10): string {
  if (pts.length < 2) return "";

  const half = gapSize / 2;
  const parts: string[] = [];

  // Build per segment; if segment contains a gap, split it into two subsegments
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];

    const isH = Math.abs(a.y - b.y) < 0.5;
    const isV = Math.abs(a.x - b.x) < 0.5;

    const segGaps = gaps.filter((g) => {
      if (isH && Math.abs(g.y - a.y) < 0.5) {
        return g.x > Math.min(a.x, b.x) + 1 && g.x < Math.max(a.x, b.x) - 1;
      }
      if (isV && Math.abs(g.x - a.x) < 0.5) {
        return g.y > Math.min(a.y, b.y) + 1 && g.y < Math.max(a.y, b.y) - 1;
      }
      return false;
    });

    if (segGaps.length === 0) {
      // Normal segment
      if (parts.length === 0) parts.push(`M ${a.x} ${a.y}`);
      else parts.push(`L ${a.x} ${a.y}`);
      parts.push(`L ${b.x} ${b.y}`);
      continue;
    }

    // Sort gaps along the segment
    segGaps.sort((g1, g2) => (isH ? g1.x - g2.x : g1.y - g2.y));

    // Start at a
    if (parts.length === 0) parts.push(`M ${a.x} ${a.y}`);
    else parts.push(`M ${a.x} ${a.y}`);

    let cur = a;

    for (const g of segGaps) {
      const before: Pt = isH ? { x: g.x - half, y: a.y } : { x: a.x, y: g.y - half };
      const after: Pt = isH ? { x: g.x + half, y: a.y } : { x: a.x, y: g.y + half };

      // draw to before-gap
      parts.push(`L ${before.x} ${before.y}`);

      // jump over the gap: move to after-gap
      parts.push(`M ${after.x} ${after.y}`);

      cur = after;
    }

    // finish to b
    parts.push(`L ${b.x} ${b.y}`);
  }

  return parts.join(" ");
}

export function BusbarEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, style, markerEnd, data } = props;

  // All edges in store (for intersection detection)
  const allEdges = useStore((s: any) => s.edges) as Edge[];
  const nodeInternals = useStore((s: any) => s.nodeInternals);

  // This edge's points
  const selfPts: Pt[] = useMemo(() => {
    const fixed = (data as any)?.points as Pt[] | undefined;
    if (fixed && fixed.length >= 2) return fixed;
    return busbarPolyline({ x: sourceX, y: sourceY }, { x: targetX, y: targetY });
  }, [data, sourceX, sourceY, targetX, targetY]);

  // Build other busbar polylines from their stored points if available, otherwise approximate from their endpoints
  const intersections: Pt[] = useMemo(() => {
    // Under/over rule: only the "under" edge gets a gap.
    // Stable tie-break: lexicographically larger id yields (gets the gap).
    const under = (otherId: string) => id > otherId;

    const hits: Pt[] = [];

    for (const e of allEdges) {
      if (!isBusbar(e) || e.id === id) continue;
      if (!under(e.id)) continue;

      const otherPts: Pt[] =
        ((e.data as any)?.points as Pt[] | undefined) ??
        (() => {
          // Try to approximate using node handle centers from nodeInternals
          const sn = nodeInternals?.get?.(e.source);
          const tn = nodeInternals?.get?.(e.target);
          if (!sn || !tn) return null;

          const sAbs = sn.positionAbsolute ?? sn.position;
          const tAbs = tn.positionAbsolute ?? tn.position;

          // fallback to node centers
          const sPt = { x: sAbs.x + (sn.width ?? 0) / 2, y: sAbs.y + (sn.height ?? 0) / 2 };
          const tPt = { x: tAbs.x + (tn.width ?? 0) / 2, y: tAbs.y + (tn.height ?? 0) / 2 };
          return busbarPolyline(sPt, tPt);
        })();

      if (!otherPts) continue;

      const raw = collectIntersections(selfPts, otherPts);

      // Ignore intersections that are essentially endpoints (junctions/tees)
      for (const p of raw) {
        const nearEndpoint =
          samePoint(p, selfPts[0]) ||
          samePoint(p, selfPts[selfPts.length - 1]) ||
          samePoint(p, otherPts[0]) ||
          samePoint(p, otherPts[otherPts.length - 1]);

        if (!nearEndpoint) hits.push(p);
      }
    }

    return hits;
  }, [allEdges, id, nodeInternals, selfPts]);

  const d = useMemo(() => {
    if (!intersections.length) {
      return selfPts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
    }
    return buildPathWithGaps(selfPts, intersections, 10);
  }, [intersections, selfPts]);

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
