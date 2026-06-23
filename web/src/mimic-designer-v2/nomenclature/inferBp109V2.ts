import type { DrawingDocument, ElectricalSymbol } from '../drawing/model';
import { extractTopology } from '../topology/extractTopology';
import { computeBp109Label, defaultPurposeDigit, schemaDefaultPrefix, voltageClassFromKv } from '../../app/labeling/bp109';
import type { BusbarRole, BP109Meta, CircuitType, PurposeDigit } from '../../app/labeling/types';
import { parseBp109Label, parseLineCircuitNumber } from './parseBp109';

const SWITCH_TYPES = new Set<ElectricalSymbol['type']>(['circuit-breaker', 'disconnector', 'earth-switch']);
const ENDPOINT_TYPES = new Set<ElectricalSymbol['type']>(['grid-connection', 'line-end', 'load', 'source', 'transformer']);

function symbolKind(type: ElectricalSymbol['type']): string {
  if (type === 'circuit-breaker') return 'cb';
  if (type === 'disconnector') return 'ds';
  if (type === 'earth-switch') return 'es';
  if (type === 'transformer') return 'tx';
  if (type === 'ct') return 'ct';
  if (type === 'vt') return 'vt';
  return type;
}

function defaultPurposeFor(kind: string, circuitType: CircuitType, role?: BusbarRole): PurposeDigit {
  if (kind === 'cb') return defaultPurposeDigit('cb', circuitType);
  if (kind === 'es') return defaultPurposeDigit('es', circuitType);
  if (kind === 'ds' && role) {
    if (role.includes('main')) return 4;
    if (role.includes('reserve')) return 6;
  }
  return defaultPurposeDigit('ds', circuitType);
}

function substationVoltageKv(doc: DrawingDocument): number {
  return doc.voltageLevels[0] ?? doc.objects.symbols.find((symbol) => symbol.voltageLevelKv)?.voltageLevelKv ?? 400;
}

function buildSymbolAdjacency(doc: DrawingDocument): Map<string, Set<string>> {
  const graph = extractTopology(doc);
  const symbolIds = new Set(doc.objects.symbols.map((symbol) => symbol.id));
  const pathIds = new Set([
    ...doc.objects.busbars.map((path) => path.id),
    ...doc.objects.conductors.map((path) => path.id)
  ]);
  const objectsAtNode = new Map<string, Set<string>>();

  const touch = (nodeId: string, objectId: string) => {
    const set = objectsAtNode.get(nodeId) ?? new Set<string>();
    set.add(objectId);
    objectsAtNode.set(nodeId, set);
  };

  graph.branches.forEach((branch) => {
    if (!branch.objectId) return;
    touch(branch.fromNodeId, branch.objectId);
    touch(branch.toNodeId, branch.objectId);
  });

  const adjacency = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (a === b) return;
    const left = adjacency.get(a) ?? new Set<string>();
    const right = adjacency.get(b) ?? new Set<string>();
    left.add(b);
    right.add(a);
    adjacency.set(a, left);
    adjacency.set(b, right);
  };

  objectsAtNode.forEach((objects) => {
    const list = [...objects];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        connect(list[i]!, list[j]!);
      }
    }
  });

  const expandThroughPaths = (startId: string, visited: Set<string>) => {
    const queue = [startId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        if (pathIds.has(neighbor)) queue.push(neighbor);
      }
    }
  };

  const symbolAdjacency = new Map<string, Set<string>>();
  symbolIds.forEach((symbolId) => {
    const visited = new Set<string>([symbolId]);
    expandThroughPaths(symbolId, visited);
    const neighbors = new Set<string>();
    visited.forEach((id) => {
      if (symbolIds.has(id) && id !== symbolId) neighbors.add(id);
    });
    symbolAdjacency.set(symbolId, neighbors);
  });

  return symbolAdjacency;
}

