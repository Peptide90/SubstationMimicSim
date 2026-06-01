import type { DrawingDocument, FaultMetadata, FaultType, Phase, Point } from '../drawing/model';

const phasesAll = ['A', 'B', 'C'] as Phase[];

export function createFault(
  targetObjectId: string,
  type: FaultType = 'phase-to-earth',
  location?: Point,
  options?: { transient?: boolean }
): FaultMetadata {
  const now = new Date().toISOString();
  const transient = options?.transient ?? type === 'transient';
  const phases = phasesForFault(type);
  const displayType = type === 'transient' || type === 'persistent' ? 'phase-to-earth' : type;
  return {
    id: `fault-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    targetObjectId,
    targetPhase: phases.length === 1 ? phases[0] : undefined,
    location,
    phases,
    type: displayType,
    persistent: !transient,
    durationMs: transient ? 1000 : undefined,
    resistanceOhms: type === 'high-impedance' ? 10 : 0,
    active: true,
    label: faultDisplayLabel(displayType, transient),
    createdAt: now
  };
}

function faultDisplayLabel(type: FaultType, transient: boolean): string {
  const base = type.replaceAll('-', ' ');
  return transient ? `${base} (transient)` : `${base} (persistent)`;
}

function phasesForFault(type: FaultType): Phase[] {
  if (type === 'A-E') return ['A'];
  if (type === 'B-E') return ['B'];
  if (type === 'C-E') return ['C'];
  if (type === 'A-B') return ['A', 'B'];
  if (type === 'B-C') return ['B', 'C'];
  if (type === 'C-A') return ['C', 'A'];
  if (type === 'phase-to-phase') return ['A', 'B'];
  return phasesAll;
}

export function addFault(doc: DrawingDocument, fault: FaultMetadata): DrawingDocument {
  return {
    ...doc,
    faults: [...doc.faults, fault],
    operationEvents: [
      ...doc.operationEvents,
      { id: `event-${Date.now()}`, timestamp: new Date().toISOString(), message: `Fault applied: ${fault.label ?? fault.type}`, targetObjectId: fault.targetObjectId }
    ]
  };
}

export function clearFault(doc: DrawingDocument, faultId: string, reason = 'Fault cleared'): DrawingDocument {
  const fault = doc.faults.find((item) => item.id === faultId);
  return {
    ...doc,
    faults: doc.faults.map((item) => item.id === faultId ? { ...item, active: false } : item),
    operationEvents: [
      ...doc.operationEvents,
      { id: `event-${Date.now()}`, timestamp: new Date().toISOString(), message: reason, targetObjectId: fault?.targetObjectId }
    ]
  };
}

export function expireTransientFaults(doc: DrawingDocument, now = Date.now()): DrawingDocument {
  let next = doc;
  doc.faults.forEach((fault) => {
    if (!fault.active || fault.persistent || !fault.durationMs) return;
    const created = Date.parse(fault.createdAt);
    if (Number.isFinite(created) && now - created >= fault.durationMs) {
      next = clearFault(next, fault.id, `Transient fault expired: ${fault.label ?? fault.type}`);
    }
  });
  return next;
}
