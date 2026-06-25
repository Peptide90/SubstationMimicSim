import type { DrawingDocument, Point } from '../drawing/model';
import type { AnimationSequence } from '../animation/sequence';
import { totalDuration } from '../animation/sequence';
import { extractTopology } from '../topology/extractTopology';
import { deriveOperationState } from '../topology/operation';
import { resolveDisplayScale, scaledSize, type DisplayScale } from './displayMetrics';
import { busbarJoinMarkers } from './busbarJoinMarkers';
import { exportLineStateForPath } from './exportLineState';
import { EXPORT_FONT_FAMILY, exportLineStroke, exportThemeColors } from './exportTheme';
import { renderBusbarsForView, renderConductorsForView, renderSymbolsForView } from './phaseExpansion';
import { symbolGlyphSvg, symbolLabelsSvgLocal } from './symbolGlyphs';

export type DrawingExportFormat = 'svg' | '1920x1080' | '2560x1440' | '3840x2160';
export type DrawingExportLabelMode = 'all' | 'selected' | 'none';

export interface DrawingExportOptions {
  theme?: 'light' | 'dark';
  includeOperationState?: boolean;
  labelMode?: DrawingExportLabelMode;
  selectedObjectIds?: string[];
  displayScale?: DisplayScale;
  animateEnergization?: boolean;
}

const exportSizes: Record<Exclude<DrawingExportFormat, 'svg'>, { width: number; height: number }> = {
  '1920x1080': { width: 1920, height: 1080 },
  '2560x1440': { width: 2560, height: 1440 },
  '3840x2160': { width: 3840, height: 2160 }
};

