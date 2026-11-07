import type { ElectricalSymbol, OperationEvent, ScenarioEventSeverity } from '../drawing/model';

/**
 * The control room's alarm list. In Phase A it is fed by the operation event
 * log; later phases raise alarms from the secondary systems themselves.
 */

export function eventSeverity(event: OperationEvent): ScenarioEventSeverity {
  if (event.severity) return event.severity;
  const message = event.message.toLowerCase();
  if (message.includes('fault')) return 'fault';
  if (message.includes('trip') || message.includes('relay') || message.includes('protection')) return 'protection';
  if (message.includes('warning') || message.includes('mismatch') || message.includes('blocked')) return 'warning';
  if (message.includes('scenario') || message.includes('hint')) return 'scenario';
  if (message.includes('closed') || message.includes('open') || message.includes('operated')) return 'operation';
  return 'info';
}

/** 1 is most urgent. */
export type AlarmPriority = 1 | 2 | 3;

export interface Alarm {
  id: string;
  time: string;
  priority: AlarmPriority;
  severity: ScenarioEventSeverity;
  text: string;
  source?: string;
  acknowledged: boolean;
}

const priorityOf = (severity: ScenarioEventSeverity): AlarmPriority | undefined => {
  if (severity === 'fault' || severity === 'protection') return 1;
  if (severity === 'alarm') return 2;
  if (severity === 'warning') return 3;
  return undefined;
};

/** Events that would raise an alarm in a control room, newest first. Routine operations do not. */
export function deriveAlarms(events: OperationEvent[], acknowledged: ReadonlySet<string>): Alarm[] {
  const alarms: Alarm[] = [];
  for (const event of events) {
    const severity = eventSeverity(event);
    const priority = priorityOf(severity);
    if (!priority) continue;
    alarms.push({ id: event.id, time: event.timestamp, priority, severity, text: event.message, source: event.targetObjectId ?? event.source, acknowledged: acknowledged.has(event.id) });
  }
  return alarms.reverse();
}

export function alarmSummary(alarms: Alarm[]) {
  const unacknowledged = alarms.filter((alarm) => !alarm.acknowledged);
  return {
    total: alarms.length,
    unacknowledged: unacknowledged.length,
    /** Most urgent priority still waiting for acknowledgement, if any. */
    highest: unacknowledged.reduce<AlarmPriority | undefined>((top, alarm) => (top === undefined || alarm.priority < top ? alarm.priority : top), undefined)
  };
}

const controllable = new Set<ElectricalSymbol['type']>(['circuit-breaker', 'disconnector', 'earth-switch', 'busbar-coupler']);

/** Devices the control room can operate. Sources and loads are not switched from here. */
export const isControllable = (symbol?: ElectricalSymbol) => Boolean(symbol && controllable.has(symbol.type));
