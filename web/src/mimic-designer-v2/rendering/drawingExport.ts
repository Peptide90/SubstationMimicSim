import type { DrawingDocument, Point } from '../drawing/model';
import type { AnimationSequence } from '../animation/sequence';
import { buildSequenceSnapshots, sequenceExportDuration, type SequenceSnapshot } from '../animation/sequenceSimulation';
import { extractTopology } from '../topology/extractTopology';
import { deriveOperationState } from '../topology/operation';
import { resolveDisplayScale, scaledSize, type DisplayScale } from './displayMetrics';
import { busbarJoinMarkers } from './busbarJoinMarkers';
import { exportLineStateForPath } from './exportLineState';
import { EXPORT_FONT_FAMILY, exportThemeColors } from './exportTheme';
import { renderBusbarsForView, renderConductorsForView, renderSymbolsForView } from './phaseExpansion';
import { buildSequenceEventLogOverlay, SEQUENCE_LOG_BAND_HEIGHT } from './sequenceEventLog';
import { symbolGlyphSvg, symbolLabelExtentWorldPoints, symbolLabelsSvgLocal } from './symbolGlyphs';
import { resolveSwitchgearVisualState } from './switchgearVisualState';

export type DrawingExportFormat = 'svg' | '1920x1080' | '2560x1440' | '3840x2160';
export type DrawingExportLabelMode = 'all' | 'selected' | 'none';

export interface DrawingExportOptions {
  theme?: 'light' | 'dark';
  includeOperationState?: boolean;
  labelMode?: DrawingExportLabelMode;
  selectedObjectIds?: string[];
  displayScale?: DisplayScale;
  /** Draw live-path highlighting as a separate overlay layer above base busbars/cables. */
  showEnergizedPaths?: boolean;
  /** Animate trim lines on the energized overlay layer only. */
  animateEnergizedPaths?: boolean;
}

const exportSizes: Record<Exclude<DrawingExportFormat, 'svg'>, { width: number; height: number }> = {
  '1920x1080': { width: 1920, height: 1080 },
  '2560x1440': { width: 2560, height: 1440 },
  '3840x2160': { width: 3840, height: 2160 }
};

export interface DrawingBoundsOptions {
  padding?: number;
  display?: DisplayScale;
  includeLabelExtents?: boolean;
  extraLeft?: number;
}

