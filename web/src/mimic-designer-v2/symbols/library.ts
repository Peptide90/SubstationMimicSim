import type { ElectricalSymbol, Phase } from '../drawing/model';

export interface SymbolTemplate {
  type: ElectricalSymbol['type'];
  displayName: string;
  defaultPhases: Phase[];
  defaultTerminals: Array<{ name: string; x: number; y: number }>;
}

export const SYMBOL_LIBRARY: SymbolTemplate[] = [
  { type: 'source', displayName: 'Source / Incomer', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'out', x: 40, y: 0 }] },
  { type: 'load', displayName: 'Load / Feeder', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: -40, y: 0 }] },
  { type: 'circuit-breaker', displayName: 'Circuit Breaker', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: -30, y: 0 }, { name: 'out', x: 30, y: 0 }] },
  { type: 'disconnector', displayName: 'Disconnector', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: -30, y: 0 }, { name: 'out', x: 30, y: 0 }] },
  { type: 'earth-switch', displayName: 'Earth Switch', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: 0, y: 0 }, { name: 'earth', x: 0, y: 30 }] },
  { type: 'transformer', displayName: 'Transformer', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'hv', x: -40, y: 0 }, { name: 'lv', x: 40, y: 0 }] },
  { type: 'vt', displayName: 'Voltage Transformer (VT)', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'tap', x: 0, y: 20 }] },
  { type: 'ct', displayName: 'Current Transformer (CT)', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: -20, y: 0 }, { name: 'out', x: 20, y: 0 }] },
  { type: 'cable-sealing-end', displayName: 'Cable Sealing End', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'line', x: 30, y: 0 }] },
  { type: 'line-end', displayName: 'Line End', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'line', x: -30, y: 0 }] },
  { type: 'busbar-coupler', displayName: 'Busbar Coupler', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'left', x: -30, y: 0 }, { name: 'right', x: 30, y: 0 }] }
];
