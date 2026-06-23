import bp109Schema from '../../schemas/labeling/ng-bp109.json';
import type { BP109Meta, CircuitType, PurposeDigit, VoltageClass } from '../../app/labeling/types';

const digitMap = (bp109Schema as { typeMaps?: { digitMap?: Record<string, number> } }).typeMaps?.digitMap ?? {};
const letterMap = (bp109Schema as { typeMaps?: { letterMap?: Record<string, string> } }).typeMaps?.letterMap ?? {};

const circuitTypeByDigit = Object.fromEntries(Object.entries(digitMap).map(([type, digit]) => [String(digit), type as CircuitType]));
const circuitTypeByLetter = Object.fromEntries(Object.entries(letterMap).map(([type, letter]) => [letter, type as CircuitType]));

function clampCircuitNumber(value: string | number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9) return null;
  return parsed;
}

export function parseLineCircuitNumber(text: string): number | null {
  const trimmed = text.trim();
  const named = trimmed.match(/^(?:line|feeder|circuit|bay)\s*#?\s*(\d+)/i);
  if (named) return clampCircuitNumber(named[1]!);
  if (/^\d{1,2}$/.test(trimmed)) return clampCircuitNumber(trimmed);
  return null;
}

export function looksLikeBp109Label(text: string, voltageClass: VoltageClass): boolean {
  return parseBp109Label(text, voltageClass) !== null;
}

export function parseBp109Label(text: string, voltageClass: VoltageClass): Partial<BP109Meta> | null {
  const trimmed = text.trim().toUpperCase();
  if (!trimmed) return null;

  if (voltageClass === '400' || voltageClass === 'HVDC') {
    const prefix = voltageClass === 'HVDC' ? 'D' : 'X';
    const match = trimmed.match(new RegExp(`^${prefix}(\\d)(\\d)(\\d)([A-Z]?)$`));
    if (!match) return null;
    return {
      enabled: true,
      voltageClass,
      prefix: prefix as BP109Meta['prefix'],
      circuitNumber: Number(match[1]),
      circuitType: circuitTypeByDigit[match[2]] ?? 'LINE',
      purposeDigit: Number(match[3]) as PurposeDigit,
      suffixLetter: match[4] ?? ''
    };
  }

  if (voltageClass === '132') {
    const match = trimmed.match(/^(\d)(\d)(\d)([A-Z]?)$/);
    if (!match) return null;
    return {
      enabled: true,
      voltageClass,
      circuitNumber: Number(match[1]),
      circuitType: circuitTypeByDigit[match[2]] ?? 'LINE',
      purposeDigit: Number(match[3]) as PurposeDigit,
      suffixLetter: match[4] ?? ''
    };
  }

  if (voltageClass === '275') {
    const match = trimmed.match(/^([A-Z])(\d)(\d)([A-Z]?)$/);
    if (!match) return null;
    return {
      enabled: true,
      voltageClass,
      circuitType: circuitTypeByLetter[match[1]] ?? 'LINE',
      circuitNumber: Number(match[2]),
      purposeDigit: Number(match[3]) as PurposeDigit,
      suffixLetter: match[4] ?? ''
    };
  }

  const lvMatch = trimmed.match(/^(\d)([A-Z])(\d)([A-Z]?)$/);
  if (!lvMatch) return null;
  return {
    enabled: true,
    voltageClass,
    circuitNumber: Number(lvMatch[1]),
    circuitType: circuitTypeByLetter[lvMatch[2]] ?? 'LINE',
    purposeDigit: Number(lvMatch[3]) as PurposeDigit,
    suffixLetter: lvMatch[4] ?? ''
  };
}
