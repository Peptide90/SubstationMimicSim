export type Pt = { x: number; y: number };

export function busbarPolyline(source: Pt, target: Pt): Pt[] {
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  // Straight if almost aligned
  if (Math.abs(dy) < 1 || Math.abs(dx) < 1) return [source, target];

  // Same midX strategy as BusbarEdge
  const minBend = 10;
  let midX = source.x + dx / 2;

  if (Math.abs(midX - source.x) < minBend) midX = source.x + (dx >= 0 ? minBend : -minBend);
  if (Math.abs(target.x - midX) < minBend) midX = target.x - (dx >= 0 ? minBend : -minBend);

  return [
    source,
    { x: midX, y: source.y },
    { x: midX, y: target.y },
    target,
  ];
}
