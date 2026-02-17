/**
 * Pure busbar draft logic for the busbar tool.
 * Used so we can unit-test one-point-per-click and no wrap-around edge.
 */

export type Pt = { x: number; y: number };

export function samePoint(a: Pt, b: Pt, eps = 0.5): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

export function orthogonalPoint(prev: Pt, next: Pt): Pt {
  const dx = Math.abs(next.x - prev.x);
  const dy = Math.abs(next.y - prev.y);
  if (dx >= dy) return { x: next.x, y: prev.y };
  return { x: prev.x, y: next.y };
}

/**
 * Add one point to the draft (one click). Returns new draft array.
 * - Never adds a duplicate of the last point.
 * - Never adds a point that equals the first point when draft has 2+ points (prevents loop back to start).
 */
export function addDraftPoint(prev: Pt[], snapped: Pt): Pt[] {
  if (prev.length === 0) return [snapped];
  const point = orthogonalPoint(prev[prev.length - 1], snapped);
  if (samePoint(point, prev[prev.length - 1])) return prev;
  if (prev.length >= 2 && samePoint(point, prev[0])) return prev;
  return prev.concat(point);
}

/**
 * Given N draft points, we create N junctions and N-1 edges: (0-1), (1-2), ..., (N-2 to N-1).
 * Never an edge from last to first.
 */
export function draftToEdgePairs(n: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < n - 1; i += 1) {
    pairs.push([i, i + 1]);
  }
  return pairs;
}
