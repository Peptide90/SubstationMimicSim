import type { ConductorPath, ElectricalSymbol, Point } from '../drawing/model';
import { conductor, symbol } from '../templates/factory';

/**
 * Lays out a run of equipment so that every terminal genuinely meets its
 * conductor. Positions are derived from each symbol's real terminal offsets
 * rather than hand-placed, so an exercise cannot ship with a device that looks
 * connected but is not.
 *
 * Rows run left to right; columns run top to bottom (devices rotated 90°).
 * Taps (earth switches, VTs) hang off the run at a tee vertex on the conductor.
 */

type InlineType = Exclude<ElectricalSymbol['type'], 'earth-switch' | 'vt'>;

export type RunItem =
  | { kind: 'device'; id: string; type: InlineType; label: string; kv?: number; closed?: boolean }
  | { kind: 'tap'; id: string; type: 'earth-switch' | 'vt'; label: string; kv?: number; closed?: boolean; drop?: number }
  /** A bare vertex on the run that something else can tee into later. */
  | { kind: 'tee'; id: string };

export interface RunResult {
  symbols: ElectricalSymbol[];
  conductors: ConductorPath[];
  /** Named points on the run: every tee, and each device's terminals as `${id}:in` / `${id}:out`. */
  points: Record<string, Point>;
}

/** Terminal offsets along the run axis, matching templates/factory.ts terminalsFor. */
function inlineOffsets(type: InlineType): { in?: number; out?: number } {
  if (type === 'source' || type === 'grid-connection') return { out: 40 };
  if (type === 'load') return { in: -40 };
  if (type === 'transformer') return { in: -40, out: 40 };
  if (type === 'ct') return { in: -20, out: 20 };
  return { in: -40, out: 40 };
}

const SWITCHING = new Set(['circuit-breaker', 'disconnector', 'earth-switch']);

export function buildRun(
  prefix: string,
  origin: Point,
  items: RunItem[],
  options: { axis?: 'x' | 'y'; gap?: number; kv?: number; tapDrop?: number } = {}
): RunResult {
  const axis = options.axis ?? 'x';
  const gap = options.gap ?? 60;
  const tapDrop = options.tapDrop ?? 90;
  const rotation = axis === 'x' ? 0 : 90;
  const at = (along: number): Point => (axis === 'x' ? { x: along, y: origin.y } : { x: origin.x, y: along });
  const side = (point: Point, offset: number): Point => (axis === 'x' ? { x: point.x, y: point.y + offset } : { x: point.x + offset, y: point.y });
  let cursor = axis === 'x' ? origin.x : origin.y;

  const symbols: ElectricalSymbol[] = [];
  const conductors: ConductorPath[] = [];
  const points: Record<string, Point> = {};
  let lastOut: Point | undefined;
  let pending: Point[] = [];
  let kv = options.kv ?? 132;
  let n = 0;

  const close = (to: Point, voltage: number) => {
    // A run fed from elsewhere starts at its first tee rather than at a device.
    const start = lastOut ?? pending.shift();
    if (!start) return;
    conductors.push(conductor(`${prefix}-c${n++}`, [start, ...pending, to], voltage, 'overhead-line'));
    pending = [];
  };

  for (const item of items) {
    if (item.kind === 'tee') {
      cursor += gap;
      points[item.id] = at(cursor);
      pending.push(at(cursor));
      continue;
    }
    if (item.kind === 'tap') {
      cursor += gap;
      const tee = at(cursor);
      pending.push(tee);
      const end = side(tee, tapDrop);
      const voltage = item.kv ?? kv;
      // A VT's terminal sits 20px above its centre; an earth switch's at its centre.
      const position = item.type === 'vt' ? { x: end.x, y: end.y + 20 } : end;
      symbols.push(symbol(item.id, item.type, position.x, position.y, item.label, voltage, 0, SWITCHING.has(item.type) ? { operation: { switchState: item.closed ? 'closed' : 'open' } } : {}));
      conductors.push(conductor(`${item.id}-tap`, [tee, end], voltage, 'overhead-line'));
      points[item.id] = end;
      continue;
    }

    const offsets = inlineOffsets(item.type);
    const voltage = item.kv ?? kv;
    let centre: number;
    if (offsets.in === undefined) {
      centre = cursor;
    } else {
      const inAt = cursor + gap;
      centre = inAt - offsets.in;
      close(at(inAt), voltage);
      points[`${item.id}:in`] = at(inAt);
    }
    const position = at(centre);
    symbols.push(symbol(item.id, item.type, position.x, position.y, item.label, voltage, rotation, SWITCHING.has(item.type) ? { operation: { switchState: item.closed ? 'closed' : 'open' } } : {}));
    if (offsets.out !== undefined) {
      lastOut = at(centre + offsets.out);
      points[`${item.id}:out`] = lastOut;
      cursor = centre + offsets.out;
    } else {
      lastOut = undefined;
      cursor = centre;
    }
    // Later items inherit this voltage, so a run states a voltage only where it changes.
    kv = voltage;
  }
  // A run may end on a tee that something else feeds from.
  if (lastOut && pending.length) conductors.push(conductor(`${prefix}-c${n++}`, [lastOut, ...pending], kv, 'overhead-line'));
  return { symbols, conductors, points };
}

/** A conductor between two named points — for links between runs. */
export function link(id: string, from: Point, to: Point, kv = 132): ConductorPath {
  const corner = { x: to.x, y: from.y };
  const vertices = from.x === to.x || from.y === to.y ? [from, to] : [from, corner, to];
  return conductor(id, vertices, kv, 'overhead-line');
}
