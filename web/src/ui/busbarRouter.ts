export type Pt = { x: number; y: number };

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export function busbarPolyline(source: Pt, target: Pt): Pt[] {
  const s = { x: snap(source.x), y: snap(source.y) };
  const t = { x: snap(target.x), y: snap(target.y) };
  const dx = t.x - s.x;
  const dy = t.y - s.y;

  if (dx === 0 || dy === 0) return [s, t];

  const minBend = 10;
  let midX = s.x + dx / 2;

  if (Math.abs(midX - s.x) < minBend) midX = s.x + (dx >= 0 ? minBend : -minBend);
  if (Math.abs(t.x - midX) < minBend) midX = t.x - (dx >= 0 ? minBend : -minBend);

  midX = snap(midX);
  const y1 = s.y;
  const y2 = t.y;

  return [
    s,
    { x: midX, y: y1 },
    { x: midX, y: y2 },
    t,
  ];
}
