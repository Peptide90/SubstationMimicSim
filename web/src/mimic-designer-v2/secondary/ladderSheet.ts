import type { BreakerCommand, ContactSource, ControlLocation, DrawingDocument, LearningTier } from '../drawing/model';
import { isTierAtLeast } from '../learning/tiers';
import { deviceLabel, type CircuitRole, type SecondaryConvention } from './conventions';
import { circuitsFor, evaluateCircuit, GENERIC_SCHEME_NOTE, resolveSecondary } from './ladder';

/**
 * A trip and close sheet for one breaker, generated from the evaluated
 * circuits. Every element on it is evaluated by secondary/ladder.ts, so the
 * sheet shows exactly what decides whether a coil energises — and nothing
 * else.
 */

/** What clicking an element does, if anything. */
export type ElementAction =
  | { kind: 'toggle-local-remote'; switchId: string }
  | { kind: 'command'; breakerId: string; command: BreakerCommand; location: ControlLocation };

export interface SheetElement {
  id: string;
  role: CircuitRole;
  code?: string;
  name: string;
  /** What this particular contact is, e.g. which relay. */
  detail?: string;
  /** Drawn normally open or normally closed. */
  normally: 'open' | 'closed';
  conducts: boolean;
  /** Current reaches this element: supplied and every contact before it conducts. */
  live: boolean;
  action?: ElementAction;
}

export interface SheetRung {
  id: string;
  elements: SheetElement[];
  coil: { role: 'trip-coil' | 'close-coil'; code?: string; name: string; energised: boolean };
  energised: boolean;
}

export interface SheetCircuit {
  id: string;
  name: string;
  kind: 'trip' | 'close';
  supplied: boolean;
  deadBecause?: 'supply' | 'mcb';
  supply: { id: string; code?: string; name: string; detail: string; healthy: boolean };
  mcb: { id: string; code?: string; name: string; detail: string; closed: boolean };
  rungs: SheetRung[];
}

export interface LadderSheet {
  breakerId: string;
  breakerName: string;
  convention: SecondaryConvention;
  circuits: SheetCircuit[];
  localRemote?: { id: string; position: ControlLocation };
  notes: string[];
}

function roleFor(source: ContactSource): { role: CircuitRole; normally: 'open' | 'closed' } {
  switch (source.kind) {
    case 'plant-aux': return source.contact === 'a' ? { role: 'aux-a', normally: 'open' } : { role: 'aux-b', normally: 'closed' };
    case 'relay-trip': return { role: 'relay-trip-contact', normally: 'open' };
    case 'command': return { role: source.location === 'remote' ? 'remote-control' : 'local-control', normally: 'open' };
    case 'local-remote': return { role: 'local-remote', normally: 'open' };
    case 'lockout': return { role: 'lockout-contact', normally: 'closed' };
  }
}

export function buildLadderSheet(doc: DrawingDocument, breakerId: string, tier: LearningTier = 'Apprentice', convention: SecondaryConvention = 'plain'): LadderSheet | undefined {
  const breaker = doc.objects.symbols.find((symbol) => symbol.id === breakerId && symbol.type === 'circuit-breaker');
  if (!breaker) return undefined;
  const model = resolveSecondary(doc);
  const breakerName = breaker.label?.text?.trim() || breaker.id;
  const relayName = (id: string) => doc.relays.find((relay) => relay.id === id)?.name ?? id;
  const showDetail = isTierAtLeast(tier, 'Student');
  const label = (role: CircuitRole) => deviceLabel(role, convention);

  const detailFor = (source: ContactSource): string | undefined => {
    if (!showDetail) return undefined;
    switch (source.kind) {
      case 'plant-aux': return breakerName;
      case 'relay-trip': return source.path === 'backup' ? `${relayName(source.relayId)} (breaker fail)` : relayName(source.relayId);
      case 'command': return `${source.command} ${source.location === 'remote' ? 'from control room' : 'at the panel'}`;
      case 'local-remote': return `closed at ${source.position === 'remote' ? 'Remote' : 'Local'}`;
      case 'lockout': return breakerName;
    }
  };

  const actionFor = (source: ContactSource): ElementAction | undefined => {
    if (source.kind === 'local-remote') return { kind: 'toggle-local-remote', switchId: source.switchId };
    if (source.kind === 'command') return { kind: 'command', breakerId, command: source.command, location: source.location };
    return undefined;
  };

  const circuits = (['trip', 'close'] as const).flatMap((kind) => circuitsFor(model, breakerId, kind)).map((circuit): SheetCircuit => {
    const evaluation = evaluateCircuit(doc, circuit, {}, model);
    const rungs = evaluation.rungs.map((rung, index): SheetRung => {
      let live = evaluation.supplied;
      const elements = rung.contacts.map((contact): SheetElement => {
        const { role, normally } = roleFor(contact.source);
        const element: SheetElement = { id: contact.id, role, ...label(role), detail: detailFor(contact.source), normally, conducts: contact.conducts, live, action: actionFor(contact.source) };
        live = live && contact.conducts;
        return element;
      });
      const coilRole = circuit.rungs[index].coil.kind;
      return { id: rung.id, elements, coil: { role: coilRole, ...label(coilRole), energised: rung.energised }, energised: rung.energised };
    });
    return {
      id: circuit.id,
      name: circuit.name,
      kind: circuit.kind,
      supplied: evaluation.supplied,
      deadBecause: evaluation.deadBecause,
      supply: { id: evaluation.supply?.id ?? '', ...label('dc-supply'), detail: evaluation.supply?.name ?? 'No supply', healthy: Boolean(evaluation.supply?.healthy) },
      mcb: { id: evaluation.mcb?.id ?? '', ...label('mcb'), detail: evaluation.mcb?.name ?? 'No MCB', closed: Boolean(evaluation.mcb?.closed) },
      rungs
    };
  });

  const lr = model.switches.find((item) => item.breakerId === breakerId);
  const notes = circuits.some((circuit) => circuit.rungs.length) && model.circuits.filter((circuit) => circuit.breakerId === breakerId).every((circuit) => circuit.generated) ? [GENERIC_SCHEME_NOTE] : [];
  if (circuits.some((circuit) => circuit.deadBecause)) notes.push('A dead circuit cannot operate the breaker — protection included. Breaker fail, where fitted, clears the fault from elsewhere.');
  return { breakerId, breakerName, convention, circuits, localRemote: lr ? { id: lr.id, position: lr.position } : undefined, notes };
}

/** Every sheet Protect can show, in order. */
export interface SheetIndexEntry {
  id: string;
  number: string;
  title: string;
  breakerId?: string;
}

export function protectSheetIndex(doc: DrawingDocument): SheetIndexEntry[] {
  const breakers = doc.objects.symbols.filter((symbol) => symbol.type === 'circuit-breaker');
  return [
    { id: 'protection-block-diagram', number: 'P-01', title: 'Protection block diagram' },
    ...breakers.map((breaker, index) => ({
      id: `trip-close:${breaker.id}`,
      number: `P-${String(index + 2).padStart(2, '0')}`,
      title: `${breaker.label?.text?.trim() || breaker.id} trip & close`,
      breakerId: breaker.id
    }))
  ];
}
