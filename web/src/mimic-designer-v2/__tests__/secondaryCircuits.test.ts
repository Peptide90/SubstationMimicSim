import { describe, expect, it } from 'vitest';
import type { DrawingDocument } from '../drawing/model';
import { migrateDrawingDocument } from '../schema/documentSchema';
import { issueBreakerCommand } from '../secondary/commands';
import { buildLadderSheet, protectSheetIndex } from '../secondary/ladderSheet';
import { circuitsFor, coilEnergised, evaluateCircuit, resolveSecondary, secondaryIds, setLocalRemote, setMcbClosed, setSupplyHealthy, STATION_DC_SUPPLY_ID } from '../secondary/ladder';
import { deriveSimulationState } from '../simulation/powerFlow';
import { applyRelayProtectionStep } from '../simulation/protection';
import { templateLibrary } from '../templates';
import { buildGraph } from '../topology/graph';
import { deriveOperationState, operateDevice } from '../topology/operation';

const example = (id: string): DrawingDocument => migrateDrawingDocument(templateLibrary.find((t) => t.id === id)!.create())!;
const breakers = (doc: DrawingDocument) => doc.objects.symbols.filter((symbol) => symbol.type === 'circuit-breaker');
const state = (doc: DrawingDocument, id: string) => doc.objects.symbols.find((symbol) => symbol.id === id)?.operation?.switchState;
const derive = (doc: DrawingDocument) => {
  const graph = buildGraph(doc);
  return deriveSimulationState(doc, graph, deriveOperationState(doc, graph));
};

describe('generated standard scheme', () => {
  it('gives every breaker one trip and one close circuit, supplied from the station battery', () => {
    for (const template of templateLibrary) {
      const doc = migrateDrawingDocument(template.create())!;
      const model = resolveSecondary(doc);
      for (const breaker of breakers(doc)) {
        expect(circuitsFor(model, breaker.id, 'trip'), `${template.id} ${breaker.id}`).toHaveLength(1);
        expect(circuitsFor(model, breaker.id, 'close')).toHaveLength(1);
      }
      expect(model.supplies.map((supply) => supply.id)).toContain(STATION_DC_SUPPLY_ID);
      expect(model.mcbs.every((mcb) => mcb.closed)).toBe(true);
      expect(model.switches.every((item) => item.position === 'remote')).toBe(true);
    }
  });

  it('puts a contact from each relay that trips the breaker on its trip circuit', () => {
    const doc = example('example-breaker-fail-backup');
    const main = circuitsFor(resolveSecondary(doc), 'ex-bf-cb', 'trip')[0];
    const backup = circuitsFor(resolveSecondary(doc), 'ex-bf-backup-cb', 'trip')[0];
    const relayContacts = (circuit: typeof main) => circuit.rungs.flatMap((rung) => rung.contacts).filter((contact) => contact.source.kind === 'relay-trip').map((contact) => contact.source);
    expect(relayContacts(main)).toEqual([{ kind: 'relay-trip', relayId: doc.relays[0].id, path: 'main' }]);
    expect(relayContacts(backup)).toEqual([{ kind: 'relay-trip', relayId: doc.relays[0].id, path: 'backup' }]);
  });

  it('stores nothing until a secondary device changes', () => {
    const doc = example('example-overcurrent-trip');
    expect(doc.secondary).toBeUndefined();
    const mcbId = secondaryIds.tripMcb(breakers(doc)[0].id);
    const opened = setMcbClosed(doc, mcbId, false);
    expect(opened.secondary?.mcbs).toEqual([expect.objectContaining({ id: mcbId, closed: false })]);
    expect(opened.secondary?.circuits).toEqual([]);
    // And survives a save and reload.
    const reloaded = migrateDrawingDocument(JSON.parse(JSON.stringify(opened)))!;
    expect(resolveSecondary(reloaded).mcbs.find((mcb) => mcb.id === mcbId)?.closed).toBe(false);
  });
});

