import type { Edge as RFEdge } from 'reactflow';

export function styleEdgesByEnergization(edges: RFEdge[], energizedEdgeIds: Set<string>): RFEdge[] {
  return edges.map((e) => {
    const energized = energizedEdgeIds.has(e.id);

    return {
      ...e,
      animated: energized, // simple “flow-like” animation
      style: energized
        ? { strokeWidth: 3 } // keep it basic for now; add glow later
        : { strokeWidth: 1 },
    };
  });
}
