import type { RelayFunctionType, RelayOutputActionType } from '../drawing/model';

/**
 * Labelling conventions for secondary devices, switchable on every generated
 * sheet (decision 5.11).
 *
 * The model stores what a device *is* — its role — and never a label. A sheet
 * resolves the label for the active convention when it draws, so changing
 * convention can never change what is simulated.
 *
 * Entries are data. A convention is offered only once it covers every role a
 * sheet can show; until then it is listed but unavailable rather than filled
 * with guesses.
 */
export type SecondaryConvention = 'plain' | 'ansi' | 'iec' | 'ng';

export interface ConventionDefinition {
  id: SecondaryConvention;
  label: string;
  description: string;
  reference?: string;
}

export const secondaryConventions: Record<SecondaryConvention, ConventionDefinition> = {
  plain: { id: 'plain', label: 'Plain', description: 'Descriptive names, no device codes.' },
  ansi: { id: 'ansi', label: 'ANSI', description: 'ANSI/IEEE device function numbers.', reference: 'IEEE C37.2' },
  iec: { id: 'iec', label: 'IEC', description: 'IEC 60617 function symbols with IEC 61850 logical node names; IEC 81346-2 codes for circuit devices.', reference: 'IEC 60617 / IEC 61850-7-4 / IEC 81346-2' },
  ng: { id: 'ng', label: 'National Grid', description: 'National Grid secondary device conventions.', reference: 'To be supplied' }
};

export const conventionOrder: SecondaryConvention[] = ['plain', 'ansi', 'iec', 'ng'];

/** Every kind of secondary device or signal a sheet can show. */
export type DeviceRole = RelayFunctionType | `output:${RelayOutputActionType}` | 'breaker-fail-backup' | CircuitRole;

/** Devices on trip and close circuits (secondary/ladder.ts). */
export type CircuitRole =
  | 'aux-a' | 'aux-b' | 'trip-coil' | 'close-coil' | 'local-remote' | 'local-control' | 'remote-control'
  | 'mcb' | 'dc-supply' | 'relay-trip-contact' | 'lockout-contact';

export interface DeviceLabel {
  /** The convention's code, e.g. "51", "I>". Absent in plain. */
  code?: string;
  name: string;
}

interface Entry {
  plain: string;
  ansi?: DeviceLabel;
  iec?: DeviceLabel;
  ng?: DeviceLabel;
}

