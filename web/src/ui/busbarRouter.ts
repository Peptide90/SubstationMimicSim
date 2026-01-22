export type Pt = { x: number; y: number };

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export function busbarPolyline(source: Pt, target: Pt): Pt[] {
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  // If nearly aligned, draw straight from handle to handle (keep endpoints exact).
  if (Math.abs(dy) <= GRID / 2 || Math.abs(dx) <= GRID / 2) return [source, target];

  const minBend = 10;
  let midX = source.x + dx / 2;

  // Enforce minimum bend length so we don't get micro segments
  if (Math.abs(midX - source.x) < minBend) midX = source.x + (dx >= 0 ? minBend : -minBend);
  if (Math.abs(target.x - midX) < minBend) midX = target.x - (dx >= 0 ? minBend : -minBend);

  // Snap intermediate point(s) only (keep endpoints exact to handle centres)
  midX = snap(midX);
  const y1 = snap(source.y);
  const y2 = snap(target.y);

  return [
    source,
    { x: midX, y: y1 },
    { x: midX, y: y2 },
    target,
  ];
}
