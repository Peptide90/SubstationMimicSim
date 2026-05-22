import type { DrawingDocument, ElectricalSymbol, FaultMetadata, RelaySettings } from '../drawing/model';
import type { SimulationDerivedState } from './powerFlow';

const earthFaultTypes = new Set(['phase-to-earth', 'A-E', 'B-E', 'C-E', 'A-B-C-E', 'persistent', 'transient', 'high-impedance']);

export interface RelayRuntimeState {
  relayId: string;
  state: RelaySettings['state'];
  pickedUp: boolean;
  tripped: boolean;
  breakerFailActive: boolean;
  reason?: string;
}

export interface RelayStepResult {
  doc: DrawingDocument;
  runtime: Map<string, RelayRuntimeState>;
}

export function deriveRelayRuntime(doc: DrawingDocument, simulation: SimulationDerivedState, now = Date.now()): Map<string, RelayRuntimeState> {
  return new Map(doc.relays.map((relay) => {
    const fault = faultInRelayZone(doc, relay);
    const maxCurrent = maxZoneCurrent(doc, simulation, relay);
    const overcurrentPickup = relay.type === 'overcurrent' && maxCurrent >= relay.pickupCurrentA;
    const earthPickup = relay.type === 'earth-fault' && Boolean(fault && earthFaultTypes.has(fault.type));
    const pickedUp = relay.enabled && (overcurrentPickup || earthPickup);
    const pickedUpAt = relay.pickedUpAt ? Date.parse(relay.pickedUpAt) : now;
    const tripped = pickedUp && now - pickedUpAt >= relay.timeDelayMs;
    const breakerFailActive = tripped && relay.breakerFailEnabled && primaryTripFailed(doc, relay);
    return [relay.id, {
      relayId: relay.id,
      state: tripped ? 'tripped' : pickedUp ? 'picked-up' : 'idle',
      pickedUp,
      tripped,
      breakerFailActive,
      reason: pickedUp ? `${relay.name} ${relay.type} pickup` : undefined
    }];
  }));
}

export function applyRelayProtectionStep(doc: DrawingDocument, simulation: SimulationDerivedState, now = Date.now()): RelayStepResult {
  const runtime = deriveRelayRuntime(doc, simulation, now);
  const openedBreakers = new Set<string>();
  const failedBreakers = new Set<string>();
  const backupBreakers = new Set<string>();
  const timestamp = new Date(now).toISOString();

  const relays = doc.relays.map((relay) => {
    const state = runtime.get(relay.id);
    if (!state || !relay.enabled || !state.pickedUp) {
      return relay.state === 'idle' && !relay.pickedUpAt ? relay : { ...relay, state: 'idle' as const, pickedUpAt: undefined, trippedAt: undefined, resetAt: timestamp };
    }
    const pickedUpAt = relay.pickedUpAt ?? timestamp;
    if (!state.tripped) return { ...relay, state: 'picked-up' as const, pickedUpAt };

    relay.tripTargetBreakerIds.forEach((breakerId) => {
      if (breakerWillFail(doc, breakerId)) failedBreakers.add(breakerId);
      else openedBreakers.add(breakerId);
    });

    const pickupAge = now - Date.parse(pickedUpAt);
    if (relay.breakerFailEnabled && pickupAge >= relay.timeDelayMs + relay.breakerFailDelayMs) {
      relay.backupTripTargetBreakerIds.forEach((breakerId) => backupBreakers.add(breakerId));
    }

    return { ...relay, state: 'tripped' as const, pickedUpAt, trippedAt: relay.trippedAt ?? timestamp };
  });

  const allOpened = new Set([...openedBreakers, ...backupBreakers]);
  const events = [
    ...doc.relays.flatMap((relay) => {
      const nextRelay = relays.find((item) => item.id === relay.id);
      if (!nextRelay || nextRelay.state === relay.state) return [];
      return [`${nextRelay.name} ${nextRelay.state}`];
    }),
    ...[...openedBreakers].map((id) => `Relay trip opened ${id}`),
    ...[...failedBreakers].map((id) => `Breaker fail detected on ${id}`),
    ...[...backupBreakers].map((id) => `Backup trip opened ${id}`)
  ];

  return {
    doc: {
      ...doc,
      relays,
      objects: {
        ...doc.objects,
        symbols: doc.objects.symbols.map((symbol) =>
          allOpened.has(symbol.id)
            ? { ...symbol, operation: { ...symbol.operation, switchState: 'open', tripped: true, protectionState: 'tripped' } }
            : symbol
        )
      },
      operationEvents: [
        ...doc.operationEvents,
        ...events.map((message, index) => ({ id: `event-${now}-${index}`, timestamp, message }))
      ]
    },
    runtime
  };
}

export function loadScenario(doc: DrawingDocument, scenarioId: string, now = Date.now()): DrawingDocument {
  const scenario = doc.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) return doc;
  const timestamp = new Date(now).toISOString();
  return {
    ...doc,
    activeScenarioId: scenario.id,
    faults: scenario.faults,
    relays: scenario.relays,
    objects: {
      ...doc.objects,
      symbols: doc.objects.symbols.map((symbol) => ({
        ...symbol,
        operation: {
          ...symbol.operation,
          switchState: scenario.initialSwitchStates[symbol.id] ?? symbol.operation?.switchState,
          sourceOn: scenario.initialSourceStates[symbol.id] ?? symbol.operation?.sourceOn,
          tripped: false,
          protectionState: 'idle'
        }
      }))
    },
    operationEvents: [
      ...doc.operationEvents,
      { id: `event-${now}-scenario`, timestamp, message: `Scenario loaded: ${scenario.name}` }
    ]
  };
}

function faultInRelayZone(doc: DrawingDocument, relay: RelaySettings): FaultMetadata | undefined {
  const zone = relay.zoneId ? doc.protectionZones.find((item) => item.id === relay.zoneId) : undefined;
  return doc.faults.find((fault) => {
    if (!fault.active || !fault.phases.some((phase) => relay.phases.includes(phase))) return false;
    if (!zone) return true;
    return Boolean(fault.targetObjectId && zone.assignedObjectIds.includes(fault.targetObjectId));
  });
}

function maxZoneCurrent(doc: DrawingDocument, simulation: SimulationDerivedState, relay: RelaySettings): number {
  const zone = relay.zoneId ? doc.protectionZones.find((item) => item.id === relay.zoneId) : undefined;
  const objectIds = zone?.assignedObjectIds ?? [...simulation.objectSummaries.keys()];
  return Math.max(
    ...objectIds.flatMap((objectId) => {
      const summary = simulation.objectSummaries.get(objectId);
      return relay.phases.map((phase) => summary?.phases[phase]?.currentA ?? 0);
    }),
    0
  );
}

function primaryTripFailed(doc: DrawingDocument, relay: RelaySettings): boolean {
  return relay.tripTargetBreakerIds.some((breakerId) => breakerWillFail(doc, breakerId));
}

function breakerWillFail(doc: DrawingDocument, breakerId: string): boolean {
  const breaker = doc.objects.symbols.find((symbol): symbol is ElectricalSymbol => symbol.id === breakerId);
  return Boolean(breaker?.simulation?.damaged);
}
