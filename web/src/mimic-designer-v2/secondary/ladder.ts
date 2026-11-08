import type {
  BreakerCommand,
  ContactSource,
  ControlLocation,
  DcSupply,
  DrawingDocument,
  ElectricalSymbol,
  LocalRemoteSwitch,
  RelaySettings,
  Rung,
  SecondaryCircuit,
  SecondaryMcb,
  SecondaryModel
} from '../drawing/model';

/**
 * Secondary circuits as ladders: rungs of contacts between the supply rails,
 * each ending in a coil. A coil is energised when its circuit is supplied
 * (DC supply healthy and the circuit's MCB closed) and every contact on at
 * least one of its rungs conducts.
 *
 * Every breaker without a custom circuit gets the generic standard scheme
 * below. It is deliberately plain — one trip circuit, one close circuit, a
 * Local/Remote selector — and stands in until real scheme drawings replace it.
 */

export const GENERIC_SCHEME_NOTE = 'Generic standard scheme: one trip and one close circuit per breaker, with a Local/Remote selector. Not a specific utility scheme.';
export const STATION_DC_SUPPLY_ID = 'dc-110v';

/** What is happening at the instant a circuit is evaluated. */
export interface LadderContext {
  /** A momentary command being issued, if any. */
  command?: { breakerId: string; command: BreakerCommand; location: ControlLocation };
  /** Relays whose trip contacts are forced closed, to ask "would this trip work?". */
  forceRelayTrip?: string[];
  /** Treat a breaker as closed when reading its auxiliary contacts. */
  assumeClosed?: string[];
}

export interface ContactEvaluation {
  id: string;
  source: ContactSource;
  conducts: boolean;
}

export interface RungEvaluation {
  id: string;
  contacts: ContactEvaluation[];
  /** Every contact conducts. */
  continuous: boolean;
  /** Continuous and the circuit is supplied: current flows through the coil. */
  energised: boolean;
  /** The first contact holding the rung open. */
  blockingContactId?: string;
}

export interface CircuitEvaluation {
  circuit: SecondaryCircuit;
  supply?: DcSupply;
  mcb?: SecondaryMcb;
  supplied: boolean;
  /** Why the circuit is dead: the supply or the MCB. */
  deadBecause?: 'supply' | 'mcb';
  rungs: RungEvaluation[];
  coilEnergised: boolean;
}

// ---------------------------------------------------------------------------
// The generic standard scheme
// ---------------------------------------------------------------------------

const ids = {
  trip: (breakerId: string) => `${breakerId}-trip-circuit`,
  close: (breakerId: string) => `${breakerId}-close-circuit`,
  tripMcb: (breakerId: string) => `${breakerId}-trip-mcb`,
  closeMcb: (breakerId: string) => `${breakerId}-close-mcb`,
  localRemote: (breakerId: string) => `${breakerId}-lr`
};
export const secondaryIds = ids;

/** Relays whose main trip outputs open this breaker, as the protection engine applies them. */
export function relaysTripping(doc: DrawingDocument, breakerId: string): RelaySettings[] {
  return doc.relays.filter((relay) => mainTripTargets(relay).includes(breakerId));
}

export function mainTripTargets(relay: RelaySettings): string[] {
  if (relay.outputActions?.length) {
    return relay.outputActions
      .filter((output) => output.targetObjectId && (output.action === 'trip-open-breaker' || output.action === 'apply-lockout'))
      .map((output) => output.targetObjectId!);
  }
  return relay.tripTargetBreakerIds;
}

function relaysBackupTripping(doc: DrawingDocument, breakerId: string): RelaySettings[] {
  return doc.relays.filter((relay) => relay.breakerFailEnabled && relay.backupTripTargetBreakerIds.includes(breakerId));
}

const breakerName = (breaker: ElectricalSymbol) => breaker.label?.text?.trim() || breaker.id;