function verticalBaySymbols(endpoint: ElectricalSymbol, doc: DrawingDocument): Set<string> {
  const tolerance = 36;
  const ids = new Set<string>();
  doc.objects.symbols.forEach((symbol) => {
    if (Math.abs(symbol.position.x - endpoint.position.x) > tolerance) return;
    if (symbol.position.y < endpoint.position.y - 20) return;
    if (SWITCH_TYPES.has(symbol.type) || symbol.type === 'ct' || symbol.type === 'vt') ids.add(symbol.id);
  });
  return ids;
}

function collectBaySymbols(startId: string, doc: DrawingDocument, adjacency: Map<string, Set<string>>): Set<string> {
  const endpoints = new Set(doc.objects.symbols.filter((symbol) => ENDPOINT_TYPES.has(symbol.type)).map((symbol) => symbol.id));
  const symbolById = new Map(doc.objects.symbols.map((symbol) => [symbol.id, symbol]));
  const visited = new Set<string>();
  const queue = [startId];
  const bay = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const symbol = symbolById.get(id);
    if (!symbol) continue;
    if (SWITCH_TYPES.has(symbol.type) || symbol.type === 'ct' || symbol.type === 'vt') bay.add(id);
    if (endpoints.has(id) && id !== startId) continue;
    for (const neighbor of adjacency.get(id) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return bay;
}

function classifyCircuitType(symbolId: string, doc: DrawingDocument, adjacency: Map<string, Set<string>>): CircuitType {
  const symbol = doc.objects.symbols.find((item) => item.id === symbolId);
  const override = symbol?.engineering?.bp109?.circuitType;
  if (override && override !== 'AUTO') return override as CircuitType;

  const neighbors = [...(adjacency.get(symbolId) ?? [])];
  const neighborSymbols = neighbors.map((id) => doc.objects.symbols.find((item) => item.id === id)).filter(Boolean) as ElectricalSymbol[];
  if (neighborSymbols.some((item) => item.type === 'transformer')) return 'TX_HV';
  if (neighborSymbols.some((item) => ENDPOINT_TYPES.has(item.type))) return 'LINE';

  const busbarTouches = countReachableBusbars(symbolId, doc, adjacency);
  if (busbarTouches >= 3) return 'MAIN_BUS_SEC';
  if (busbarTouches >= 2) return 'BUS_COUPLER';
  return 'LINE';
}

function countReachableBusbars(symbolId: string, doc: DrawingDocument, adjacency: Map<string, Set<string>>): number {
  const busbarIds = new Set(doc.objects.busbars.map((busbar) => busbar.id));
  const visited = new Set<string>([symbolId]);
  const queue = [symbolId];
  const found = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      if (busbarIds.has(neighbor)) found.add(neighbor);
      queue.push(neighbor);
    }
  }

  return found.size;
}

function nearestBusbarRole(symbol: ElectricalSymbol, doc: DrawingDocument, adjacency: Map<string, Set<string>>): BusbarRole | undefined {
  const busbarById = new Map(doc.objects.busbars.map((busbar) => [busbar.id, busbar]));
  const visited = new Set<string>([symbol.id]);
  const queue = [symbol.id];
  let best: { role: BusbarRole; distance: number } | undefined;

  while (queue.length) {
    const current = queue.shift()!;
    const depth = current === symbol.id ? 0 : 1;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      const busbar = busbarById.get(neighbor);
      if (busbar?.engineering?.busbarRole) {
        if (!best || depth < best.distance) best = { role: busbar.engineering.busbarRole, distance: depth };
      }
      queue.push(neighbor);
    }
  }

  return best?.role;
}

