import type { LabelScheme } from "./types";

export type LabelSchemeDefinition = {
  id: LabelScheme;
  label: string;
  description: string;
  available: boolean;
  reference?: string;
};

export const LABEL_SCHEMES: LabelSchemeDefinition[] = [
  {
    id: "DEFAULT",
    label: "Default",
    description: "Simple node labels from the drawing.",
    available: true,
  },
  {
    id: "NG_BP109",
    label: "UK / National Grid BP109",
    description: "NG/ET/BP_109 HV apparatus numbering and nomenclature.",
    available: true,
    reference: "NG/ET/BP_109 Issue 1",
  },
  {
    id: "ANSI_IEC",
    label: "ANSI / IEC",
    description: "ANSI device function numbers with IEC bay grouping (placeholder).",
    available: true,
    reference: "ANSI C37.2 / IEC 81346 (planned)",
  },
];

export function getSchemeDefinition(id: LabelScheme): LabelSchemeDefinition {
  return LABEL_SCHEMES.find((s) => s.id === id) ?? LABEL_SCHEMES[0];
}