function generatedCircuits(doc: DrawingDocument, breaker: ElectricalSymbol): SecondaryCircuit[] {
  const cb = breaker.id;
  const lr = ids.localRemote(cb);
  const aux = (contact: 'a' | 'b'): ContactSource => ({ kind: 'plant-aux', objectId: cb, contact });
  const tripCoil = { kind: 'trip-coil' as const, objectId: cb };
  const closeCoil = { kind: 'close-coil' as const, objectId: cb };
  const relayRungs: Rung[] = [
    ...relaysTripping(doc, cb).map((relay) => ({ relay, path: 'main' as const })),
    ...relaysBackupTripping(doc, cb).map((relay) => ({ relay, path: 'backup' as const }))
  ].map(({ relay, path }) => ({
    id: `${cb}-trip-${path}-${relay.id}`,
    contacts: [
      { id: `${cb}-trip-${path}-${relay.id}-contact`, source: { kind: 'relay-trip', relayId: relay.id, path } },
      { id: `${cb}-trip-${path}-${relay.id}-52a`, source: aux('a') }
    ],
    coil: tripCoil
  }));
  const commandRung = (kind: 'trip' | 'close', location: ControlLocation): Rung => ({
    id: `${cb}-${kind}-${location}`,
    contacts: [
      { id: `${cb}-${kind}-${location}-lr`, source: { kind: 'local-remote', switchId: lr, position: location } },
      { id: `${cb}-${kind}-${location}-cmd`, source: { kind: 'command', command: kind, location } },
      ...(kind === 'close' ? [{ id: `${cb}-close-${location}-86`, source: { kind: 'lockout', objectId: cb } as ContactSource }] : []),
      { id: `${cb}-${kind}-${location}-52${kind === 'trip' ? 'a' : 'b'}`, source: aux(kind === 'trip' ? 'a' : 'b') }
    ],
    coil: kind === 'trip' ? tripCoil : closeCoil
  });
  return [
    {
      id: ids.trip(cb),
      name: `${breakerName(breaker)} trip`,
      kind: 'trip',
      breakerId: cb,
      mcbId: ids.tripMcb(cb),
      rungs: [...relayRungs, commandRung('trip', 'remote'), commandRung('trip', 'local')],
      generated: true
    },
    {
      id: ids.close(cb),
      name: `${breakerName(breaker)} close`,
      kind: 'close',
      breakerId: cb,
      mcbId: ids.closeMcb(cb),
      rungs: [commandRung('close', 'remote'), commandRung('close', 'local')],
      generated: true
    }
  ];
}

/**
 * The complete secondary model: stored devices and custom circuits, plus the
 * generic scheme for every breaker without one. Stored state (an MCB opened, a
 * selector at Local) overrides the generated defaults by id.
 */
