import type { DrawingDocument, ElectricalSymbol, IsolationKind, OperationEvent } from '../drawing/model';

/**
 * Points of isolation and points of earthing.
 *
 * A point of isolation locks an open breaker or disconnector open and carries a
 * caution notice; a point of earthing locks a closed earth switch closed. While
 * either is applied the device refuses to operate. That refusal is the lesson:
 * the lock exists so that nobody can re-energise, or un-earth, equipment someone
 * else is relying on.
 */

export const isolationLabels: Record<IsolationKind, string> = {
  'point-of-isolation': 'Point of isolation (locked open, caution notice)',
  'point-of-earthing': 'Point of earthing (locked closed)'
};

export type IsolationCheck = { ok: true } | { ok: false; reason: string };

const nameOf = (symbol: ElectricalSymbol) => symbol.label?.text?.trim() || symbol.id;

/** Which kind of tag this device can carry at all, regardless of its present state. */
export function isolationKindFor(symbol: ElectricalSymbol): IsolationKind | undefined {
  if (symbol.type === 'circuit-breaker' || symbol.type === 'disconnector') return 'point-of-isolation';
  if (symbol.type === 'earth-switch') return 'point-of-earthing';
  return undefined;
}

export function canApplyIsolation(symbol: ElectricalSymbol, kind: IsolationKind): IsolationCheck {
  const name = nameOf(symbol);
  if (symbol.operation?.isolation) return { ok: false, reason: `${name} already carries a ${symbol.operation.isolation.kind.replace(/-/g, ' ')}.` };
  if (isolationKindFor(symbol) !== kind) {
    return {
      ok: false,
      reason: kind === 'point-of-isolation'
        ? `Only breakers and disconnectors can be a point of isolation; ${name} is a ${symbol.type.replace(/-/g, ' ')}.`
        : `Only earth switches can be a point of earthing; ${name} is a ${symbol.type.replace(/-/g, ' ')}.`
    };
  }
  if (kind === 'point-of-isolation' && symbol.operation?.switchState !== 'open') {
    return { ok: false, reason: `${name} is closed. Open it before locking it as a point of isolation.` };
  }
  if (kind === 'point-of-earthing' && symbol.operation?.switchState !== 'closed') {
    return { ok: false, reason: `${name} is open. Close the earth before locking it as a point of earthing.` };
  }
  return { ok: true };
}

/** A tagged device refuses every operation until the tag is removed. */
export function isolationBlocksOperation(symbol: ElectricalSymbol): string | undefined {
  const tag = symbol.operation?.isolation;
  if (!tag) return undefined;
  return tag.kind === 'point-of-isolation'
    ? `${nameOf(symbol)} is locked open as a point of isolation. Remove the lock before closing it.`
    : `${nameOf(symbol)} is locked closed as a point of earthing. Remove the lock before opening it.`;
}

export interface IsolationResult {
  doc: DrawingDocument;
  ok: boolean;
  reason: string;
}

export function applyIsolation(doc: DrawingDocument, symbolId: string, kind: IsolationKind, now = Date.now()): IsolationResult {
  const symbol = doc.objects.symbols.find((item) => item.id === symbolId);
  if (!symbol) return { doc, ok: false, reason: `No device ${symbolId}` };
  const check = canApplyIsolation(symbol, kind);
  if (!check.ok) return { doc: logEvent(doc, check.reason, symbolId, now, 'warning'), ok: false, reason: check.reason };
  const reason = kind === 'point-of-isolation'
    ? `${nameOf(symbol)} locked open and caution notice applied`
    : `${nameOf(symbol)} locked closed as a point of earthing`;
  const tagged = patchOperation(doc, symbolId, { isolation: { kind, appliedAt: new Date(now).toISOString() } });
  return { doc: logEvent(tagged, reason, symbolId, now, 'operation'), ok: true, reason };
}

export function removeIsolation(doc: DrawingDocument, symbolId: string, now = Date.now()): IsolationResult {
  const symbol = doc.objects.symbols.find((item) => item.id === symbolId);
  if (!symbol) return { doc, ok: false, reason: `No device ${symbolId}` };
  if (!symbol.operation?.isolation) {
    const reason = `${nameOf(symbol)} has no lock to remove.`;
    return { doc, ok: false, reason };
  }
  const reason = symbol.operation.isolation.kind === 'point-of-isolation'
    ? `${nameOf(symbol)} lock and caution notice removed`
    : `${nameOf(symbol)} point of earthing lock removed`;
  const cleared = patchOperation(doc, symbolId, { isolation: undefined });
  return { doc: logEvent(cleared, reason, symbolId, now, 'operation'), ok: true, reason };
}

export function taggedSymbols(doc: DrawingDocument, kind?: IsolationKind): ElectricalSymbol[] {
  return doc.objects.symbols.filter((symbol) => symbol.operation?.isolation && (!kind || symbol.operation.isolation.kind === kind));
}

function patchOperation(doc: DrawingDocument, symbolId: string, patch: NonNullable<ElectricalSymbol['operation']>): DrawingDocument {
  return {
    ...doc,
    objects: {
      ...doc.objects,
      symbols: doc.objects.symbols.map((symbol) => symbol.id === symbolId ? { ...symbol, operation: { ...symbol.operation, ...patch } } : symbol)
    }
  };
}

function logEvent(doc: DrawingDocument, message: string, targetObjectId: string, now: number, severity: OperationEvent['severity']): DrawingDocument {
  return {
    ...doc,
    operationEvents: [
      ...doc.operationEvents,
      { id: `event-${now}-${Math.floor(Math.random() * 9999)}`, timestamp: new Date(now).toISOString(), message, targetObjectId, severity }
    ]
  };
}