function anchorMetaForSymbol(symbol: ElectricalSymbol, voltageClass: ReturnType<typeof voltageClassFromKv>): Partial<BP109Meta> | null {
  const engineering = symbol.engineering?.bp109;
  if (engineering?.circuitNumber !== undefined || engineering?.circuitType) {
    return {
      enabled: true,
      voltageClass,
      prefix: engineering.prefix ?? schemaDefaultPrefix(voltageClass),
      circuitType: engineering.circuitType && engineering.circuitType !== 'AUTO' ? engineering.circuitType : undefined,
      circuitNumber: engineering.circuitNumber,
      purposeDigit: engineering.purposeDigit,
      suffixLetter: engineering.suffixLetter ?? ''
    };
  }

  if (!symbol.label?.text) return null;
  const parsed = parseBp109Label(symbol.label.text, voltageClass);
  if (parsed) return parsed;

  if (symbol.type === 'grid-connection' || symbol.type === 'line-end' || symbol.type === 'load') {
    const circuitNumber = parseLineCircuitNumber(symbol.label.text);
    if (circuitNumber !== null) {
      return {
        enabled: true,
        voltageClass,
        prefix: schemaDefaultPrefix(voltageClass),
        circuitType: engineering?.circuitType && engineering.circuitType !== 'AUTO' ? engineering.circuitType : 'LINE',
        circuitNumber
      };
    }
  }

  return null;
}

function isAnchorSymbol(symbol: ElectricalSymbol, voltageClass: ReturnType<typeof voltageClassFromKv>): boolean {
  if (symbol.engineering?.bp109?.circuitNumber !== undefined) return true;
  if (symbol.engineering?.bp109?.circuitType && symbol.engineering.bp109.circuitType !== 'AUTO') return true;
  if (!symbol.label?.text || !symbol.label.manualOverride) return false;
  if (parseBp109Label(symbol.label.text, voltageClass)) return true;
  if ((symbol.type === 'grid-connection' || symbol.type === 'line-end' || symbol.type === 'load') && parseLineCircuitNumber(symbol.label.text) !== null) return true;
  return false;
}

export function inferBp109MetaForDocument(doc: DrawingDocument): Record<string, BP109Meta> {
  const voltageClass = voltageClassFromKv(substationVoltageKv(doc));
  const prefix = schemaDefaultPrefix(voltageClass);
  const adjacency = buildSymbolAdjacency(doc);
  const result: Record<string, BP109Meta> = {};
  const bayMeta = new Map<string, Partial<BP109Meta>>();

  const endpoints = doc.objects.symbols.filter((symbol) => symbol.type === 'grid-connection' || symbol.type === 'line-end' || symbol.type === 'load' || symbol.type === 'source');
  endpoints.forEach((endpoint) => {
    const topologyBay = collectBaySymbols(endpoint.id, doc, adjacency);
    const columnBay = verticalBaySymbols(endpoint, doc);
    const bay = new Set([...topologyBay, ...columnBay]);
    const anchor = anchorMetaForSymbol(endpoint, voltageClass);
    if (!anchor) return;
    bay.forEach((symbolId) => {
      const existing = bayMeta.get(symbolId) ?? {};
      bayMeta.set(symbolId, {
        ...existing,
        circuitNumber: anchor.circuitNumber ?? existing.circuitNumber,
        circuitType: anchor.circuitType ?? existing.circuitType,
        purposeDigit: existing.purposeDigit
      });
    });
    if (anchor.circuitNumber !== undefined) {
      bayMeta.set(endpoint.id, { ...bayMeta.get(endpoint.id), circuitNumber: anchor.circuitNumber, circuitType: anchor.circuitType });
    }
  });

  doc.objects.symbols.forEach((symbol) => {
    if (!SWITCH_TYPES.has(symbol.type) && symbol.type !== 'ct' && symbol.type !== 'vt') return;
    const anchor = anchorMetaForSymbol(symbol, voltageClass);
    if (!anchor || !isAnchorSymbol(symbol, voltageClass)) return;
    collectBaySymbols(symbol.id, doc, adjacency).forEach((symbolId) => {
      const existing = bayMeta.get(symbolId) ?? {};
      bayMeta.set(symbolId, {
        ...existing,
        circuitNumber: anchor.circuitNumber ?? existing.circuitNumber,
        circuitType: anchor.circuitType ?? existing.circuitType,
        purposeDigit: anchor.purposeDigit ?? existing.purposeDigit
      });
    });
    verticalBaySymbols(symbol, doc).forEach((symbolId) => {
      const existing = bayMeta.get(symbolId) ?? {};
      bayMeta.set(symbolId, {
        ...existing,
        circuitNumber: anchor.circuitNumber ?? existing.circuitNumber,
        circuitType: anchor.circuitType ?? existing.circuitType,
        purposeDigit: anchor.purposeDigit ?? existing.purposeDigit
      });
    });
  });

  const switchSymbols = doc.objects.symbols.filter((symbol) => SWITCH_TYPES.has(symbol.type) || symbol.type === 'ct' || symbol.type === 'vt');
  const circuitTypeBySymbol = new Map<string, CircuitType>();
  switchSymbols.forEach((symbol) => {
    const hinted = bayMeta.get(symbol.id)?.circuitType;
    circuitTypeBySymbol.set(symbol.id, hinted ?? classifyCircuitType(symbol.id, doc, adjacency));
  });

  const circuitNumbers = assignCircuitNumbers(switchSymbols, circuitTypeBySymbol, bayMeta, adjacency);

  switchSymbols.forEach((symbol) => {
    const kind = symbolKind(symbol.type);
    const circuitType = circuitTypeBySymbol.get(symbol.id) ?? 'LINE';
    const hinted = bayMeta.get(symbol.id);
    const role = symbol.type === 'disconnector' ? nearestBusbarRole(symbol, doc, adjacency) : undefined;
    const inferred: BP109Meta = {
      enabled: true,
      voltageClass,
      prefix,
      circuitType: hinted?.circuitType ?? circuitType,
      circuitNumber: hinted?.circuitNumber ?? circuitNumbers.get(symbol.id) ?? 1,
      purposeDigit: hinted?.purposeDigit ?? defaultPurposeFor(kind, circuitType, role),
      suffixLetter: hinted?.suffixLetter ?? ''
    };
    result[symbol.id] = inferred;
  });

  return result;
}