function drawingBounds(doc: DrawingDocument, padding = 80) {
  const renderedSymbols = renderSymbolsForView(doc);
  const renderedConductors = renderConductorsForView(doc);
  const renderedBusbars = renderBusbarsForView(doc);
  const points: Point[] = [
    ...renderedSymbols.map((instance) => instance.position),
    ...renderedConductors.flatMap((path) => path.vertices),
    ...renderedBusbars.flatMap((path) => path.vertices),
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

function shouldLabelSymbol(canonicalId: string, labelMode: DrawingExportLabelMode, selectedObjectIds: Set<string>): boolean {
  if (labelMode === 'none') return false;
  if (labelMode === 'selected') return selectedObjectIds.has(canonicalId);
  return true;
}

function energizationAnimation(state: 'live' | 'earth', duration = 2): string {
  if (state === 'earth') return '';
  return `<animate attributeName="stroke-dashoffset" values="36;0" dur="${duration}s" repeatCount="indefinite"/>`;
}

function busbarSvg(
  instance: ReturnType<typeof renderBusbarsForView>[number],
  colors: ReturnType<typeof exportThemeColors>,
  display: DisplayScale,
  operateState: ReturnType<typeof deriveOperationState>,
  topology: ReturnType<typeof extractTopology>,
  animateEnergization: boolean
): string {
  const strokeWidth = scaledSize(instance.path.width || 7, display.busbar);
  const state = exportLineStateForPath(instance.canonicalId, topology, operateState);
  const stroke = exportLineStroke(colors, state, colors.busbar);
  const dash = state === 'live' && animateEnergization ? ' stroke-dasharray="24 12"' : '';
  const animation = state === 'live' && animateEnergization ? energizationAnimation('live') : '';
  return `<polyline points="${polyline(instance.vertices)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="square" stroke-linejoin="round"${dash}>${animation}</polyline>`;
}

function conductorSvg(
  instance: ReturnType<typeof renderConductorsForView>[number],
  colors: ReturnType<typeof exportThemeColors>,
  operateState: ReturnType<typeof deriveOperationState>,
  topology: ReturnType<typeof extractTopology>,
  animateEnergization: boolean
): string {
  const state = exportLineStateForPath(instance.canonicalId, topology, operateState);
  const stroke = exportLineStroke(colors, state, colors.cable);
  const dashStyle = instance.path.conductorStyle === 'overhead-line' ? '0' : '18 10';
  const energizeDash = state === 'live' && animateEnergization ? '24 12' : dashStyle;
  const animation = state === 'live' && animateEnergization ? energizationAnimation('live', 2.5) : '';
  return `<polyline points="${polyline(instance.vertices)}" fill="none" stroke="${stroke}" stroke-width="3" stroke-dasharray="${energizeDash}" stroke-linecap="round">${animation}</polyline>`;
}

export function buildDrawingExportSvg(doc: DrawingDocument, options: DrawingExportOptions = {}): string {
  const theme = options.theme ?? 'light';
  const includeOperationState = options.includeOperationState ?? true;
  const labelMode = options.labelMode ?? 'all';
  const selectedObjectIds = new Set(options.selectedObjectIds ?? []);
  const display = options.displayScale ?? resolveDisplayScale(doc.uiState);
  const animateEnergization = options.animateEnergization ?? false;
  const colors = exportThemeColors(theme);
  const topology = extractTopology(doc);
  const operateState = deriveOperationState(doc, topology);
  const bounds = drawingBounds(doc);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const joinMarkers = busbarJoinMarkers(topology)
    .map((point) => `<circle cx="${point.x}" cy="${point.y}" r="${Math.max(3, scaledSize(2.75, display.busbar))}" fill="${colors.busbar}" stroke="${colors.background}" stroke-width="${Math.max(1, scaledSize(0.9, display.busbar))}"/>`)
    .join('');

  const busbars = renderBusbarsForView(doc).map((instance) =>
    busbarSvg(instance, colors, display, operateState, topology, animateEnergization)
  ).join('');

  const conductors = renderConductorsForView(doc).map((instance) =>
    conductorSvg(instance, colors, operateState, topology, animateEnergization)
  ).join('');

  const symbols = renderSymbolsForView(doc).map((instance) => {
    const labels = shouldLabelSymbol(instance.canonicalId, labelMode, selectedObjectIds)
      ? symbolLabelsSvgLocal(instance.symbol, display, { textFill: colors.text, includeOperation: includeOperationState })
      : '';
    const glyph = symbolGlyphSvg(instance.symbol, display.symbol);
    return `<g transform="translate(${instance.position.x},${instance.position.y}) rotate(${instance.symbol.rotation})">${glyph}${labels}</g>`;
  }).join('');

  const labels = labelMode === 'all'
    ? doc.objects.labels.map((label) => `<text x="${label.position.x}" y="${label.position.y}" font-size="${scaledSize(11, display.text)}" font-weight="700" font-family="${EXPORT_FONT_FAMILY}" fill="${colors.text}">${label.text.replaceAll('&', '&amp;')}</text>`).join('')
    : labelMode === 'selected'
      ? doc.objects.labels
        .filter((label) => !label.forObjectId || selectedObjectIds.has(label.forObjectId))
        .map((label) => `<text x="${label.position.x}" y="${label.position.y}" font-size="${scaledSize(11, display.text)}" font-weight="700" font-family="${EXPORT_FONT_FAMILY}" fill="${colors.text}">${label.text.replaceAll('&', '&amp;')}</text>`).join('')
      : '';

  const annotations = labelMode === 'none' ? '' : doc.objects.annotations.map((annotation) =>
    `<text x="${annotation.position.x}" y="${annotation.position.y}" font-size="${scaledSize(10, display.text)}" font-family="${EXPORT_FONT_FAMILY}" fill="${colors.mutedText}">${annotation.text.replaceAll('&', '&amp;')}</text>`
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}" width="${Math.round(width)}" height="${Math.round(height)}">
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" fill="${colors.background}"/>
  <g font-family="${EXPORT_FONT_FAMILY}">${busbars}${joinMarkers}${conductors}${symbols}${labels}${annotations}</g>
</svg>`;
}

export function buildAnimatedSequenceExportSvg(
  doc: DrawingDocument,
  sequence: AnimationSequence,
  options: DrawingExportOptions = {}
): string {
  const duration = totalDuration(sequence);
  const theme = options.theme ?? (sequence.settings.theme === 'current' ? 'light' : sequence.settings.theme);
  const base = buildDrawingExportSvg(doc, {
    ...options,
    theme,
    animateEnergization: sequence.settings.trimLineEnergisation
  });
  const bounds = drawingBounds(doc);
  const captionY = bounds.maxY - 24;
  let elapsed = 0;
  const captions = sequence.settings.showEventCaptions
    ? sequence.steps.filter((step) => step.enabled).map((step) => {
        const caption = `<text x="${bounds.minX + 24}" y="${captionY}" font-size="14" font-family="${EXPORT_FONT_FAMILY}" fill="${exportThemeColors(theme).text}"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.9;1" dur="${step.eventDurationSeconds}s" begin="${elapsed}s" fill="freeze"/>${step.name.replaceAll('&', '&amp;')}</text>`;
        elapsed += step.eventDurationSeconds + step.delayAfterSeconds;
        return caption;
      }).join('')
    : '';
  const comment = `<!-- Animated Sequence: ${sequence.name}; duration: ${duration}s -->`;
  return base.replace('<?xml version="1.0" encoding="UTF-8"?>', `<?xml version="1.0" encoding="UTF-8"?>\n${comment}`).replace('</svg>', `${captions}</svg>`);
}

export async function rasterizeDrawingExport(
  doc: DrawingDocument,
  format: Exclude<DrawingExportFormat, 'svg'>,
  options: DrawingExportOptions = {}
): Promise<Blob> {
  const svg = buildDrawingExportSvg(doc, options);
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
  context.fillStyle = options.theme === 'dark' ? '#0f172a' : '#ffffff';
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

export function downloadDrawingExport(
  doc: DrawingDocument,
  format: DrawingExportFormat,
  options: DrawingExportOptions = {}
): Promise<void> {
  const safeName = doc.name.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'mimic-drawing';
  if (format === 'svg') {
    const svg = buildDrawingExportSvg(doc, { ...options, animateEnergization: options.animateEnergization ?? true });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    triggerDownload(blob, `${safeName}.svg`);
    return Promise.resolve();
  }

  return rasterizeDrawingExport(doc, format, options).then((blob) => triggerDownload(blob, `${safeName}-${format}.png`));
}

export function downloadAnimatedSequenceExport(
  doc: DrawingDocument,
  sequence: AnimationSequence,
  options: DrawingExportOptions = {}
): void {
  const safeName = doc.name.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'mimic-drawing';
  const svg = buildAnimatedSequenceExportSvg(doc, sequence, options);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  triggerDownload(blob, `${safeName}-animated.svg`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