describe('rung evaluation', () => {
  const doc = example('example-overcurrent-trip');
  const cb = breakers(doc)[0].id;

  it('energises a coil only while its command is issued', () => {
    expect(state(doc, cb)).toBe('closed');
    expect(coilEnergised(doc, cb, 'trip')).toBe(false);
    expect(coilEnergised(doc, cb, 'trip', { command: { breakerId: cb, command: 'trip', location: 'remote' } })).toBe(true);
    // A command for a different breaker does nothing here.
    expect(coilEnergised(doc, cb, 'trip', { command: { breakerId: 'other', command: 'trip', location: 'remote' } })).toBe(false);
  });

  it('names the contact holding a rung open', () => {
    const local = setLocalRemote(doc, secondaryIds.localRemote(cb), 'local');
    const evaluation = evaluateCircuit(local, circuitsFor(resolveSecondary(local), cb, 'trip')[0], { command: { breakerId: cb, command: 'trip', location: 'remote' } });
    const remoteRung = evaluation.rungs.find((rung) => rung.id === `${cb}-trip-remote`)!;
    expect(remoteRung.continuous).toBe(false);
    expect(remoteRung.blockingContactId).toBe(`${cb}-trip-remote-lr`);
  });

  it('kills the whole circuit when its MCB opens or the battery is lost', () => {
    const command = { command: { breakerId: cb, command: 'trip' as const, location: 'remote' as const } };
    const mcbOpen = setMcbClosed(doc, secondaryIds.tripMcb(cb), false);
    const noDc = setSupplyHealthy(doc, STATION_DC_SUPPLY_ID, false);
    expect(evaluateCircuit(mcbOpen, circuitsFor(resolveSecondary(mcbOpen), cb, 'trip')[0], command).deadBecause).toBe('mcb');
    expect(evaluateCircuit(noDc, circuitsFor(resolveSecondary(noDc), cb, 'trip')[0], command).deadBecause).toBe('supply');
    expect(coilEnergised(mcbOpen, cb, 'trip', command)).toBe(false);
    // The close MCB is separate.
    expect(evaluateCircuit(mcbOpen, circuitsFor(resolveSecondary(mcbOpen), cb, 'close')[0]).supplied).toBe(true);
  });
});

describe('commands through the circuits', () => {
  it('match direct operation for every breaker in every template while the scheme is healthy', () => {
    for (const template of templateLibrary) {
      const doc = migrateDrawingDocument(template.create())!;
      const graph = buildGraph(doc);
      for (const breaker of breakers(doc)) {
        const closed = state(doc, breaker.id) === 'closed' && !breaker.operation?.tripped;
        const commanded = issueBreakerCommand(doc, graph, breaker.id, closed ? 'trip' : 'close');
        const direct = operateDevice(doc, graph, breaker.id);
        const symbolsOf = (next: DrawingDocument) => next.objects.symbols.map((symbol) => [symbol.id, symbol.operation?.switchState, symbol.operation?.tripped, symbol.operation?.lockout]);
        expect(symbolsOf(commanded.doc), `${template.id} ${breaker.id}`).toEqual(symbolsOf(direct.doc));
        expect(Boolean(commanded.refused)).toBe(Boolean(direct.refused));
      }
    }
  });

  it('still trip on closing onto earthed equipment, exactly as a direct close does', () => {
    const doc = example('example-overcurrent-trip');
    const graph = buildGraph(doc);
    const cb = breakers(doc)[0].id;
    const opened = issueBreakerCommand(doc, graph, cb, 'trip').doc;
    expect(state(opened, cb)).toBe('open');
    const earth = opened.objects.symbols.find((symbol) => symbol.type === 'earth-switch');
    if (!earth) return;
    const earthed = { ...opened, objects: { ...opened.objects, symbols: opened.objects.symbols.map((symbol) => symbol.id === earth.id ? { ...symbol, operation: { ...symbol.operation, switchState: 'closed' as const } } : symbol) } };
    const commanded = issueBreakerCommand(earthed, graph, cb, 'close');
    const direct = operateDevice(earthed, graph, cb);
    expect(state(commanded.doc, cb)).toBe(state(direct.doc, cb));
    expect(commanded.doc.objects.symbols.find((symbol) => symbol.id === cb)?.operation?.lockout).toBe(direct.doc.objects.symbols.find((symbol) => symbol.id === cb)?.operation?.lockout);
  });

  it('refuse remote commands when the selector is at Local, and accept local ones', () => {
    const doc = example('example-overcurrent-trip');
    const graph = buildGraph(doc);
    const cb = breakers(doc)[0].id;
    const local = setLocalRemote(doc, secondaryIds.localRemote(cb), 'local');
    const remote = issueBreakerCommand(local, graph, cb, 'trip', 'remote');
    expect(remote.refused).toBe(true);
    expect(remote.reason).toMatch(/Local\/Remote selector is at Local/);
    expect(state(remote.doc, cb)).toBe('closed');
    expect(remote.doc.operationEvents.at(-1)?.severity).toBe('alarm');
    expect(state(issueBreakerCommand(local, graph, cb, 'trip', 'local').doc, cb)).toBe('open');
  });

  it('refuse a close while locked out, and a trip with the trip MCB open', () => {
    const doc = example('example-overcurrent-trip');
    const graph = buildGraph(doc);
    const cb = breakers(doc)[0].id;
    const noTrip = issueBreakerCommand(setMcbClosed(doc, secondaryIds.tripMcb(cb), false), graph, cb, 'trip');
    expect(noTrip.refused).toBe(true);
    expect(noTrip.reason).toMatch(/trip supply MCB is open/);

    const open = issueBreakerCommand(doc, graph, cb, 'trip').doc;
    const locked = { ...open, objects: { ...open.objects, symbols: open.objects.symbols.map((symbol) => symbol.id === cb ? { ...symbol, operation: { ...symbol.operation, lockout: true } } : symbol) } };
    const close = issueBreakerCommand(locked, graph, cb, 'close');
    expect(close.refused).toBe(true);
    expect(close.reason).toMatch(/Lockout \(86\)/);
  });

  it('refuse a command the breaker is already in', () => {
    const doc = example('example-overcurrent-trip');
    const result = issueBreakerCommand(doc, buildGraph(doc), breakers(doc)[0].id, 'close');
    expect(result.refused).toBe(true);
    expect(result.reason).toBe('Breaker already closed');
  });
});

