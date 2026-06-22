import type { ElectricalSymbol, PowerFlowMetadata } from '../drawing/model';

/** Positive MW/MVAR → export (source); negative → import (load). */
export function gridConnectionInjects(flow: PowerFlowMetadata | undefined): boolean {
  return (flow?.mw ?? 0) >= 0;
}

export function actsAsPowerSource(symbol: ElectricalSymbol): boolean {
  if (symbol.type === 'source') return true;
  if (symbol.type === 'grid-connection') return gridConnectionInjects(symbol.powerFlow);
  return false;
}

export function actsAsPowerLoad(symbol: ElectricalSymbol): boolean {
  if (symbol.type === 'load') return true;
  if (symbol.type === 'grid-connection') return !gridConnectionInjects(symbol.powerFlow);
  return false;
}

export function powerEndpointLabel(symbol: ElectricalSymbol): string {
  if (symbol.type === 'source') return 'Incomer';
  if (symbol.type === 'load') return 'Load';
  if (symbol.type === 'grid-connection') return gridConnectionInjects(symbol.powerFlow) ? 'Export' : 'Import';
  return symbol.type;
}
