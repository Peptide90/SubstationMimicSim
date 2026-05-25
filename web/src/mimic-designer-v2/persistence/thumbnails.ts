import type { DrawingDocument, Point } from '../drawing/model';

const emptyPreview = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="120"><rect width="220" height="120" fill="%23f8fafc"/><path d="M20 60 H200" stroke="%2394a3b8" stroke-width="5"/></svg>';

export function createDrawingThumbnail(doc: DrawingDocument): string {
  const points = [
    ...doc.objects.symbols.map((symbol) => symbol.position),
    ...doc.objects.conductors.flatMap((path) => path.vertices),
    ...doc.objects.busbars.flatMap((path) => path.vertices)
  ];
  if (!points.length) return emptyPreview;

  const bounds = drawingBounds(points);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(180 / width, 82 / height, 1.8);
  const tx = 110 - ((bounds.minX + bounds.maxX) / 2) * scale;
  const ty = 60 - ((bounds.minY + bounds.maxY) / 2) * scale;
  const transformPoint = (point: Point) => `${Math.round(point.x * scale + tx)},${Math.round(point.y * scale + ty)}`;
  const busbars = doc.objects.busbars.map((path) => `<polyline points="${path.vertices.map(transformPoint).join(' ')}" fill="none" stroke="%231e293b" stroke-width="5" stroke-linecap="square"/>`).join('');
  const conductors = doc.objects.conductors.map((path) => `<polyline points="${path.vertices.map(transformPoint).join(' ')}" fill="none" stroke="%230ea5e9" stroke-width="2" stroke-dasharray="7 4"/>`).join('');
  const symbols = doc.objects.symbols.map((symbol) => {
    const [cx, cy] = transformPoint(symbol.position).split(',');
    return `<rect x="${Number(cx) - 6}" y="${Number(cy) - 5}" width="12" height="10" rx="2" fill="%23ffffff" stroke="%230f172a" stroke-width="1.5"/>`;
  }).join('');
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="120"><rect width="220" height="120" fill="%23f8fafc"/><g>${busbars}${conductors}${symbols}</g></svg>`;
}

function drawingBounds(points: Point[]) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}