export function drawingBounds(doc: DrawingDocument, options: DrawingBoundsOptions | number = {}) {
  const opts: DrawingBoundsOptions = typeof options === 'number' ? { padding: options } : options;
  const padding = opts.padding ?? 80;
  const extraLeft = opts.extraLeft ?? 0;
  const display = opts.display ?? resolveDisplayScale(doc.uiState);
  const renderedSymbols = renderSymbolsForView(doc);
  const renderedConductors = renderConductorsForView(doc);
  const renderedBusbars = renderBusbarsForView(doc);
  const points: Point[] = [
    ...renderedSymbols.map((instance) => instance.position),
    ...renderedConductors.flatMap((path) => path.vertices),
    ...renderedBusbars.flatMap((path) => path.vertices),
    ...doc.objects.labels.map((label) => label.position)
  ];

  if (opts.includeLabelExtents) {
    renderedSymbols.forEach((instance) => {
      points.push(...symbolLabelExtentWorldPoints(instance.symbol, instance.position, display, true));
    });
  }

  if (!points.length) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  return {
    minX: Math.min(...points.map((point) => point.x)) - padding - extraLeft,
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

function energizationProgressAnimation(duration: number, beginSeconds: number): string {
  return `<animate attributeName="stroke-dashoffset" from="36" to="0" dur="${duration}s" begin="${beginSeconds}s" fill="freeze"/>`;
}

function visibilityWindow(beginSeconds: number, endSeconds: number, isFirst: boolean, isLast: boolean): string {
  const hide = isLast
    ? ''
    : `<set attributeName="opacity" to="0" begin="${endSeconds}s" fill="freeze"/>`;
  if (isFirst) {
    return hide;
  }
  return `<set attributeName="opacity" to="1" begin="${beginSeconds}s" fill="freeze"/>${hide}`;
}

function wrapTimedLayer(
  content: string,
  beginSeconds: number,
  endSeconds: number,
  isFirst: boolean,
  isLast: boolean
): string {
  if (!content) return '';
  const opacity = isFirst ? 1 : 0;
  return `<g opacity="${opacity}">${visibilityWindow(beginSeconds, endSeconds, isFirst, isLast)}${content}</g>`;
}

function livePathIds(doc: DrawingDocument, topology: ReturnType<typeof extractTopology>): Set<string> {
  const operateState = deriveOperationState(doc, topology);
  const ids = new Set<string>();
  renderBusbarsForView(doc).forEach((instance) => {
    if (exportLineStateForPath(instance.canonicalId, topology, operateState) === 'live') {
      ids.add(`bus:${instance.canonicalId}`);
    }
  });
  renderConductorsForView(doc).forEach((instance) => {
    if (exportLineStateForPath(instance.canonicalId, topology, operateState) === 'live') {
      ids.add(`con:${instance.canonicalId}`);
    }
  });
  return ids;
}

function busbarBaseSvg(
  instance: ReturnType<typeof renderBusbarsForView>[number],
  colors: ReturnType<typeof exportThemeColors>,
  display: DisplayScale,
  operateState: ReturnType<typeof deriveOperationState>,
  topology: ReturnType<typeof extractTopology>
): string {
  const strokeWidth = scaledSize(instance.path.width || 7, display.busbar);
  const state = exportLineStateForPath(instance.canonicalId, topology, operateState);
  const stroke = state === 'earth' ? colors.earth : state === 'fault' ? colors.warning : colors.busbar;
  return `<polyline points="${polyline(instance.vertices)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="square" stroke-linejoin="round"/>`;
}

function busbarEnergizedOverlaySvg(
  instance: ReturnType<typeof renderBusbarsForView>[number],
  colors: ReturnType<typeof exportThemeColors>,
  display: DisplayScale,
  mode: 'static' | 'progress',
  progressBegin = 0,
  progressDuration = 1
): string {
  const strokeWidth = scaledSize(instance.path.width || 7, display.busbar);
  if (mode === 'static') {
    return `<polyline points="${polyline(instance.vertices)}" fill="none" stroke="${colors.live}" stroke-width="${strokeWidth}" stroke-linecap="square" stroke-linejoin="round"/>`;
  }
  return `<polyline points="${polyline(instance.vertices)}" fill="none" stroke="${colors.live}" stroke-width="${strokeWidth}" stroke-linecap="square" stroke-linejoin="round" stroke-dasharray="24 12" stroke-dashoffset="36">${energizationProgressAnimation(progressDuration, progressBegin)}</polyline>`;
}

function conductorBaseSvg(
  instance: ReturnType<typeof renderConductorsForView>[number],
  colors: ReturnType<typeof exportThemeColors>,
  operateState: ReturnType<typeof deriveOperationState>,
  topology: ReturnType<typeof extractTopology>
): string {
  const state = exportLineStateForPath(instance.canonicalId, topology, operateState);
  const stroke = state === 'earth' ? colors.earth : state === 'fault' ? colors.warning : colors.cable;
  const dashStyle = instance.path.conductorStyle === 'overhead-line' ? '0' : '18 10';
  return `<polyline points="${polyline(instance.vertices)}" fill="none" stroke="${stroke}" stroke-width="3" stroke-dasharray="${dashStyle}" stroke-linecap="round"/>`;
}

function conductorEnergizedOverlaySvg(
  instance: ReturnType<typeof renderConductorsForView>[number],
  colors: ReturnType<typeof exportThemeColors>,
  mode: 'static' | 'progress',
  progressBegin = 0,
  progressDuration = 1
): string {
  const dashStyle = instance.path.conductorStyle === 'overhead-line' ? '0' : '24 12';
  if (mode === 'static') {
    return `<polyline points="${polyline(instance.vertices)}" fill="none" stroke="${colors.live}" stroke-width="3" stroke-dasharray="${dashStyle}" stroke-linecap="round"/>`;
  }
  return `<polyline points="${polyline(instance.vertices)}" fill="none" stroke="${colors.live}" stroke-width="3" stroke-dasharray="24 12" stroke-linecap="round" stroke-dashoffset="36">${energizationProgressAnimation(progressDuration, progressBegin)}</polyline>`;
}

function buildSymbolsSvg(
  doc: DrawingDocument,
  colors: ReturnType<typeof exportThemeColors>,
  display: DisplayScale,
  labelMode: DrawingExportLabelMode,
  selectedObjectIds: Set<string>,
  includeOperationState: boolean,
  highlightSymbolId?: string | null
): string {
  const topology = extractTopology(doc);
  const operateState = deriveOperationState(doc, topology);
  return renderSymbolsForView(doc).map((instance) => {
    const labels = shouldLabelSymbol(instance.canonicalId, labelMode, selectedObjectIds)
      ? symbolLabelsSvgLocal(instance.symbol, display, {
        textFill: colors.text,
        includeOperation: includeOperationState,
        highlightOutline: !!highlightSymbolId && instance.canonicalId === highlightSymbolId,
        highlightColor: colors.open
      })
      : '';
    const switchgearState = resolveSwitchgearVisualState(instance.symbol, topology, operateState);
    const glyph = symbolGlyphSvg(instance.symbol, display.symbol, switchgearState, {
      stroke: colors.symbolStroke,
      live: colors.live,
      open: colors.open,
      warning: colors.warning,
      bg: colors.symbolFill
    });
    return `<g transform="translate(${instance.position.x},${instance.position.y}) rotate(${instance.symbol.rotation})">${glyph}${labels}</g>`;
  }).join('');
}

function buildEnergizedOverlayContent(
  doc: DrawingDocument,
  previousDoc: DrawingDocument | null,
  colors: ReturnType<typeof exportThemeColors>,
  display: DisplayScale,
  animateProgress: boolean,
  progressBegin: number,
  progressDuration: number
): string {
  const topology = extractTopology(doc);
  const operateState = deriveOperationState(doc, topology);
  const previousLive = previousDoc ? livePathIds(previousDoc, topology) : new Set<string>();

  const busbars = renderBusbarsForView(doc).flatMap((instance) => {
    if (exportLineStateForPath(instance.canonicalId, topology, operateState) !== 'live') return [];
    const key = `bus:${instance.canonicalId}`;
    const isNew = animateProgress && !previousLive.has(key);
    return [busbarEnergizedOverlaySvg(
      instance,
      colors,
      display,
      isNew ? 'progress' : 'static',
      progressBegin,
      progressDuration
    )];
  }).join('');

  const conductors = renderConductorsForView(doc).flatMap((instance) => {
    if (exportLineStateForPath(instance.canonicalId, topology, operateState) !== 'live') return [];
    const key = `con:${instance.canonicalId}`;
    const isNew = animateProgress && !previousLive.has(key);
    return [conductorEnergizedOverlaySvg(
      instance,
      colors,
      isNew ? 'progress' : 'static',
      progressBegin,
      progressDuration
    )];
  }).join('');

  return `${busbars}${conductors}`;
}

function buildLabelsAndAnnotations(
  doc: DrawingDocument,
  colors: ReturnType<typeof exportThemeColors>,
  display: DisplayScale,
  labelMode: DrawingExportLabelMode,
  selectedObjectIds: Set<string>
): { labels: string; annotations: string } {
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

  return { labels, annotations };
}

function buildSequenceFrameContent(
  snapshot: SequenceSnapshot,
  sequence: AnimationSequence,
  colors: ReturnType<typeof exportThemeColors>,
  display: DisplayScale,
  labelMode: DrawingExportLabelMode,
  selectedObjectIds: Set<string>,
  includeOperationState: boolean,
  showEnergizedPaths: boolean,
  animateEnergizedPaths: boolean
): string {
  const doc = snapshot.doc;
  const topology = extractTopology(doc);
  const operateState = deriveOperationState(doc, topology);
  const enabledSteps = sequence.steps.filter((step) => step.enabled);
  const step = snapshot.stepIndex >= 0 ? enabledSteps[snapshot.stepIndex] : undefined;
  const progressDuration = step
    ? Math.min(step.eventDurationSeconds, sequence.settings.busbarEnergisationDuration)
  : sequence.settings.busbarEnergisationDuration;
  const animateProgress = animateEnergizedPaths && snapshot.stepIndex >= 0;
  const highlightSymbolId = sequence.settings.highlightOperatedLabels && step?.targetId ? step.targetId : null;

  const busbars = renderBusbarsForView(doc).map((instance) =>
    busbarBaseSvg(instance, colors, display, operateState, topology)
  ).join('');
  const conductors = renderConductorsForView(doc).map((instance) =>
    conductorBaseSvg(instance, colors, operateState, topology)
  ).join('');
  const symbols = buildSymbolsSvg(doc, colors, display, labelMode, selectedObjectIds, includeOperationState, highlightSymbolId);
  const energized = showEnergizedPaths
    ? buildEnergizedOverlayContent(
      doc,
      snapshot.previousDoc,
      colors,
      display,
      animateProgress,
      snapshot.beginSeconds,
      Math.max(0.25, progressDuration)
    )
    : '';
  return `${busbars}${conductors}${symbols}${energized}`;
}

export function buildDrawingExportSvg(doc: DrawingDocument, options: DrawingExportOptions = {}): string {
  const theme = options.theme ?? 'light';
  const includeOperationState = options.includeOperationState ?? true;
  const labelMode = options.labelMode ?? 'all';
  const selectedObjectIds = new Set(options.selectedObjectIds ?? []);
  const display = options.displayScale ?? resolveDisplayScale(doc.uiState);
  const showEnergizedPaths = options.showEnergizedPaths ?? false;
  const colors = exportThemeColors(theme);
  const topology = extractTopology(doc);
  const operateState = deriveOperationState(doc, topology);
  const bounds = drawingBounds(doc, { display, includeLabelExtents: true, padding: 80 });
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const joinMarkers = busbarJoinMarkers(topology)
    .map((point) => `<circle cx="${point.x}" cy="${point.y}" r="${Math.max(3, scaledSize(2.75, display.busbar))}" fill="${colors.busbar}" stroke="${colors.background}" stroke-width="${Math.max(1, scaledSize(0.9, display.busbar))}"/>`)
    .join('');

  const busbarsBase = renderBusbarsForView(doc).map((instance) =>
    busbarBaseSvg(instance, colors, display, operateState, topology)
  ).join('');

  const conductorsBase = renderConductorsForView(doc).map((instance) =>
    conductorBaseSvg(instance, colors, operateState, topology)
  ).join('');

  const energizedOverlay = showEnergizedPaths
    ? `<g id="energized-overlay">${buildEnergizedOverlayContent(doc, null, colors, display, false, 0, 0)}</g>`
    : '';

  const symbols = buildSymbolsSvg(doc, colors, display, labelMode, selectedObjectIds, includeOperationState, null);
  const { labels, annotations } = buildLabelsAndAnnotations(doc, colors, display, labelMode, selectedObjectIds);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}" width="${Math.round(width)}" height="${Math.round(height)}">
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" fill="${colors.background}"/>
  <g id="drawing-base" font-family="${EXPORT_FONT_FAMILY}">${busbarsBase}${joinMarkers}${conductorsBase}${symbols}${labels}${annotations}</g>
  ${energizedOverlay}
</svg>`;
}

export function buildAnimatedSequenceExportSvg(
  doc: DrawingDocument,
  sequence: AnimationSequence,
  options: DrawingExportOptions = {}
): string {
  const duration = sequenceExportDuration(sequence);
  const theme = options.theme ?? (sequence.settings.theme === 'current' ? 'light' : sequence.settings.theme);
  const includeOperationState = options.includeOperationState ?? true;
  const labelMode = options.labelMode ?? 'all';
  const selectedObjectIds = new Set(options.selectedObjectIds ?? []);
  const display = options.displayScale ?? resolveDisplayScale(doc.uiState);
  const showEnergized = sequence.settings.showEnergizedPaths ?? sequence.settings.trimLineEnergisation;
  const animateEnergized = sequence.settings.animateEnergizedPaths ?? sequence.settings.trimLineEnergisation;
  const colors = exportThemeColors(theme);
  const bounds = drawingBounds(doc, { display, includeLabelExtents: true, padding: 80, extraLeft: 28 });
  const width = bounds.maxX - bounds.minX;
  const drawingHeight = bounds.maxY - bounds.minY;
  const exportHeight = drawingHeight + SEQUENCE_LOG_BAND_HEIGHT;
  const topology = extractTopology(doc);
  const joinMarkers = busbarJoinMarkers(topology)
    .map((point) => `<circle cx="${point.x}" cy="${point.y}" r="${Math.max(3, scaledSize(2.75, display.busbar))}" fill="${colors.busbar}" stroke="${colors.background}" stroke-width="${Math.max(1, scaledSize(0.9, display.busbar))}"/>`)
    .join('');
  const { labels, annotations } = buildLabelsAndAnnotations(doc, colors, display, labelMode, selectedObjectIds);
  const snapshots = buildSequenceSnapshots(doc, sequence);
  const lastIndex = snapshots.length - 1;
  const frames = snapshots.map((snapshot, index) =>
    wrapTimedLayer(
      buildSequenceFrameContent(
        snapshot,
        sequence,
        colors,
        display,
        labelMode,
        selectedObjectIds,
        includeOperationState,
        showEnergized,
        animateEnergized
      ),
      snapshot.beginSeconds,
      snapshot.endSeconds,
      index === 0,
      index === lastIndex
    )
  ).join('');
  const eventLog = buildSequenceEventLogOverlay(sequence, bounds, theme);
  const stepCount = sequence.steps.filter((step) => step.enabled).length;
  const comment = `<!-- Animated Sequence: ${sequence.name.replaceAll('--', '—')}; duration: ${duration}s; steps: ${stepCount} -->`;

  return `<?xml version="1.0" encoding="UTF-8"?>
${comment}
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${width} ${exportHeight}" width="${Math.round(width)}" height="${Math.round(exportHeight)}">
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${exportHeight}" fill="${colors.background}"/>
  <g id="drawing-static" font-family="${EXPORT_FONT_FAMILY}">${joinMarkers}${labels}${annotations}</g>
  <g id="sequence-frames">${frames}</g>
  ${eventLog}
</svg>`;
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
    const svg = buildDrawingExportSvg(doc, options);
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
