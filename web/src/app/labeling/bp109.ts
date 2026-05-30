import type { NodeKind } from "../../core/model";
import bp109Schema from "../../schemas/labeling/ng-bp109.json";

import type {
  AnsiIecMeta,
  BP109Meta,
  CircuitType,
  Prefix,
  PurposeDigit,
  VoltageClass,
} from "./types";

export type { LabelScheme, LabelMode, BayType, BP109Meta, AnsiIecMeta, CircuitType, VoltageClass, PurposeDigit, Prefix } from "./types";

const ANSI_FUNCTION: Record<string, string> = {
  cb: "52",
  ds: "89",
  es: "09",
  tx: "T",
  ct: "CT",
  vt: "VT",
};

export function schemaDefaultPrefix(vc: VoltageClass): Prefix {
  const p = (bp109Schema as { voltageClasses?: Record<string, { prefix?: string }> }).voltageClasses?.[vc]?.prefix ?? "";
  if (p === "X" || p === "D") return p;
  return "";
}

export function voltageClassFromKv(kv: number): VoltageClass {
  const map = (bp109Schema as { defaultVoltageClassByKv?: Record<string, VoltageClass> }).defaultVoltageClassByKv ?? {};
  const exact = map[String(kv)];
  if (exact) return exact;
  if (kv >= 350) return "400";
  if (kv >= 200) return "275";
  if (kv >= 100) return "132";
  return "LV66";
}

export function defaultPurposeDigit(kind: NodeKind | string, circuitType: CircuitType): PurposeDigit {
  const purposeByKind = (bp109Schema as {
    purposeByKind?: Record<string, { default?: number } & Partial<Record<CircuitType | "busbarSide" | "reserveSide", number>>>;
  }).purposeByKind;
  const row = purposeByKind?.[kind];
  if (!row) return 0;
  const value = row[circuitType] ?? row.default ?? 0;
  return Math.max(0, Math.min(9, value)) as PurposeDigit;
}

export function defaultBp109Meta(kind: string): BP109Meta {
  const enabled = kind === "ds" || kind === "cb" || kind === "es";
  const circuitType: CircuitType = kind === "tx" ? "TX_HV" : "LINE";
  return {
    enabled,
    voltageClass: "400",
    prefix: "X",
    circuitType,
    circuitNumber: 1,
    purposeDigit: defaultPurposeDigit(kind, circuitType),
    suffixLetter: "",
  };
}

/**
 * BP109 label generation (NG/ET/BP_109 Appendix A10–A13):
 * - 400/HVDC: PREFIX + CIRCUIT_NUM + TYPE_DIGIT + PURPOSE (+suffix)
 * - 132:      CIRCUIT_NUM + TYPE_DIGIT + PURPOSE (+suffix)
 * - 275:      TYPE_LETTER + CIRCUIT_NUM + PURPOSE (+suffix)
 * - LV66:     CIRCUIT_NUM + TYPE_LETTER + PURPOSE (+suffix)
 */
export function computeBp109Label(meta: BP109Meta): string {
  const digitMap = (bp109Schema as { typeMaps?: { digitMap?: Record<string, number> } }).typeMaps?.digitMap ?? {};
  const letterMap = (bp109Schema as { typeMaps?: { letterMap?: Record<string, string> } }).typeMaps?.letterMap ?? {};

  const typeDigit = digitMap[meta.circuitType];
  const typeLetter = letterMap[meta.circuitType];

  const cnum = Math.max(0, Math.min(9, Math.floor(meta.circuitNumber)));
  const p = meta.purposeDigit;
  const suffix = (meta.suffixLetter ?? "").trim();

  const prefix = (meta.prefix ?? schemaDefaultPrefix(meta.voltageClass)) || "";

  if (meta.voltageClass === "400" || meta.voltageClass === "HVDC") {
    return `${prefix}${cnum}${typeDigit}${p}${suffix}`;
  }
  if (meta.voltageClass === "132") {
    return `${cnum}${typeDigit}${p}${suffix}`;
  }
  if (meta.voltageClass === "275") {
    return `${typeLetter}${cnum}${p}${suffix}`;
  }
  return `${cnum}${typeLetter}${p}${suffix}`;
}

export function defaultAnsiIecMeta(kind: string): AnsiIecMeta {
  return {
    enabled: kind === "cb" || kind === "ds" || kind === "es",
    functionCode: ANSI_FUNCTION[kind] ?? kind.toUpperCase(),
    bayNumber: 1,
    suffix: "",
  };
}

/** Placeholder ANSI/IEC tag until full scheme is implemented. */
export function computeAnsiIecLabel(meta: AnsiIecMeta): string {
  const suffix = (meta.suffix ?? "").trim();
  return suffix ? `${meta.functionCode}-${meta.bayNumber}${suffix}` : `${meta.functionCode}-${meta.bayNumber}`;
}

export function ansiFunctionForKind(kind: string): string {
  return ANSI_FUNCTION[kind] ?? kind.toUpperCase();
}