describe('protection through the trip circuit', () => {
  function trip(base: DrawingDocument, extraSteps = 0): DrawingDocument {
    const doc = { ...base, relays: base.relays.map((relay) => ({ ...relay, pickupCurrentA: 1, functions: relay.functions!.map((fn) => ({ ...fn, pickupThreshold: 1 })) })) };
    let next = applyRelayProtectionStep(doc, derive(doc), 0).doc;
    next = applyRelayProtectionStep(next, derive(next), 1000).doc;
    for (let step = 1; step <= extraSteps; step += 1) next = applyRelayProtectionStep(next, derive(next), 1000 + step * 1000).doc;
    return next;
  }

  it('opens the breaker when the trip circuit is healthy', () => {
    expect(state(trip(example('example-breaker-fail-backup')), 'ex-bf-cb')).toBe('open');
  });

  it('cannot open the breaker with its trip MCB open, so breaker fail clears it from the backup breaker', () => {
    const base = setMcbClosed(example('example-breaker-fail-backup'), secondaryIds.tripMcb('ex-bf-cb'), false);
    const tripped = trip(base, 1);
    expect(tripped.relays[0].state).toBe('tripped');
    expect(state(tripped, 'ex-bf-cb')).toBe('closed');
    expect(state(tripped, 'ex-bf-backup-cb')).toBe('open');
    expect(tripped.operationEvents.some((event) => event.message === 'Breaker fail detected on ex-bf-cb')).toBe(true);
  });

  it('loses the backup trip too when the station battery is lost', () => {
    const base = setSupplyHealthy(example('example-breaker-fail-backup'), STATION_DC_SUPPLY_ID, false);
    const tripped = trip(base, 1);
    expect(state(tripped, 'ex-bf-cb')).toBe('closed');
    expect(state(tripped, 'ex-bf-backup-cb')).toBe('closed');
    expect(tripped.operationEvents.some((event) => event.message === 'Backup trip failed on ex-bf-backup-cb')).toBe(true);
  });
});

describe('trip and close sheets', () => {
  it('indexes the block diagram first, then one sheet per breaker', () => {
    const doc = example('example-breaker-fail-backup');
    const index = protectSheetIndex(doc);
    expect(index[0]).toMatchObject({ number: 'P-01', id: 'protection-block-diagram' });
    expect(index.slice(1).map((entry) => entry.breakerId)).toEqual(breakers(doc).map((breaker) => breaker.id));
  });

  it('draws current only as far as it reaches', () => {
    const doc = example('example-breaker-fail-backup');
    const sheet = buildLadderSheet(doc, 'ex-bf-cb', 'Apprentice', 'ansi')!;
    const trip = sheet.circuits.find((circuit) => circuit.kind === 'trip')!;
    const relayRung = trip.rungs.find((rung) => rung.elements.some((element) => element.role === 'relay-trip-contact'))!;
    // Relay contact is live but open; the 52a beyond it is not reached.
    expect(relayRung.elements.map((element) => [element.code, element.live, element.conducts])).toEqual([['94', true, false], ['52a', false, true]]);
    expect(relayRung.coil).toMatchObject({ code: '52TC', energised: false });

    const dead = buildLadderSheet(setMcbClosed(doc, secondaryIds.tripMcb('ex-bf-cb'), false), 'ex-bf-cb')!;
    const deadTrip = dead.circuits.find((circuit) => circuit.kind === 'trip')!;
    expect(deadTrip.deadBecause).toBe('mcb');
    expect(deadTrip.rungs.flatMap((rung) => rung.elements).some((element) => element.live)).toBe(false);
  });

  it('labels by convention without changing the circuit', () => {
    const doc = example('example-breaker-fail-backup');
    const shape = (convention: 'plain' | 'ansi' | 'iec') => buildLadderSheet(doc, 'ex-bf-cb', 'Apprentice', convention)!.circuits.map((circuit) => circuit.rungs.map((rung) => rung.elements.map((element) => [element.role, element.conducts, element.live])));
    expect(shape('iec')).toEqual(shape('plain'));
    expect(shape('ansi')).toEqual(shape('plain'));
    const close = buildLadderSheet(doc, 'ex-bf-cb', 'Apprentice', 'iec')!.circuits.find((circuit) => circuit.kind === 'close')!;
    expect(close.rungs[0].coil.code).toBe('-MB2');
  });
});
