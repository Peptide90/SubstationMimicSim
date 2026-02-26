export type AgeBand = 'A' | 'B' | 'C';

export type NodeType = 'substation' | 'generator' | 'load' | 'interconnector';
export type VoltageClass = 132 | 275 | 400;

export interface GridNode {
  id: string;
  name: string;
  type: NodeType;
  lngLat: [number, number];
  baseMw: number;
  co2Intensity?: number;
}

export interface Corridor {
  id: string;
  from: string;
  to: string;
  thermalLimitMw: number;
  voltageClass: VoltageClass;
  outOfService?: boolean;
}

export type ActionType = 'dispatch' | 'reroute' | 'toggle-interconnector';

export interface AllowedAction {
  id: string;
  label: string;
  type: ActionType;
  payload: Record<string, number | string | boolean>;
}

export interface PauseTrigger {
  id: string;
  atSecond: number;
  message: string;
  allowedActions: AllowedAction[];
}

export interface ScriptedEvent {
  id: string;
  atSecond: number;
  log: string;
  updates?: {
    nodeDeltasMw?: Record<string, number>;
    corridorOutages?: Record<string, boolean>;
  };
}

export interface Objective {
  id: string;
  text: string;
  metric: 'co2' | 'frequency' | 'corridorLoading' | 'imports';
  target: number;
  comparator: 'lte' | 'gte';
}

export interface Scenario {
  id: string;
  title: string;
  regionId: string;
  durationSec: number;
  ageBand: AgeBand;
  description: string;
  network: {
    nodes: GridNode[];
    corridors: Corridor[];
  };
  events: ScriptedEvent[];
  pauses: PauseTrigger[];
  objectives: Objective[];
}
