import type { BusbarSegment, ConductorPath, DrawingDocument, ElectricalSymbol, Phase, Point, ViewMode } from '../drawing/model';

export interface RenderedSymbolInstance {
  id: string;
  canonicalId: string;
  symbol: ElectricalSymbol;
  phase?: Phase;
  phases: Phase[];
  position: Point;
  phaseInstance: boolean;
}

export interface RenderedPathInstance<T extends ConductorPath | BusbarSegment> {
  id: string;
  canonicalId: string;
  path: T;
  phase?: Phase;
  phases: Phase[];
  vertices: Point[];
  phaseInstance: boolean;
}

const phaseOrder = ['A', 'B', 'C'] as Phase[];

const minimumPhaseSpacingPx = 150;

export function phaseOffset(phase: Phase | undefined, spacing = minimumPhaseSpacingPx): Point {
  if (!phase) return { x: 0, y: 0 };
  const index = phaseOrder.indexOf(phase);
  if (index < 0) return { x: 0, y: 0 };
  return { x: 0, y: (index - 1) * Math.max(spacing, minimumPhaseSpacingPx) };
}

export function visiblePhases(phases: Phase[]): Phase[] {
  return phaseOrder.filter((phase) => phases.includes(phase));
}

export function renderSymbolsForView(doc: DrawingDocument): RenderedSymbolInstance[] {
  return doc.objects.symbols.flatMap((symbol) => expandSymbol(symbol, doc.activeView));
}

export function renderConductorsForView(doc: DrawingDocument): RenderedPathInstance<ConductorPath>[] {
  return doc.objects.conductors.flatMap((path) => expandPath(path, doc.activeView));
}

export function renderBusbarsForView(doc: DrawingDocument): RenderedPathInstance<BusbarSegment>[] {
  return doc.objects.busbars.flatMap((path) => expandPath(path, doc.activeView));
}

export function expandSymbol(symbol: ElectricalSymbol, view: ViewMode): RenderedSymbolInstance[] {
  const phases = visiblePhases(symbol.phaseApplicability);
  const transformerExpanded = symbol.type === 'transformer' && symbol.engineering?.transformerExpansion === 'three-phase-expanded';
  const shouldExpand = view === 'three-phase' && phases.length > 1 && (symbol.renderExpansion !== 'single-symbol' || transformerExpanded);
  if (!shouldExpand) return [{ id: symbol.id, canonicalId: symbol.id, symbol, phases: symbol.phaseApplicability, position: symbol.position, phaseInstance: false }];
  return phases.map((phase) => {
    const offset = phaseOffset(phase, symbol.phaseSpacingPx);
    return {
      id: `${symbol.id}:phase:${phase}`,
      canonicalId: symbol.id,
      symbol,
      phase,
      phases: [phase],
      position: { x: symbol.position.x + offset.x, y: symbol.position.y + offset.y },
      phaseInstance: true
    };
  });
}

export function expandPath<T extends ConductorPath | BusbarSegment>(path: T, view: ViewMode): RenderedPathInstance<T>[] {
  const phases = visiblePhases(path.phaseApplicability);
  const shouldExpand = view === 'three-phase' && phases.length > 1 && path.renderExpansion !== 'single-symbol';
  if (!shouldExpand) return [{ id: path.id, canonicalId: path.id, path, phases: path.phaseApplicability, vertices: path.vertices, phaseInstance: false }];
  return phases.map((phase) => {
    const offset = phaseOffset(phase, path.phaseSpacingPx);
    return {
      id: `${path.id}:phase:${phase}`,
      canonicalId: path.id,
      path,
      phase,
      phases: [phase],
      vertices: path.vertices.map((vertex) => ({ x: vertex.x + offset.x, y: vertex.y + offset.y })),
      phaseInstance: true
    };
  });
}
