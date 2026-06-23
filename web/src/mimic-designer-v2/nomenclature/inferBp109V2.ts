import type { DrawingDocument, ElectricalSymbol } from '../drawing/model';
import { extractTopology } from '../topology/extractTopology';
import { computeBp109Label, defaultPurposeDigit, schemaDefaultPrefix, voltageClassFromKv } from '../../app/labeling/bp109';
import type { BusbarRole, BP109Meta, CircuitType, Prefix, PurposeDigit } from '../../app/labeling/types';
import { parseBp109Label, parseLineCircuitNumber } from './parseBp109';

const SWITCH_TYPES = new Set<ElectricalSymbol['type']>(['circuit-breaker', 'disconnector', 'earth-switch']);
const ENDPOINT_TYPES = new Set<ElectricalSymbol['type']>(['grid-connection', 'line-end', 'load', 'source', 'transformer']);
const LINE_ENDPOINT_TYPES = new Set<ElectricalSymbol['type']>(['grid-connection', 'line-end', 'load', 'source']);

function symbolKind(type: ElectricalSymbol['type']): string {
  if (type === 'circuit-breaker') return 'cb';
  if (type === 'disconnector') return 'ds';
  if (type === 'earth-switch') return 'es';
  if (type === 'transformer') return 'tx';
  if (type === 'ct') return 'ct';
  if (type === 'vt') return 'vt';
  return type;
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

function findBayEndpoint(symbol: ElectricalSymbol, doc: DrawingDocument): ElectricalSymbol | undefined {
  const lineEndpoints = doc.objects.symbols.filter((item) => LINE_ENDPOINT_TYPES.has(item.type));
  let best: { symbol: ElectricalSymbol; score: number } | undefined;
  lineEndpoints.forEach((endpoint) => {
    const dx = Math.abs(endpoint.position.x - symbol.position.x);
    const dy = endpoint.position.y - symbol.position.y;
    if (dx > 40 || dy > 20) return;
    const score = dx + Math.max(0, dy);
    if (!best || score < best.score) best = { symbol: endpoint, score };
  });
  return best?.symbol;
}

function classifyCircuitType(symbolId: string, doc: DrawingDocument, adjacency: Map<string, Set<string>>, bayMeta: Map<string, Partial<BP109Meta>>): CircuitType {
  const hinted = bayMeta.get(symbolId)?.circuitType;
  if (hinted) return hinted;

  const symbol = doc.objects.symbols.find((item) => item.id === symbolId);
  const override = symbol?.engineering?.bp109?.circuitType;
  if (override && override !== 'AUTO') return override as CircuitType;

  const endpoint = symbol ? findBayEndpoint(symbol, doc) : undefined;
  if (endpoint) {
    const endpointType = endpoint.engineering?.bp109?.circuitType;
    if (endpointType && endpointType !== 'AUTO') return endpointType as CircuitType;
    if (LINE_ENDPOINT_TYPES.has(endpoint.type)) return 'LINE';
  }

  const neighbors = [...(adjacency.get(symbolId) ?? [])];
  const neighborSymbols = neighbors.map((id) => doc.objects.symbols.find((item) => item.id === id)).filter(Boolean) as ElectricalSymbol[];
  if (neighborSymbols.some((item) => item.type === 'transformer')) return 'TX_HV';
  if (neighborSymbols.some((item) => LINE_ENDPOINT_TYPES.has(item.type))) return 'LINE';

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

function busbarAverageY(busbarId: string, doc: DrawingDocument): number {
  const busbar = doc.objects.busbars.find((item) => item.id === busbarId);
  if (!busbar?.vertices.length) return 0;
  return busbar.vertices.reduce((sum, vertex) => sum + vertex.y, 0) / busbar.vertices.length;
}

function nearestBusbarRole(symbol: ElectricalSymbol, doc: DrawingDocument, adjacency: Map<string, Set<string>>): BusbarRole | undefined {
  const busbarById = new Map(doc.objects.busbars.map((busbar) => [busbar.id, busbar]));
  const visited = new Set<string>([symbol.id]);
  const queue = [symbol.id];
  let best: { role: BusbarRole; distance: number } | undefined;

  while (queue.length) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      const busbar = busbarById.get(neighbor);
      if (busbar?.engineering?.busbarRole) {
        const distance = Math.abs(symbol.position.y - busbarAverageY(neighbor, doc));
        if (!best || distance < best.distance) best = { role: busbar.engineering.busbarRole, distance };
      }
      queue.push(neighbor);
    }
  }

  if (best) return best.role;

  const horizontal = doc.objects.busbars.filter((busbar) => {
    const ys = busbar.vertices.map((vertex) => vertex.y);
    return ys.length > 1 && Math.max(...ys) - Math.min(...ys) < 12;
  });
  if (horizontal.length < 2) return undefined;

  const ranked = horizontal
    .map((busbar) => ({
      busbar,
      y: busbar.vertices.reduce((sum, vertex) => sum + vertex.y, 0) / busbar.vertices.length,
      distance: Math.abs(symbol.position.y - (busbar.vertices.reduce((sum, vertex) => sum + vertex.y, 0) / busbar.vertices.length))
    }))
    .sort((a, b) => a.distance - b.distance);
  const nearest = ranked[0];
  if (!nearest) return undefined;
  if (nearest.busbar.engineering?.busbarRole) return nearest.busbar.engineering.busbarRole;

  const rows = [...new Set(horizontal.map((busbar) => Math.round(busbar.vertices[0]!.y / 20) * 20))].sort((a, b) => a - b);
  if (rows.length < 2) return undefined;
  if (Math.abs(nearest.y - rows[0]!) < 20) return 'main';
  if (Math.abs(nearest.y - rows[rows.length - 1]!) < 20) return 'reserve';
  return undefined;
}

