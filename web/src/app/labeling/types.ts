export type LabelScheme = "DEFAULT" | "NG_BP109" | "ANSI_IEC";

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

export type BusbarRole = 'main' | 'reserve' | 'main-1' | 'reserve-1' | 'main-2' | 'reserve-2';

export type Bp109CircuitTypeOverride = CircuitType | 'AUTO';

export type PurposeDigit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type BP109Meta = {
  enabled: boolean;
  voltageClass: VoltageClass;
  prefix?: Prefix;
  circuitType: CircuitType;
  circuitNumber: number;
  purposeDigit: PurposeDigit;
  suffixLetter?: string;
};

export type AnsiIecMeta = {
  enabled: boolean;
  functionCode: string;
  bayNumber: number;
  suffix?: string;
};

export type LabelingContext = {
  labelScheme: LabelScheme;
  labelMode: LabelMode;
  labelOverrides: Record<string, string>;
  bayTypeOverrides: Record<string, BayType>;
  bp109MetaById: Record<string, Partial<BP109Meta>>;
  ansiIecMetaById: Record<string, Partial<AnsiIecMeta>>;
  substationVoltageKv?: number;
};
