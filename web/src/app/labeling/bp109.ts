import bp109Schema from "../../schemas/labeling/ng-bp109.json";

export type LabelScheme = "DEFAULT" | "NG_BP109";
export type LabelMode = "AUTO" | "FREEFORM";
export type BayType = "AUTO" | "BUS" | "LINE" | "TX";

export type VoltageClass = "400" | "275" | "132" | "LV66" | "HVDC";
export type Prefix = "" | "X" | "D";

export type CircuitType =
  | "LINE"
  | "TX_HV"
  | "MAIN_BUS_SEC"
  | "BUS_COUPLER"
  | "SERIES_REACTOR"
  | "SHUNT_COMP"
  | "RES_BUS_SEC"
  | "SPARE"
  | "TX_LV"
  | "GEN";

export type PurposeDigit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type BP109Meta = {
  enabled: boolean;
  voltageClass: VoltageClass;
  prefix?: Prefix;
  circuitType: CircuitType;
  circuitNumber: number; // 0-9
  purposeDigit: PurposeDigit;
  suffixLetter?: string;
};

export function schemaDefaultPrefix(vc: VoltageClass): Prefix {
  const p = (bp109Schema as any)?.voltageClasses?.[vc]?.prefix ?? "";
  if (p === "X" || p === "D") return p;
  return "";
}

export function defaultBp109Meta(kind: string): BP109Meta {
  const enabled = kind === "ds" || kind === "cb" || kind === "es";
  const purposeDigit: PurposeDigit = kind === "es" ? 1 : kind === "cb" ? 5 : 3;
  return {
    enabled,
    voltageClass: "400",
    prefix: "X",
    circuitType: "LINE",
    circuitNumber: 1,
    purposeDigit,
    suffixLetter: "",
  };
}

/**
 * BP109 label generation with your corrected ordering:
 * - 400/HVDC: PREFIX + CIRCUIT_NUM + TYPE_DIGIT + PURPOSE (+suffix)
 * - 132:      CIRCUIT_NUM + TYPE_DIGIT + PURPOSE (+suffix)
 * - 275:      TYPE_LETTER + CIRCUIT_NUM + PURPOSE (+suffix)
 * - LV66:     CIRCUIT_NUM + TYPE_LETTER + PURPOSE (+suffix)
 */
export function computeBp109Label(meta: BP109Meta): string {
  const digitMap = (bp109Schema as any).typeMaps?.digitMap ?? {};
  const letterMap = (bp109Schema as any).typeMaps?.letterMap ?? {};

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