const table: Record<DeviceRole, Entry> = {
  overcurrent: { plain: 'Overcurrent', ansi: { code: '51', name: 'Time overcurrent' }, iec: { code: 'I>', name: 'PTOC' } },
  'earth-fault': { plain: 'Earth fault', ansi: { code: '51N', name: 'Earth fault overcurrent' }, iec: { code: 'IE>', name: 'PTOC' } },
  'directional-overcurrent': { plain: 'Directional overcurrent', ansi: { code: '67', name: 'Directional overcurrent' }, iec: { code: 'I>→', name: 'PTOC + RDIR' } },
  'directional-earth-fault': { plain: 'Directional earth fault', ansi: { code: '67N', name: 'Directional earth fault' }, iec: { code: 'IE>→', name: 'PTOC + RDIR' } },
  overvoltage: { plain: 'Overvoltage', ansi: { code: '59', name: 'Overvoltage' }, iec: { code: 'U>', name: 'PTOV' } },
  undervoltage: { plain: 'Undervoltage', ansi: { code: '27', name: 'Undervoltage' }, iec: { code: 'U<', name: 'PTUV' } },
  'thermal-overload': { plain: 'Thermal overload', ansi: { code: '49', name: 'Thermal' }, iec: { code: 'θ>', name: 'PTTR' } },
  differential: { plain: 'Differential', ansi: { code: '87', name: 'Differential' }, iec: { code: 'Id>', name: 'PDIF' } },
  'restricted-earth-fault': { plain: 'Restricted earth fault', ansi: { code: '87N', name: 'Restricted earth fault' }, iec: { code: 'IdN>', name: 'PDIF' } },
  'breaker-fail': { plain: 'Breaker fail', ansi: { code: '50BF', name: 'Breaker failure' }, iec: { code: 'CBF', name: 'RBRF' } },
  intertrip: { plain: 'Intertrip', ansi: { code: '85', name: 'Pilot communications' }, iec: { code: 'IT', name: 'PSCH' } },
  'trip-circuit-supervision': { plain: 'Trip circuit supervision', ansi: { code: '74TC', name: 'Trip circuit supervision' }, iec: { code: 'TCS', name: 'Trip circuit supervision' } },
  'output:trip-open-breaker': { plain: 'Trip', ansi: { code: '94', name: 'Tripping relay' }, iec: { code: 'PTRC', name: 'Trip' } },
  'output:apply-lockout': { plain: 'Lockout', ansi: { code: '86', name: 'Lockout relay' }, iec: { name: 'Lockout' } },
  'output:alarm': { plain: 'Alarm', ansi: { code: '74', name: 'Alarm relay' }, iec: { code: 'CALH', name: 'Alarm' } },
  'output:block-close': { plain: 'Block close', ansi: { name: 'Block close' }, iec: { name: 'Block close' } },
  'output:clear-auto-reset': { plain: 'Clear auto-reset', ansi: { name: 'Clear auto-reset' }, iec: { name: 'Clear auto-reset' } },
  'output:trigger-backup-relay': { plain: 'Start backup', ansi: { name: 'Start backup' }, iec: { name: 'Start backup' } },
  'breaker-fail-backup': { plain: 'Breaker fail backup trip', ansi: { code: '50BF', name: 'Backup trip' }, iec: { code: 'RBRF', name: 'Backup trip' } },
  // Circuit devices. IEC codes are IEC 81346-2 class letters.
  'aux-a': { plain: 'CB closed contact', ansi: { code: '52a', name: 'CB auxiliary (NO)' }, iec: { code: '-QA', name: 'Aux NO' } },
  'aux-b': { plain: 'CB open contact', ansi: { code: '52b', name: 'CB auxiliary (NC)' }, iec: { code: '-QA', name: 'Aux NC' } },
  'trip-coil': { plain: 'Trip coil', ansi: { code: '52TC', name: 'Trip coil' }, iec: { code: '-MB1', name: 'Trip coil' } },
  'close-coil': { plain: 'Close coil', ansi: { code: '52CC', name: 'Close coil' }, iec: { code: '-MB2', name: 'Close coil' } },
  'local-remote': { plain: 'Local/Remote selector', ansi: { code: '43LR', name: 'Local/Remote' }, iec: { code: '-SF1', name: 'Local/Remote' } },
  'local-control': { plain: 'Local control switch', ansi: { code: '52CS', name: 'Control switch' }, iec: { code: '-SF2', name: 'Control switch' } },
  'remote-control': { plain: 'Remote control (SCADA)', ansi: { code: 'RTU', name: 'Remote control output' }, iec: { code: '-KF', name: 'Remote control' } },
  mcb: { plain: 'Supply MCB', ansi: { code: '72', name: 'DC circuit breaker' }, iec: { code: '-FC', name: 'MCB' } },
  'dc-supply': { plain: 'DC supply', ansi: { code: 'DC', name: 'Station battery' }, iec: { code: '-GB', name: 'Battery' } },
  'relay-trip-contact': { plain: 'Relay trip contact', ansi: { code: '94', name: 'Trip contact' }, iec: { code: '-KF', name: 'Trip contact' } },
  'lockout-contact': { plain: 'Lockout contact', ansi: { code: '86', name: 'Lockout (NC)' }, iec: { code: '-KF', name: 'Lockout NC' } }
};

export const deviceRoles = Object.keys(table) as DeviceRole[];

/** A convention is offered only when it labels every role a sheet can show. */
export function isConventionAvailable(convention: SecondaryConvention): boolean {
  if (convention === 'plain') return true;
  return deviceRoles.every((role) => Boolean(table[role][convention]));
}

/** The label for a role. A convention that is not yet complete falls back to plain names. */
export function deviceLabel(role: DeviceRole, convention: SecondaryConvention = 'plain'): DeviceLabel {
  const entry = table[role];
  if (convention === 'plain' || !isConventionAvailable(convention)) return { name: entry.plain };
  return entry[convention] ?? { name: entry.plain };
}

/** One line for a sheet block: "51 Time overcurrent", "I> PTOC", or "Overcurrent". */
export function formatDeviceLabel(role: DeviceRole, convention: SecondaryConvention = 'plain'): string {
  const label = deviceLabel(role, convention);
  return label.code ? `${label.code} ${label.name}` : label.name;
}
