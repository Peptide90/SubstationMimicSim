import type { ElectricalSymbol, Phase } from '../drawing/model';

/** Horizontal terminal span from symbol centre; must be a multiple of the default 20px grid. */
export const SWITCH_TERMINAL_SPAN = 40;

export interface SymbolTemplate {
  type: ElectricalSymbol['type'];
  displayName: string;
  defaultPhases: Phase[];
  defaultTerminals: Array<{ name: string; x: number; y: number }>;
}

export const SYMBOL_LIBRARY: SymbolTemplate[] = [
  { type: 'grid-connection', displayName: 'Grid Connection', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'grid', x: SWITCH_TERMINAL_SPAN, y: 0 }] },
  { type: 'circuit-breaker', displayName: 'Circuit Breaker', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: -SWITCH_TERMINAL_SPAN, y: 0 }, { name: 'out', x: SWITCH_TERMINAL_SPAN, y: 0 }] },
  { type: 'disconnector', displayName: 'Disconnector', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: -SWITCH_TERMINAL_SPAN, y: 0 }, { name: 'out', x: SWITCH_TERMINAL_SPAN, y: 0 }] },
  { type: 'earth-switch', displayName: 'Earth Switch', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: 0, y: 0 }] },
  { type: 'transformer', displayName: 'Transformer', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'hv', x: -40, y: 0 }, { name: 'lv', x: 40, y: 0 }] },
  { type: 'vt', displayName: 'Voltage Transformer (VT)', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'tap', x: 0, y: 20 }] },
  { type: 'ct', displayName: 'Current Transformer (CT)', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: -20, y: 0 }, { name: 'out', x: 20, y: 0 }] },
  { type: 'cable-sealing-end', displayName: 'Cable Sealing End', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'line', x: SWITCH_TERMINAL_SPAN, y: 0 }] },
  { type: 'line-end', displayName: 'Line End', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'line', x: -SWITCH_TERMINAL_SPAN, y: 0 }] },
  { type: 'busbar-coupler', displayName: 'Busbar Coupler', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'left', x: -SWITCH_TERMINAL_SPAN, y: 0 }, { name: 'right', x: SWITCH_TERMINAL_SPAN, y: 0 }] }
];

/** Teaching shortcuts kept out of the main palette. */
export const POWER_EXAMPLE_SYMBOLS: SymbolTemplate[] = [
  { type: 'source', displayName: 'Source / Incomer', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'out', x: 40, y: 0 }] },
  { type: 'load', displayName: 'Load / Feeder', defaultPhases: ['A', 'B', 'C'], defaultTerminals: [{ name: 'in', x: -40, y: 0 }] }
];
