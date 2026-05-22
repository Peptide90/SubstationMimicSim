import type { BusbarSegment, ConductorPath, DrawingDocument, ElectricalSymbol, Point, Terminal } from '../drawing/model';
import type { ElectricalTerminal } from './types';

const EPSILON = 0.001;

export interface ConnectionPrimitive {
  id: string;
  position: Point;
  phases: string[];
  source: 'terminal' | 'conductor-point' | 'busbar-point' | 'junction';
  refId: string;
}

export const pointKey = (p: Point) => `${Math.round(p.x * 100) / 100}:${Math.round(p.y * 100) / 100}`;

export function rotatePoint(local: Point, rotation: number): Point {
  const turns = ((rotation % 360) + 360) % 360;
  if (turns === 90) return { x: -local.y, y: local.x };
  if (turns === 180) return { x: -local.x, y: -local.y };
  if (turns === 270) return { x: local.y, y: -local.x };
  return local;
}

export function resolveTerminalRole(symbolType: string, terminalName: string): ElectricalTerminal['role'] {
  if (terminalName.includes('earth')) return 'earth';
  if (terminalName === 'hv') return 'hv';
  if (terminalName === 'lv') return 'lv';
  if (symbolType === 'vt' || symbolType === 'ct') return 'measurement';
  if (symbolType.includes('bus')) return 'bus';
  return 'line';
}

export function symbolTerminalWorldPosition(symbol: ElectricalSymbol, terminal: Terminal): Point {
  const rotated = rotatePoint(terminal.offset, symbol.rotation);
  return { x: symbol.position.x + rotated.x, y: symbol.position.y + rotated.y };
}

export function extractTerminals(doc: DrawingDocument): ElectricalTerminal[] {
  return doc.objects.symbols.flatMap((symbol) =>
    symbol.terminals.map((terminal) => ({
      id: `${symbol.id}:${terminal.id}`,
      parentObjectId: symbol.id,
      name: terminal.name,
      role: resolveTerminalRole(symbol.type, terminal.name),
      localPosition: terminal.offset,
      worldPosition: symbolTerminalWorldPosition(symbol, terminal),
      allowedPhases: terminal.phaseApplicability.length ? terminal.phaseApplicability : symbol.phaseApplicability,
      connectedNodeIds: []
    }))
  );
}

export function extractPathPrimitives(path: ConductorPath | BusbarSegment, source: ConnectionPrimitive['source']): ConnectionPrimitive[] {
  return path.connectionPoints.map((cp) => ({
    id: cp.id,
    position: cp.position,
    phases: path.phaseApplicability,
    source,
    refId: path.id
  }));
}

export function closeEnough(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

export function buildConnectivityPrimitives(doc: DrawingDocument): ConnectionPrimitive[] {
  const terminalPrimitives = extractTerminals(doc).map((t) => ({ id: t.id, position: t.worldPosition, phases: t.allowedPhases, source: 'terminal' as const, refId: t.parentObjectId }));
  const conductorPrimitives = doc.objects.conductors.flatMap((c) => extractPathPrimitives(c, 'conductor-point'));
  const busbarPrimitives = doc.objects.busbars.flatMap((b) => extractPathPrimitives(b, 'busbar-point'));
  return [...terminalPrimitives, ...conductorPrimitives, ...busbarPrimitives];
}