function bayDistanceFromEndpoint(symbol: ElectricalSymbol, endpoint: ElectricalSymbol): number {
  return Math.hypot(symbol.position.x - endpoint.position.x, symbol.position.y - endpoint.position.y);
}

function inferPurposeDigit(
  symbol: ElectricalSymbol,
  circuitType: CircuitType,
  doc: DrawingDocument,
  adjacency: Map<string, Set<string>>,
  endpoint?: ElectricalSymbol
): PurposeDigit {
  const kind = symbolKind(symbol.type);
  if (kind === 'cb') return defaultPurposeDigit('cb', circuitType);
  if (kind === 'es') return defaultPurposeDigit('es', circuitType);
  if (kind !== 'ds') return defaultPurposeDigit(kind, circuitType);

  if (circuitType === 'LINE' && endpoint) {
    const bayDisconnectors = doc.objects.symbols.filter((item) => {
      if (item.type !== 'disconnector') return false;
      return verticalBaySymbols(endpoint, doc).has(item.id) || collectBaySymbols(endpoint.id, doc, adjacency).has(item.id);
    });
    const furthest = [...bayDisconnectors].sort((a, b) => bayDistanceFromEndpoint(b, endpoint) - bayDistanceFromEndpoint(a, endpoint))[0];
    if (furthest?.id === symbol.id) return 3;
  }

  const role = nearestBusbarRole(symbol, doc, adjacency);
  if (role?.includes('main')) return 4;
  if (role?.includes('reserve')) return 6;

  return defaultPurposeDigit('ds', circuitType);
}

function asCircuitType(value?: string): CircuitType | undefined {
  if (!value || value === 'AUTO') return undefined;
  return value as CircuitType;
}

function asPurposeDigit(value?: number): PurposeDigit | undefined {
  if (value === undefined) return undefined;
  return Math.max(0, Math.min(9, Math.floor(value))) as PurposeDigit;
}

function asPrefix(value: string | undefined, voltageClass: ReturnType<typeof voltageClassFromKv>): Prefix {
  if (value === 'X' || value === 'D' || value === '') return value;
  return schemaDefaultPrefix(voltageClass);
}

function anchorMetaForSymbol(symbol: ElectricalSymbol, voltageClass: ReturnType<typeof voltageClassFromKv>): Partial<BP109Meta> | null {
  const engineering = symbol.engineering?.bp109;
  if (engineering?.circuitNumber !== undefined || engineering?.circuitType) {
    const circuitType = asCircuitType(engineering.circuitType);
    return {
      enabled: true,
      voltageClass,
      prefix: asPrefix(engineering.prefix, voltageClass),
      circuitType: circuitType ?? 'LINE',
      circuitNumber: engineering.circuitNumber,
      purposeDigit: asPurposeDigit(engineering.purposeDigit),
      suffixLetter: engineering.suffixLetter ?? ''
    };
  }

  if (!symbol.label?.text) return null;
  const parsed = parseBp109Label(symbol.label.text, voltageClass);
  if (parsed) return parsed;

  const circuitNumber = parseLineCircuitNumber(symbol.label.text);
  if (circuitNumber !== null && LINE_ENDPOINT_TYPES.has(symbol.type)) {
    return {
      enabled: true,
      voltageClass,
      prefix: schemaDefaultPrefix(voltageClass),
      circuitType: asCircuitType(engineering?.circuitType) ?? 'LINE',
      circuitNumber
    };
  }

  return null;
}

