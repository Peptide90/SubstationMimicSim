import type { DrawingDocument, Point } from '../drawing/model';
import { operationLabelSvg, symbolGlyphSvg, symbolLabelSvg } from './symbolGlyphs';

export type DrawingExportFormat = 'svg' | '1920x1080' | '2560x1440' | '3840x2160';

const exportSizes: Record<Exclude<DrawingExportFormat, 'svg'>, { width: number; height: number }> = {
  '1920x1080': { width: 1920, height: 1080 },
  '2560x1440': { width: 2560, height: 1440 },
  '3840x2160': { width: 3840, height: 2160 }
};

function drawingBounds(doc: DrawingDocument, padding = 80) {
  const points: Point[] = [
    ...doc.objects.symbols.map((symbol) => symbol.position),
    ...doc.objects.conductors.flatMap((path) => path.vertices),
    ...doc.objects.busbars.flatMap((path) => path.vertices),
    ...doc.objects.labels.map((label) => label.position)
  ];
  if (!points.length) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  return {
    minX: Math.min(...points.map((point) => point.x)) - padding,
    minY: Math.min(...points.map((point) => point.y)) - padding,
    maxX: Math.max(...points.map((point) => point.x)) + padding,
    maxY: Math.max(...points.map((point) => point.y)) + padding
  };
}

function polyline(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export function buildDrawingExportSvg(doc: DrawingDocument, theme: 'light' | 'dark' = 'light', includeOperationState = true): string {
  const bounds = drawingBounds(doc);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const bg = theme === 'dark' ? '#0f172a' : '#ffffff';
  const busbarStroke = theme === 'dark' ? '#e2e8f0' : '#1e293b';
  const cableStroke = theme === 'dark' ? '#38bdf8' : '#0284c7';
  const textFill = theme === 'dark' ? '#f8fafc' : '#0f172a';

  const busbars = doc.objects.busbars.map((path) =>
    `<polyline points="${polyline(path.vertices)}" fill="none" stroke="${busbarStroke}" stroke-width="${path.width || 7}" stroke-linecap="square" stroke-linejoin="round"/>`
  ).join('');

  const conductors = doc.objects.conductors.map((path) =>
    `<polyline points="${polyline(path.vertices)}" fill="none" stroke="${cableStroke}" stroke-width="3" stroke-dasharray="${path.conductorStyle === 'overhead-line' ? '0' : '18 10'}" stroke-linecap="round"/>`
  ).join('');

  const symbols = doc.objects.symbols.map((symbol) => {
    const label = symbolLabelSvg(symbol);
    const operation = includeOperationState ? operationLabelSvg(symbol) : '';
    return `<g transform="translate(${symbol.position.x},${symbol.position.y}) rotate(${symbol.rotation})">${symbolGlyphSvg(symbol)}${label}${operation}</g>`;
  }).join('');

  const labels = doc.objects.labels.map((label) =>
    `<text x="${label.position.x}" y="${label.position.y}" font-size="11" font-weight="700" fill="${textFill}">${label.text.replaceAll('&', '&amp;')}</text>`
  ).join('');

  const annotations = doc.objects.annotations.map((annotation) =>
    `<text x="${annotation.position.x}" y="${annotation.position.y}" font-size="10" fill="${theme === 'dark' ? '#94a3b8' : '#64748b'}">${annotation.text.replaceAll('&', '&amp;')}</text>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}" width="${Math.round(width)}" height="${Math.round(height)}">
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" fill="${bg}"/>
  <g>${busbars}${conductors}${symbols}${labels}${annotations}</g>
</svg>`;
}

export async function rasterizeDrawingExport(doc: DrawingDocument, format: Exclude<DrawingExportFormat, 'svg'>, theme: 'light' | 'dark' = 'light'): Promise<Blob> {
  const svg = buildDrawingExportSvg(doc, theme);
  const { width, height } = exportSizes[format];
  const bounds = drawingBounds(doc);
  const sourceWidth = bounds.maxX - bounds.minX;
  const sourceHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const fittedWidth = sourceWidth * scale;
  const fittedHeight = sourceHeight * scale;
  const offsetX = (width - fittedWidth) / 2;
  const offsetY = (height - fittedHeight) / 2;

  const image = await loadSvgImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.fillStyle = theme === 'dark' ? '#0f172a' : '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, offsetX, offsetY, fittedWidth, fittedHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Failed to encode PNG'));
      else resolve(blob);
    }, 'image/png');
  });
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render SVG'));
    };
    image.src = url;
  });
}

export function downloadDrawingExport(doc: DrawingDocument, format: DrawingExportFormat, theme: 'light' | 'dark' = 'light'): Promise<void> {
  const safeName = doc.name.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'mimic-drawing';
  if (format === 'svg') {
    const svg = buildDrawingExportSvg(doc, theme);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    triggerDownload(blob, `${safeName}.svg`);
    return Promise.resolve();
  }

  return rasterizeDrawingExport(doc, format, theme).then((blob) => triggerDownload(blob, `${safeName}-${format}.png`));
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
