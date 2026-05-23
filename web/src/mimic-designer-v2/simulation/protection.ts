import type { DrawingDocument, ElectricalSymbol, FaultMetadata, RelayFunction, RelayOutputAction, RelaySettings } from '../drawing/model';
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
    const functionStates = relayFunctions(relay).map((fn) => evaluateRelayFunction(doc, simulation, relay, fn, now));
    const pickedUp = relay.enabled && functionStates.some((state) => state.pickedUp);
    const tripped = relay.enabled && functionStates.some((state) => state.tripped);
    const breakerFailActive = tripped && relay.breakerFailEnabled && primaryTripFailed(doc, relay);
    const reason = functionStates.find((state) => state.pickedUp)?.reason;
    return [relay.id, {
      relayId: relay.id,
      state: relay.enabled ? tripped ? 'tripped' : pickedUp ? 'picked-up' : 'idle' : 'disabled',
      pickedUp,
      tripped,
      breakerFailActive,
      reason
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
      const resetFunctions = relayFunctions(relay).map((fn) => fn.state === 'inactive' ? fn : { ...fn, state: 'reset' as const });
      return relay.state === 'idle' && !relay.pickedUpAt ? { ...relay, functions: resetFunctions } : { ...relay, state: relay.enabled ? 'idle' as const : 'disabled' as const, pickedUpAt: undefined, trippedAt: undefined, resetAt: timestamp, functions: resetFunctions };
    }
    const pickedUpAt = relay.pickedUpAt ?? timestamp;
    const functions = relayFunctions(relay).map((fn) => {
      const fnRuntime = evaluateRelayFunction(doc, simulation, relay, fn, now, Date.parse(pickedUpAt));
      return {
        ...fn,
        state: fnRuntime.tripped ? 'tripped' as const : fnRuntime.pickedUp ? 'timing' as const : 'inactive' as const,
        pickedUpAt: fnRuntime.pickedUp ? fn.pickedUpAt ?? pickedUpAt : undefined,
        trippedAt: fnRuntime.tripped ? fn.trippedAt ?? timestamp : undefined
      };
    });
    if (!state.tripped) return { ...relay, state: 'picked-up' as const, pickedUpAt, functions };

    relayOutputs(relay).forEach((action) => applyRelayOutput(doc, action, openedBreakers, failedBreakers));

    const pickupAge = now - Date.parse(pickedUpAt);
    if (relay.breakerFailEnabled && pickupAge >= relay.timeDelayMs + relay.breakerFailDelayMs) {
      relay.backupTripTargetBreakerIds.forEach((breakerId) => backupBreakers.add(breakerId));
    }

    return { ...relay, state: 'tripped' as const, pickedUpAt, trippedAt: relay.trippedAt ?? timestamp, functions };
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

function relayFunctions(relay: RelaySettings): RelayFunction[] {
  return relay.functions?.length ? relay.functions : [{
    id: `${relay.id}-fn-${relay.type}`,
    type: relay.type,
    enabled: relay.enabled,
    pickupThreshold: relay.type === 'earth-fault' ? relay.earthFaultPickupA ?? relay.pickupCurrentA : relay.pickupCurrentA,
    timeDelayMs: relay.timeDelayMs,
    instantaneous: false,
    phases: relay.phases,
    requiredInputType: relay.type === 'earth-fault' ? 'earth-residual-current' : 'current',
    logic: relay.type === 'earth-fault' ? 'residual-earth' : 'any-phase',
    state: relay.state === 'picked-up' ? 'picked-up' : relay.state === 'tripped' ? 'tripped' : 'inactive',
    pickedUpAt: relay.pickedUpAt,
    trippedAt: relay.trippedAt
  }];
}

function relayOutputs(relay: RelaySettings): RelayOutputAction[] {
  return relay.outputActions?.length ? relay.outputActions : relay.tripTargetBreakerIds.map((targetObjectId) => ({
    id: `${relay.id}-trip-${targetObjectId}`,
    targetType: 'circuit-breaker',
    targetObjectId,
    action: 'trip-open-breaker'
  }));
}

function evaluateRelayFunction(doc: DrawingDocument, simulation: SimulationDerivedState, relay: RelaySettings, fn: RelayFunction, now: number, fallbackPickedUpAt?: number) {
  if (!relay.enabled || !fn.enabled) return { pickedUp: false, tripped: false };
  const fault = faultInRelayZone(doc, relay);
  const maxCurrent = maxZoneCurrent(doc, simulation, relay, fn);
  const maxVoltage = maxZoneVoltage(doc, simulation, relay, fn);
  const thermalActive = fn.type === 'thermal-overload' && maxZoneThermalState(doc, simulation, relay, fn);
  const earthPickup = ['earth-fault', 'directional-earth-fault', 'restricted-earth-fault'].includes(fn.type) && Boolean(fault && earthFaultTypes.has(fault.type));
  const overcurrentPickup = ['overcurrent', 'directional-overcurrent'].includes(fn.type) && maxCurrent >= (fn.pickupThreshold ?? relay.pickupCurrentA);
  const overvoltagePickup = fn.type === 'overvoltage' && maxVoltage >= (fn.pickupThreshold ?? 0);
  const undervoltagePickup = fn.type === 'undervoltage' && maxVoltage > 0 && maxVoltage <= (fn.pickupThreshold ?? 0);
  const differentialPickup = fn.type === 'differential' && Boolean(fault);
  const breakerFailPickup = fn.type === 'breaker-fail' && primaryTripFailed(doc, relay);
  const pickedUp = overcurrentPickup || earthPickup || overvoltagePickup || undervoltagePickup || thermalActive || differentialPickup || breakerFailPickup;
  const pickedUpAt = fn.pickedUpAt ? Date.parse(fn.pickedUpAt) : fallbackPickedUpAt ?? now;
  const tripped = pickedUp && (fn.instantaneous || now - pickedUpAt >= fn.timeDelayMs);
  return {
    pickedUp,
    tripped,
    reason: pickedUp ? `${relay.name} ${fn.type} pickup` : undefined
  };
}

function applyRelayOutput(doc: DrawingDocument, action: RelayOutputAction, openedBreakers: Set<string>, failedBreakers: Set<string>) {
  if (!action.targetObjectId || !['trip-open-breaker', 'apply-lockout'].includes(action.action)) return;
  const target = doc.objects.symbols.find((symbol) => symbol.id === action.targetObjectId);
  if (!target) return;
  if (target.type !== 'circuit-breaker' && action.targetType !== 'source') return;
  if (breakerWillFail(doc, action.targetObjectId)) failedBreakers.add(action.targetObjectId);
  else openedBreakers.add(action.targetObjectId);
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

function maxZoneCurrent(doc: DrawingDocument, simulation: SimulationDerivedState, relay: RelaySettings, fn?: RelayFunction): number {
  const zone = relay.zoneId ? doc.protectionZones.find((item) => item.id === relay.zoneId) : undefined;
  const inputObjectIds = relay.inputs?.filter((input) => ['current', 'earth-residual-current', 'differential-current'].includes(input.quantity) && input.sourceObjectId).map((input) => input.sourceObjectId!) ?? [];
  const objectIds = inputObjectIds.length ? inputObjectIds : zone?.assignedObjectIds ?? [...simulation.objectSummaries.keys()];
  return Math.max(
    ...objectIds.flatMap((objectId) => {
      const summary = simulation.objectSummaries.get(objectId);
      return (fn?.phases?.length ? fn.phases : relay.phases).map((phase) => summary?.phases[phase]?.currentA ?? 0);
    }),
    0
  );
}

function maxZoneVoltage(doc: DrawingDocument, simulation: SimulationDerivedState, relay: RelaySettings, fn: RelayFunction): number {
  const zone = relay.zoneId ? doc.protectionZones.find((item) => item.id === relay.zoneId) : undefined;
  const inputObjectIds = relay.inputs?.filter((input) => input.quantity === 'voltage' && input.sourceObjectId).map((input) => input.sourceObjectId!) ?? [];
  const objectIds = inputObjectIds.length ? inputObjectIds : zone?.assignedObjectIds ?? [...simulation.objectSummaries.keys()];
  return Math.max(
    ...objectIds.flatMap((objectId) => {
      const summary = simulation.objectSummaries.get(objectId);
      return fn.phases.map((phase) => summary?.phases[phase]?.voltageKv ?? 0);
    }),
    0
  );
}

function maxZoneThermalState(doc: DrawingDocument, simulation: SimulationDerivedState, relay: RelaySettings, fn: RelayFunction): boolean {
  const zone = relay.zoneId ? doc.protectionZones.find((item) => item.id === relay.zoneId) : undefined;
  const inputObjectIds = relay.inputs?.filter((input) => input.quantity === 'temperature' && input.sourceObjectId).map((input) => input.sourceObjectId!) ?? [];
  const objectIds = inputObjectIds.length ? inputObjectIds : zone?.assignedObjectIds ?? [...simulation.objectSummaries.keys()];
  return objectIds.some((objectId) => {
    const summary = simulation.objectSummaries.get(objectId);
    return summary && ['hot', 'critical'].includes(summary.thermalState) && fn.phases.some((phase) => summary.phases[phase]);
  });
}

function primaryTripFailed(doc: DrawingDocument, relay: RelaySettings): boolean {
  return relay.tripTargetBreakerIds.some((breakerId) => breakerWillFail(doc, breakerId));
}

function breakerWillFail(doc: DrawingDocument, breakerId: string): boolean {
  const breaker = doc.objects.symbols.find((symbol): symbol is ElectricalSymbol => symbol.id === breakerId);
  return Boolean(breaker?.simulation?.damaged);
}