function isAnchorSymbol(symbol: ElectricalSymbol, voltageClass: ReturnType<typeof voltageClassFromKv>): boolean {
  if (symbol.engineering?.bp109?.circuitNumber !== undefined) return true;
  if (symbol.engineering?.bp109?.circuitType && symbol.engineering.bp109.circuitType !== 'AUTO') return true;
  if (!symbol.label?.text || !symbol.label.manualOverride) return false;
  if (parseBp109Label(symbol.label.text, voltageClass)) return true;
  if (LINE_ENDPOINT_TYPES.has(symbol.type) && parseLineCircuitNumber(symbol.label.text) !== null) return true;
  return false;
}

function propagateBayMeta(
  bay: Set<string>,
  anchor: Partial<BP109Meta>,
  bayMeta: Map<string, Partial<BP109Meta>>
) {
  bay.forEach((symbolId) => {
    const existing = bayMeta.get(symbolId) ?? {};
    bayMeta.set(symbolId, {
      ...existing,
      circuitNumber: anchor.circuitNumber ?? existing.circuitNumber,
      circuitType: anchor.circuitType ?? existing.circuitType
    });
  });
}

export function inferBp109MetaForDocument(doc: DrawingDocument): Record<string, BP109Meta> {
  const voltageClass = voltageClassFromKv(substationVoltageKv(doc));
  const prefix = schemaDefaultPrefix(voltageClass);
  const adjacency = buildSymbolAdjacency(doc);
  const result: Record<string, BP109Meta> = {};
  const bayMeta = new Map<string, Partial<BP109Meta>>();

  const endpoints = doc.objects.symbols.filter((symbol) => LINE_ENDPOINT_TYPES.has(symbol.type));
  endpoints.forEach((endpoint) => {
    const anchor = anchorMetaForSymbol(endpoint, voltageClass);
    if (!anchor?.circuitNumber && !anchor?.circuitType) return;
    const bay = new Set([
      ...collectBaySymbols(endpoint.id, doc, adjacency),
      ...verticalBaySymbols(endpoint, doc)
    ]);
    propagateBayMeta(bay, anchor, bayMeta);
    if (anchor.circuitNumber !== undefined) {
      bayMeta.set(endpoint.id, {
        ...bayMeta.get(endpoint.id),
        circuitNumber: anchor.circuitNumber,
        circuitType: anchor.circuitType ?? 'LINE'
      });
    }
  });

  doc.objects.symbols.forEach((symbol) => {
    if (!SWITCH_TYPES.has(symbol.type) && symbol.type !== 'ct' && symbol.type !== 'vt') return;
    const anchor = anchorMetaForSymbol(symbol, voltageClass);
    if (!anchor || !isAnchorSymbol(symbol, voltageClass)) return;
    const bay = new Set([
      ...collectBaySymbols(symbol.id, doc, adjacency),
      ...verticalBaySymbols(findBayEndpoint(symbol, doc) ?? symbol, doc)
    ]);
    propagateBayMeta(bay, anchor, bayMeta);
  });

  const switchSymbols = doc.objects.symbols.filter((symbol) => SWITCH_TYPES.has(symbol.type) || symbol.type === 'ct' || symbol.type === 'vt');
  const circuitTypeBySymbol = new Map<string, CircuitType>();
  switchSymbols.forEach((symbol) => {
    circuitTypeBySymbol.set(symbol.id, classifyCircuitType(symbol.id, doc, adjacency, bayMeta));
  });

  const circuitNumbers = assignCircuitNumbers(switchSymbols, circuitTypeBySymbol, bayMeta, adjacency);

  switchSymbols.forEach((symbol) => {
    const circuitType = bayMeta.get(symbol.id)?.circuitType ?? circuitTypeBySymbol.get(symbol.id) ?? 'LINE';
    const endpoint = findBayEndpoint(symbol, doc);
    const inferred: BP109Meta = {
      enabled: true,
      voltageClass,
      prefix,
      circuitType,
      circuitNumber: bayMeta.get(symbol.id)?.circuitNumber ?? circuitNumbers.get(symbol.id) ?? 1,
      purposeDigit: inferPurposeDigit(symbol, circuitType, doc, adjacency, endpoint),
      suffixLetter: bayMeta.get(symbol.id)?.suffixLetter ?? ''
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
