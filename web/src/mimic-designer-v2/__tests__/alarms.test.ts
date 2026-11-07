import { describe, expect, it } from 'vitest';
import type { OperationEvent } from '../drawing/model';
import { alarmSummary, deriveAlarms, eventSeverity } from '../operate/alarms';

const event = (id: string, message: string, severity?: OperationEvent['severity']): OperationEvent => ({ id, timestamp: `2026-01-01T00:00:0${id}.000Z`, message, severity });

describe('control room alarms', () => {
  const events = [
    event('1', 'disconnector radial-ds1 open'),
    event('2', 'Breaker radial-cb tripped: live/earthed conflict'),
    event('3', 'F1 DS2 is locked open as a point of isolation.', 'alarm'),
    event('4', 'Scenario reset'),
    event('5', 'Operation blocked by scenario restrictions', 'warning')
  ];

  it('raises alarms for trips, alarms and warnings, but not routine operations', () => {
    expect(deriveAlarms(events, new Set()).map((alarm) => alarm.id)).toEqual(['5', '3', '2']);
  });

  it('ranks trips and faults above alarms above warnings', () => {
    const byId = new Map(deriveAlarms(events, new Set()).map((alarm) => [alarm.id, alarm.priority]));
    expect([byId.get('2'), byId.get('3'), byId.get('5')]).toEqual([1, 2, 3]);
  });

  it('tracks acknowledgement and reports the most urgent unacknowledged alarm', () => {
    expect(alarmSummary(deriveAlarms(events, new Set()))).toEqual({ total: 3, unacknowledged: 3, highest: 1 });
    expect(alarmSummary(deriveAlarms(events, new Set(['2'])))).toEqual({ total: 3, unacknowledged: 2, highest: 2 });
    expect(alarmSummary(deriveAlarms(events, new Set(['2', '3', '5'])))).toEqual({ total: 3, unacknowledged: 0, highest: undefined });
  });

  it('classifies events the same way the event log always has', () => {
    expect(eventSeverity(event('1', 'Fault applied: A-E'))).toBe('fault');
    expect(eventSeverity(event('1', 'Relay picked up'))).toBe('protection');
    expect(eventSeverity(event('1', 'circuit-breaker x closed'))).toBe('operation');
    expect(eventSeverity(event('1', 'anything', 'alarm'))).toBe('alarm');
  });
});

describe('alarms from real operations', () => {
  it('never raise a routine breaker operation as a fault, even when its id contains "fault"', async () => {
    const { migrateDrawingDocument } = await import('../schema/documentSchema');
    const { templateLibrary } = await import('../templates');
    const { extractTopology } = await import('../topology/extractTopology');
    const { operateDevice } = await import('../topology/operation');
    const doc = migrateDrawingDocument(templateLibrary.find((t) => t.id === 'example-earth-fault-trip')!.create())!;
    const opened = operateDevice(doc, extractTopology(doc), 'ex-earth-fault-cb').doc;
    expect(opened.operationEvents.at(-1)?.message).toMatch(/ex-earth-fault-cb open/);
    expect(deriveAlarms(opened.operationEvents, new Set())).toEqual([]);
  });
});
