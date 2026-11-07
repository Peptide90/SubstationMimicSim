import { useEffect, useState } from 'react';
import type { ElectricalSymbol } from '../../drawing/model';
import type { Alarm, AlarmPriority } from '../../operate/alarms';

const priorityLabel: Record<AlarmPriority, string> = { 1: 'URGENT', 2: 'ALARM', 3: 'WARN' };
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The control room's banner: where you are, the time, and how many alarms are waiting. */
export function ControlRoomStatusBar({ site, unacknowledged, highest }: { site: string; unacknowledged: number; highest?: AlarmPriority }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <header className='mimic-v2-hmi-status' aria-label='Control room status'>
      <strong>{site.toUpperCase()}</strong>
      <span>CONTROL ROOM VIEW</span>
      <span className={`mimic-v2-hmi-alarm-count ${highest ? `p${highest}` : 'clear'}`}>
        {unacknowledged ? `${unacknowledged} UNACKNOWLEDGED ALARM${unacknowledged === 1 ? '' : 'S'}` : 'NO UNACKNOWLEDGED ALARMS'}
      </span>
      <time>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
    </header>
  );
}

/** Alarms, newest first. Unacknowledged ones stand out until an operator accepts them. */
export function AlarmList({ alarms, nameOf, onAcknowledge, onAcknowledgeAll }: {
  alarms: Alarm[];
  nameOf: (id?: string) => string;
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
}) {
  const waiting = alarms.filter((alarm) => !alarm.acknowledged).length;
  return (
    <section className='mimic-v2-hmi-alarms' aria-label='Alarm list'>
      <header>
        <strong>ALARMS</strong>
        <button type='button' disabled={!waiting} onClick={onAcknowledgeAll}>ACK ALL ({waiting})</button>
      </header>
      <div className='mimic-v2-hmi-alarm-rows'>
        {alarms.length ? alarms.slice(0, 60).map((alarm) => (
          <button key={alarm.id} type='button' className={`mimic-v2-hmi-alarm p${alarm.priority} ${alarm.acknowledged ? 'acked' : 'unacked'}`} title={alarm.acknowledged ? 'Acknowledged' : 'Click to acknowledge'} onClick={() => onAcknowledge(alarm.id)}>
            <span>{clock(alarm.time)}</span>
            <b>{priorityLabel[alarm.priority]}</b>
            <em>{nameOf(alarm.source)}</em>
            <span>{alarm.text}</span>
          </button>
        )) : <p>No alarms.</p>}
      </div>
    </section>
  );
}

/**
 * Select-before-operate: choose the device, choose the action, then execute.
 * Nothing moves on a single click, as in a real control system.
 */
export function ControlPanel({ symbol, result, onExecute, onClose }: {
  symbol: ElectricalSymbol;
  result?: string;
  onExecute: () => void;
  onClose: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const state = symbol.operation?.switchState ?? 'open';
  const action = state === 'closed' ? 'OPEN' : 'CLOSE';
  const name = symbol.label?.text?.trim() || symbol.id;
  return (
    <section className='mimic-v2-hmi-control' aria-label={`Control ${name}`}>
      <header>
        <strong>{name}</strong>
        <button type='button' aria-label='Deselect' onClick={onClose}>×</button>
      </header>
      <dl>
        <dt>Type</dt><dd>{symbol.type.replace(/-/g, ' ').toUpperCase()}</dd>
        <dt>Indication</dt><dd className={state}>{state.toUpperCase()}</dd>
        {symbol.operation?.isolation && <><dt>Lock</dt><dd className='locked'>{symbol.operation.isolation.kind === 'point-of-isolation' ? 'LOCKED OPEN' : 'LOCKED EARTH'}</dd></>}
        {symbol.operation?.lockout && <><dt>Status</dt><dd className='locked'>TRIPPED — LOCKOUT</dd></>}
      </dl>
      {!armed ? (
        <button type='button' className='mimic-v2-hmi-action' onClick={() => setArmed(true)}>SELECT {action}</button>
      ) : (
        <div className='mimic-v2-hmi-confirm'>
          <span>{action} {name}?</span>
          <button type='button' className='mimic-v2-hmi-execute' onClick={() => { onExecute(); setArmed(false); }}>EXECUTE</button>
          <button type='button' onClick={() => setArmed(false)}>CANCEL</button>
        </div>
      )}
      {result && <p className='mimic-v2-hmi-result'>{result}</p>}
    </section>
  );
}