function assignCircuitNumbers(
  symbols: ElectricalSymbol[],
  circuitTypeBySymbol: Map<string, CircuitType>,
  bayMeta: Map<string, Partial<BP109Meta>>,
  adjacency: Map<string, Set<string>>
): Map<string, number> {
  const result = new Map<string, number>();
  const byType = new Map<CircuitType, ElectricalSymbol[]>();

  symbols.forEach((symbol) => {
    const circuitType = bayMeta.get(symbol.id)?.circuitType ?? circuitTypeBySymbol.get(symbol.id) ?? 'LINE';
    const list = byType.get(circuitType) ?? [];
    list.push(symbol);
    byType.set(circuitType, list);
  });

  byType.forEach((items) => {
    const groups = bayGroups(items, adjacency);
    const sorted = groups.sort((a, b) => {
      const ax = Math.min(...a.map((id) => items.find((item) => item.id === id)!.position.x));
      const bx = Math.min(...b.map((id) => items.find((item) => item.id === id)!.position.x));
      return ax - bx;
    });
    sorted.forEach((group, index) => {
      const hinted = group
        .map((symbolId) => bayMeta.get(symbolId)?.circuitNumber)
        .find((value) => value !== undefined);
      const circuitNumber = hinted ?? index + 1;
      group.forEach((symbolId) => result.set(symbolId, circuitNumber));
    });
  });

  return result;
}

function bayGroups(symbols: ElectricalSymbol[], adjacency: Map<string, Set<string>>): string[][] {
  const ids = new Set(symbols.map((symbol) => symbol.id));
  const visited = new Set<string>();
  const groups: string[][] = [];

  symbols.forEach((symbol) => {
    if (visited.has(symbol.id)) return;
    const group: string[] = [];
    const queue = [symbol.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id) || !ids.has(id)) continue;
      visited.add(id);
      group.push(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor) && ids.has(neighbor)) queue.push(neighbor);
      }
    }
    if (group.length) groups.push(group);
  });

  return groups;
}

export function isBp109AnchorSymbol(symbol: ElectricalSymbol, doc: DrawingDocument): boolean {
  const voltageClass = voltageClassFromKv(substationVoltageKv(doc));
  return isAnchorSymbol(symbol, voltageClass);
}

export function labelFromBp109Meta(meta: BP109Meta): string {
  return computeBp109Label(meta);
}