export function resolveSecondary(doc: DrawingDocument): SecondaryModel {
  const stored = doc.secondary;
  const breakers = doc.objects.symbols.filter((symbol) => symbol.type === 'circuit-breaker');
  const breakerIds = new Set(breakers.map((breaker) => breaker.id));
  const custom = (stored?.circuits ?? []).filter((circuit) => !circuit.generated && breakerIds.has(circuit.breakerId));
  const circuits: SecondaryCircuit[] = [];
  for (const breaker of breakers) {
    const own = custom.filter((circuit) => circuit.breakerId === breaker.id);
    const generated = generatedCircuits(doc, breaker);
    for (const kind of ['trip', 'close'] as const) {
      circuits.push(...(own.some((circuit) => circuit.kind === kind) ? own.filter((circuit) => circuit.kind === kind) : generated.filter((circuit) => circuit.kind === kind)));
    }
  }

  const storedSupply = new Map((stored?.supplies ?? []).map((item) => [item.id, item]));
  const storedMcb = new Map((stored?.mcbs ?? []).map((item) => [item.id, item]));
  const storedSwitch = new Map((stored?.switches ?? []).map((item) => [item.id, item]));

  const supplies: DcSupply[] = [{ id: STATION_DC_SUPPLY_ID, name: '110 V DC station battery', voltageV: 110, healthy: true }];
  (stored?.supplies ?? []).forEach((supply) => { if (supply.id !== STATION_DC_SUPPLY_ID) supplies.push(supply); });
  const resolvedSupplies = supplies.map((supply) => ({ ...supply, ...storedSupply.get(supply.id) }));

  const mcbs = new Map<string, SecondaryMcb>();
  (stored?.mcbs ?? []).forEach((mcb) => mcbs.set(mcb.id, mcb));
  const switches = new Map<string, LocalRemoteSwitch>();
  (stored?.switches ?? []).forEach((item) => { if (breakerIds.has(item.breakerId)) switches.set(item.id, item); });
  for (const breaker of breakers) {
    const name = breakerName(breaker);
    for (const [id, label] of [[ids.tripMcb(breaker.id), 'trip'], [ids.closeMcb(breaker.id), 'close']] as const) {
      mcbs.set(id, { id, name: `${name} ${label} supply MCB`, supplyId: STATION_DC_SUPPLY_ID, closed: true, ...storedMcb.get(id) });
    }
    const lr = ids.localRemote(breaker.id);
    switches.set(lr, { id: lr, name: `${name} Local/Remote`, breakerId: breaker.id, position: 'remote', ...storedSwitch.get(lr) });
  }
  return { supplies: resolvedSupplies, mcbs: [...mcbs.values()], switches: [...switches.values()], circuits };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function contactConducts(doc: DrawingDocument, model: SecondaryModel, source: ContactSource, context: LadderContext): boolean {
  switch (source.kind) {
    case 'plant-aux': {
      const symbol = doc.objects.symbols.find((item) => item.id === source.objectId);
      const closed = context.assumeClosed?.includes(source.objectId) || (symbol?.operation?.switchState === 'closed' && !symbol.operation?.tripped);
      return source.contact === 'a' ? Boolean(closed) : !closed;
    }
    case 'relay-trip': {
      if (context.forceRelayTrip?.includes(source.relayId)) return true;
      const relay = doc.relays.find((item) => item.id === source.relayId);
      return Boolean(relay?.enabled && relay.state === 'tripped');
    }
    case 'command':
      return Boolean(context.command && context.command.command === source.command && context.command.location === source.location);
    case 'local-remote':
      return model.switches.find((item) => item.id === source.switchId)?.position === source.position;
    case 'lockout':
      return !doc.objects.symbols.find((item) => item.id === source.objectId)?.operation?.lockout;
  }
}

export function evaluateCircuit(doc: DrawingDocument, circuit: SecondaryCircuit, context: LadderContext = {}, model: SecondaryModel = resolveSecondary(doc)): CircuitEvaluation {
  const mcb = model.mcbs.find((item) => item.id === circuit.mcbId);
  const supply = model.supplies.find((item) => item.id === mcb?.supplyId);
  const deadBecause = !supply?.healthy ? 'supply' : !mcb?.closed ? 'mcb' : undefined;
  const supplied = !deadBecause;
  // A command is only ever applied to its own breaker's contacts.
  const forThis = context.command && context.command.breakerId !== circuit.breakerId ? { ...context, command: undefined } : context;
  const rungs = circuit.rungs.map((rung): RungEvaluation => {
    const contacts = rung.contacts.map((contact) => ({ id: contact.id, source: contact.source, conducts: contactConducts(doc, model, contact.source, forThis) }));
    const blocking = contacts.find((contact) => !contact.conducts);
    const continuous = !blocking;
    return { id: rung.id, contacts, continuous, energised: continuous && supplied, blockingContactId: blocking?.id };
  });
  return { circuit, supply, mcb, supplied, deadBecause, rungs, coilEnergised: rungs.some((rung) => rung.energised) };
}

export function circuitsFor(model: SecondaryModel, breakerId: string, kind?: SecondaryCircuit['kind']): SecondaryCircuit[] {
  return model.circuits.filter((circuit) => circuit.breakerId === breakerId && (!kind || circuit.kind === kind));
}

/** Is a coil of this kind energised on this breaker in this context? */
export function coilEnergised(doc: DrawingDocument, breakerId: string, kind: 'trip' | 'close', context: LadderContext = {}, model = resolveSecondary(doc)): boolean {
  return circuitsFor(model, breakerId, kind).some((circuit) => evaluateCircuit(doc, circuit, context, model).coilEnergised);
}

/**
 * Would this relay's trip reach the breaker's trip coil? An open breaker has
 * nothing left to do, so it never counts as a failed trip.
 */
export function relayTripReachesCoil(doc: DrawingDocument, breakerId: string, relayId: string, model = resolveSecondary(doc)): boolean {
  const breaker = doc.objects.symbols.find((symbol) => symbol.id === breakerId);
  if (!breaker || breaker.operation?.switchState !== 'closed' || breaker.operation?.tripped) return true;
  return circuitsFor(model, breakerId, 'trip').some((circuit) => {
    const evaluation = evaluateCircuit(doc, circuit, { forceRelayTrip: [relayId] }, model);
    return evaluation.rungs.some((rung, index) => rung.energised && circuit.rungs[index].contacts.some((contact) => contact.source.kind === 'relay-trip' && contact.source.relayId === relayId));
  });
}

// ---------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------

export function describeContact(doc: DrawingDocument, model: SecondaryModel, source: ContactSource): string {
  const name = (id: string) => doc.objects.symbols.find((symbol) => symbol.id === id)?.label?.text?.trim() || id;
  switch (source.kind) {
    case 'plant-aux': return `${name(source.objectId)} auxiliary contact (${source.contact === 'a' ? 'closed with the breaker' : 'closed with the breaker open'})`;
    case 'relay-trip': return `${doc.relays.find((relay) => relay.id === source.relayId)?.name ?? source.relayId} ${source.path === 'backup' ? 'breaker-fail backup trip' : 'trip'} contact`;
    case 'command': return `${source.location === 'remote' ? 'remote' : 'local'} ${source.command} command`;
    case 'local-remote': return `${model.switches.find((item) => item.id === source.switchId)?.name ?? 'Local/Remote selector'} at ${source.position === 'remote' ? 'Remote' : 'Local'}`;
    case 'lockout': return `${name(source.objectId)} lockout (86) contact`;
  }
}

/** Why a command could not energise its coil, in a sentence a learner can act on. */
export function explainNoPath(doc: DrawingDocument, breakerId: string, command: BreakerCommand, location: ControlLocation, model = resolveSecondary(doc)): string {
  const circuits = circuitsFor(model, breakerId, command);
  if (!circuits.length) return `No ${command} circuit is drawn for this breaker`;
  const context: LadderContext = { command: { breakerId, command, location } };
  for (const circuit of circuits) {
    const evaluation = evaluateCircuit(doc, circuit, context, model);
    if (evaluation.deadBecause === 'supply') return `${evaluation.supply?.name ?? 'DC supply'} lost: ${circuit.name} circuit is dead`;
    if (evaluation.deadBecause === 'mcb') return `${evaluation.mcb?.name ?? 'MCB'} is open: ${circuit.name} circuit is dead`;
    // Explain the rung this command drives, not an unrelated relay rung.
    const commandRung = evaluation.rungs.find((rung) => rung.contacts.some((contact) => contact.source.kind === 'command' && contact.source.command === command && contact.source.location === location));
    const blocking = commandRung?.contacts.find((contact) => contact.id === commandRung.blockingContactId);
    if (blocking) {
      if (blocking.source.kind === 'local-remote') {
        const position = model.switches.find((item) => item.id === (blocking.source as { switchId: string }).switchId)?.position;
        return `Local/Remote selector is at ${position === 'local' ? 'Local' : 'Remote'}`;
      }
      if (blocking.source.kind === 'lockout') return 'Lockout (86) operated: close blocked until it is reset';
      if (blocking.source.kind === 'plant-aux') return `Breaker already ${command === 'close' ? 'closed' : 'open'}`;
      return `${describeContact(doc, model, blocking.source)} is open`;
    }
    if (!commandRung) return `No ${location} ${command} contact in ${circuit.name}`;
  }
  return `${command} coil did not energise`;
}

// ---------------------------------------------------------------------------
// Changing secondary device state
// ---------------------------------------------------------------------------

function withStored(doc: DrawingDocument, patch: (model: SecondaryModel) => SecondaryModel): DrawingDocument {
  const base: SecondaryModel = doc.secondary ?? { supplies: [], mcbs: [], switches: [], circuits: [] };
  return { ...doc, secondary: patch(base) };
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((existing) => existing.id === item.id) ? items.map((existing) => existing.id === item.id ? item : existing) : [...items, item];
}

export function setMcbClosed(doc: DrawingDocument, mcbId: string, closed: boolean): DrawingDocument {
  const mcb = resolveSecondary(doc).mcbs.find((item) => item.id === mcbId);
  if (!mcb) return doc;
  return withStored(doc, (model) => ({ ...model, mcbs: upsert(model.mcbs, { ...mcb, closed }) }));
}

export function setLocalRemote(doc: DrawingDocument, switchId: string, position: ControlLocation): DrawingDocument {
  const item = resolveSecondary(doc).switches.find((entry) => entry.id === switchId);
  if (!item) return doc;
  return withStored(doc, (model) => ({ ...model, switches: upsert(model.switches, { ...item, position }) }));
}

export function setSupplyHealthy(doc: DrawingDocument, supplyId: string, healthy: boolean): DrawingDocument {
  const supply = resolveSecondary(doc).supplies.find((item) => item.id === supplyId);
  if (!supply) return doc;
  return withStored(doc, (model) => ({ ...model, supplies: upsert(model.supplies, { ...supply, healthy }) }));
}
